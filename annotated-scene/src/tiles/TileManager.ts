/**
 *  Copyright 2017 Mapper Inc. Part of the mapper-annotator project.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import {OrderedMap, OrderedSet} from 'immutable'
import * as lodash from 'lodash'
import * as THREE from 'three'
import TileManagerBase from './TileManagerBase'
import {TileMessage} from '../tiles/tile-model/TileMessage'
import {NullTileContents} from '../tiles/tile-model/TileContents'
import {SuperTile} from './SuperTile'
import {UtmTile} from './UtmTile'
import {UtmCoordinateSystem} from '../UtmCoordinateSystem'
import {convertToStandardCoordinateFrame, CoordinateFrameType} from '../geometry/CoordinateFrame'
import {Scale3D} from '../geometry/Scale3D'
import {ScaleProvider} from './ScaleProvider'
import {TileIndex, tileIndexFromVector3} from '../tiles/tile-model/TileIndex'
import {tileSearchOffset, MapperTileServiceClient, GrpcTileServiceClient, RestTileServiceClient} from './TileServiceClient'
import {RangeSearch} from '../tiles/tile-model/RangeSearch'
import {TileInstance} from '../tiles/tile-model/TileInstance'
import AnnotatedSceneActions from '../store/actions/AnnotatedSceneActions'
import {EventEmitter} from 'events'
import Logger from '../util/log'
import {LayerId} from '../TypeAlias'
import {Events} from '../models/Events'

const log = Logger(__filename)

export class BusyError extends Error {}

// An empty shell used for initializing TileManager's origin.
function makeTileMessageForCurrentUtmZone(origin: THREE.Vector3): TileMessage {
	return {
		origin: origin,
		utmZoneNumber: 10, // TODO CLYDE get these from config? read from an API call?
		utmZoneNorthernHemisphere: true,
		contents: {} as NullTileContents,
	}
}

export interface TileManagerConfig {
	layerId: LayerId // Each TileManager gets all its data from a single layer of tiles.
	initialSuperTilesToLoad: number // preload some super tiles; initially we don't know how many objects they will contain
	maximumSuperTilesToLoad: number // sanity check so we don't load lots of very sparse or empty super tiles
	maximumObjectsToLoad: number // after loading super tiles we can trim them back by count of their contents (either points or annotations)
}
// TileManager loads tile data from the network. Tiles are aggregated into SuperTiles,
// which serve as a local cache for chunks of tile data.
// All objects are stored with reference to UTM origin and offset, but using the local coordinate
// system which has different axes.
export abstract class TileManager implements TileManagerBase {
	protected tileConfig: TileManagerConfig
	protected coordinateSystemInitialized: boolean // indicates that this TileManager passed checkCoordinateSystem() and set an origin // todo ?
	superTiles: OrderedMap<string, SuperTile> // all super tiles which we are aware of
	// Keys to super tiles which have objects loaded in memory. It is ordered so that it works as a least-recently-used
	// cache when it comes time to unload excess super tiles.
	private loadedSuperTileKeys: OrderedSet<string>
	// TileManager makes some assumptions about the state of super tiles and their contents which lead to problems
	// with asynchronous requests to load them. Allow only one request at a time.
	protected _isLoadingTiles: boolean
	private loadedObjectsBoundingBox: THREE.Box3 | null // cached state of what has been loaded by all super tiles
	protected utmTileScale: Scale3D
	protected superTileScale: Scale3D
	protected enableTileManagerStats: boolean

	constructor(
		scaleProvider: ScaleProvider,
		protected utmCoordinateSystem: UtmCoordinateSystem,
		protected tileServiceClient: MapperTileServiceClient,
		protected channel: EventEmitter,
		config: any /* eslint-disable-line typescript/no-explicit-any */,
	) {
		this.coordinateSystemInitialized = false
		this.superTiles = OrderedMap()
		this.loadedSuperTileKeys = OrderedSet()
		this._isLoadingTiles = false
		this.loadedObjectsBoundingBox = null

		this.utmTileScale = scaleProvider.utmTileScale
		this.superTileScale = scaleProvider.superTileScale

		this.enableTileManagerStats = !!config['tile_manager.stats_display.enable']
	}

	private enumerateOneRange(scale: Scale3D, search: RangeSearch): TileIndex[] {
		const min = tileIndexFromVector3(scale, search.minPoint)
		const max = tileIndexFromVector3(scale, search.maxPoint)
		const indexes: TileIndex[] = []
		const minX = min.xIndex < max.xIndex ? min.xIndex : max.xIndex
		const maxX = min.xIndex < max.xIndex ? max.xIndex : min.xIndex
		const minY = min.yIndex < max.yIndex ? min.yIndex : max.yIndex
		const maxY = min.yIndex < max.yIndex ? max.yIndex : min.yIndex
		const minZ = min.zIndex < max.zIndex ? min.zIndex : max.zIndex
		const maxZ = min.zIndex < max.zIndex ? max.zIndex : min.zIndex

		for (let x = minX; x <= maxX; x++) {
			for (let y = minY; y <= maxY; y++) {
				for (let z = minZ; z <= maxZ; z++)
					indexes.push(min.copy(x, y, z))
			}
		}

		return indexes
	}

	// SuperTiles have a simple caching strategy for their constituent tiles; that is, they cache
	// data for tiles they already know about. We make it simpler by populating all the constituent
	// tiles up front. Then we can treat a SuperTile as the basic unit of cache within TileManager.
	// This expands the input range searches to cover the entire volume of the SuperTiles that are
	// intersected by the searches, and it converts the ranges to an array of all those SuperTiles.
	private enumerateIntersectingSuperTileIndexes(searches: RangeSearch[]): TileIndex[] {
		switch (searches.length) {
			case 0:
				return []
			case 1:
				return this.enumerateOneRange(this.superTileScale, searches[0])
			default:
				const enumerations = searches.map(search => this.enumerateOneRange(this.superTileScale, search))
				const uniqueTileIndexes = enumerations[0]
				const seen: Set<string> = new Set(uniqueTileIndexes.map(ti => ti.toString()))

				for (let n = 1; n < enumerations.length; n++) {
					enumerations[n].forEach(ti => {
						if (!seen.has(ti.toString())) {
							seen.add(ti.toString())
							uniqueTileIndexes.push(ti)
						}
					})
				}

				return uniqueTileIndexes
		}
	}

	// Enumerate the tiles contained within a SuperTile.
	private superTileIndexesToTileIndexes(superTilesIndexes: TileIndex[]): TileIndex[] {
		return lodash.flatten(superTilesIndexes.map(stIndex =>
			this.enumerateOneRange(this.utmTileScale, {
				minPoint: stIndex.boundingBox.min,
				maxPoint: stIndex.boundingBox.max.clone().addScalar(tileSearchOffset),
			})
		))
	}

	protected abstract constructSuperTile(index: TileIndex, coordinateFrame: CoordinateFrameType, utmCoordinateSystem: UtmCoordinateSystem): SuperTile

	protected abstract setStatsMessage(): void

	// Update state of which super tiles are loaded.
	private setLoadedSuperTileKeys(newKeys: OrderedSet<string>): void {
		this.loadedSuperTileKeys = newKeys
	}

	private getOrCreateSuperTile(utmIndex: TileIndex, coordinateFrame: CoordinateFrameType): SuperTile {
		const key = utmIndex.toString()

		if (!this.superTiles.has(key)) {
			const superTile = this.constructSuperTile(utmIndex, coordinateFrame, this.utmCoordinateSystem)

			this.superTiles = this.superTiles.set(key, superTile)
			this.channel.emit(Events.SUPER_TILE_CREATED, superTile)
			this.setStatsMessage()
		}

		return this.superTiles.get(key)
	}

	// "default" according to protobuf rules for default values
	private static isDefaultUtmZone(num: number, northernHemisphere: boolean): boolean {
		return num === 0 && northernHemisphere === false
	}

	// The first tile we see defines the local origin and UTM zone for the lifetime of the application.
	// All other data is expected to lie in the same zone.
	// TODO JOE in the future we need to change the origin if we get far away
	// from the Three.js origin, to prevent graphical jitter from floating-point
	// precision error.
	protected checkCoordinateSystem(msg: TileMessage, inputCoordinateFrame: CoordinateFrameType): boolean {
		const num = msg.utmZoneNumber
		const northernHemisphere = msg.utmZoneNorthernHemisphere

		if (!num || northernHemisphere === null) return false

		const p = convertToStandardCoordinateFrame(msg.origin, inputCoordinateFrame)

		if (this.utmCoordinateSystem.setOrigin(num, northernHemisphere, p)) {
			return true
		} else {
			return TileManager.isDefaultUtmZone(num, northernHemisphere) ||
				this.utmCoordinateSystem.zoneMatch(num, northernHemisphere)
		}
	}

	// Given a range search, find all intersecting super tiles. Load tile data for as many
	// as allowed by configuration, or all if loadAllObjects.
	// Side effect: Prune old SuperTiles as necessary.
	// Returns true if super tiles were loaded.
	loadFromMapServer(searches: RangeSearch[], coordinateFrame: CoordinateFrameType, loadAllObjects = false): Promise<boolean> {
		if (this.isLoadingTiles) return Promise.reject(new BusyError('busy loading tiles'))

		this._isLoadingTiles = true
		new AnnotatedSceneActions().addLoadingTileManager(this)

		return this.resetIsLoadingTiles(
			this.loadFromMapServerImpl(searches, coordinateFrame, loadAllObjects)
		)
	}

	get isLoadingTiles(): boolean {
		return this._isLoadingTiles
	}

	protected resetIsLoadingTiles(tileLoadedResult: Promise<boolean>): Promise<boolean> {
		return tileLoadedResult
			.then(loaded => {
				this._isLoadingTiles = false
				new AnnotatedSceneActions().removeLoadingTileManager(this)
				return loaded
			})
			.catch(err => {
				this._isLoadingTiles = false
				new AnnotatedSceneActions().removeLoadingTileManager(this)
				throw err
			})
	}

	// The useful bits of loadFromMapServer()
	protected loadFromMapServerImpl(searches: RangeSearch[], coordinateFrame: CoordinateFrameType, loadAllObjects = false): Promise<boolean> {
		// Figure out which super tiles to load.
		const allStIndexes = this.enumerateIntersectingSuperTileIndexes(searches)
		const filteredStIndexes = allStIndexes
			.filter(sti => this.superTiles.get(sti.toString()) === undefined)

		if (!filteredStIndexes.length) return Promise.resolve(false)

		if (!loadAllObjects && filteredStIndexes.length > this.tileConfig.initialSuperTilesToLoad) filteredStIndexes.length = this.tileConfig.initialSuperTilesToLoad

		// Ensure that we have a valid coordinate system before doing anything else.
		let firstTilePromise: Promise<void>

		if (this.coordinateSystemInitialized) {
			firstTilePromise = Promise.resolve()
		} else {
			const originTile = makeTileMessageForCurrentUtmZone(filteredStIndexes[0].origin)

			if (this.checkCoordinateSystem(originTile, coordinateFrame)) {
				firstTilePromise = Promise.resolve()
				this.coordinateSystemInitialized = true
			} else {
				firstTilePromise = Promise.reject(Error(
					'checkCoordinateSystem failed on first tile at: ' +
					originTile.utmZoneNumber +
					originTile.utmZoneNorthernHemisphere +
					' ' + originTile.origin.x + ', ' + originTile.origin.y + ', ' + originTile.origin.z
				))
			}
		}

		// Break the super tiles into tiles, get tile metadata from the API client, and pack it all back into super tiles.
		const allTilesLoaded = firstTilePromise
			.then(() => {
				// Create records for all SuperTiles in the request, even if they prove to be empty--since that's useful to know for statistics.
				filteredStIndexes.forEach(stIndex => this.getOrCreateSuperTile(stIndex, coordinateFrame))

				let allTilesPromise: Promise<void>

				const tsc = this.tileServiceClient

				if (tsc instanceof GrpcTileServiceClient) {
					const tileLoadResults = filteredStIndexes.map(stIndex => {
						const superTileSearch = {
							minPoint: stIndex.boundingBox.min,
							maxPoint: stIndex.boundingBox.max,
						}
						// TODO clyde merge these into fewer API requests
						const tileInstancesPromise = tsc.getTilesByCoordinateRange(this.tileConfig.layerId, superTileSearch)

						return tileInstancesPromise
							.then(tileInstances => this.loadTileInstancesToSuperTiles(coordinateFrame, tileInstances))
					})

					allTilesPromise = Promise.all(tileLoadResults)
						.then(() => {})
				} else if (tsc instanceof RestTileServiceClient) {
					const tileIds = this.superTileIndexesToTileIndexes(filteredStIndexes)
					const tileInstancesPromise = tsc.getTilesByTileIds(this.tileConfig.layerId, tileIds)

					allTilesPromise = tileInstancesPromise
						.then(tileInstances => this.loadTileInstancesToSuperTiles(coordinateFrame, tileInstances))
				} else {
					throw TypeError(`unknown tileServiceClient: ${this.tileServiceClient}`)
				}

				return allTilesPromise
			})

		// Load the contents of the new tiles.
		return allTilesLoaded.then(() => {
			const promises = this.tileIndexesToSuperTiles(filteredStIndexes)
				.map(st => this.loadSuperTile(st))

			return Promise.all(promises)
		})
			.then(() => this.pruneSuperTiles())
			.then(() => true) // true because we loaded some SuperTiles
	}

	private loadTileInstancesToSuperTiles(coordinateFrame: CoordinateFrameType, tileInstances: TileInstance[]): void {
		tileInstances.forEach(tileInstance => {
			const utmTile = this.tileInstanceToUtmTile(tileInstance, coordinateFrame)

			this.addTileToSuperTile(utmTile, coordinateFrame, tileInstance.url)
		})
	}

	// Finish packing up a TileInstance so that it can load its own data and attach to a SuperTile.
	protected abstract tileInstanceToUtmTile(tileInstance: TileInstance, coordinateFrame: CoordinateFrameType): UtmTile

	// Look up SuperTiles (that have already been instantiated) for a list of indexes.
	private tileIndexesToSuperTiles(superTileIndexList: TileIndex[]): SuperTile[] {
		return superTileIndexList
			.filter(sti => this.superTiles.has(sti.toString()))
			.map(sti => this.superTiles.get(sti.toString()))
	}

	// Tiles are collected into super tiles. Later the super tiles will manage loading and unloading their tile data.
	protected addTileToSuperTile(utmTile: UtmTile, coordinateFrame: CoordinateFrameType, tileName: string): void {
		const superTile = this.getOrCreateSuperTile(utmTile.superTileIndex(this.superTileScale), coordinateFrame)

		if (!superTile.addTile(utmTile)) log.warn(`addTile() to ${superTile.key()} failed for ${tileName}`)
	}

	protected loadSuperTile(superTile: SuperTile): Promise<boolean> {
		if (this.loadedSuperTileKeys.contains(superTile.key())) {
			// Move it to the end of the queue for pruning super tiles.
			if (this.loadedSuperTileKeys.last() !== superTile.key()) {
				this.loadedSuperTileKeys.delete(superTile.key())
				this.loadedSuperTileKeys.add(superTile.key())
			}

			return Promise.resolve(true)
		} else {
			return superTile.loadContents()
				.then(success => {
					if (success) {
						this.loadedObjectsBoundingBox = null
						this.setLoadedSuperTileKeys(this.loadedSuperTileKeys.add(superTile.key()))
						this.superTiles = this.superTiles.set(superTile.key(), superTile)
						this.channel.emit(Events.SUPER_TILE_CREATED, superTile)

						this.setStatsMessage()
					}

					return success
				})
		}
	}

	private unloadSuperTile(superTile: SuperTile): boolean {
		this.superTiles = this.superTiles.remove(superTile.key())

		this.channel.emit(Events.SUPER_TILE_REMOVED, superTile)
		this.loadedObjectsBoundingBox = null
		this.setLoadedSuperTileKeys(this.loadedSuperTileKeys.remove(superTile.key()))
		return true
	}

	// When we exceed maximumSuperTilesToLoad or maximumObjectsToLoad, unload old SuperTiles, keeping a minimum of one in memory.
	private pruneSuperTiles(): void {
		let currentObjectCount = this.objectCount()
		let superTilesCount = this.loadedSuperTileKeys.size

		while (
			superTilesCount > 1 &&
			(superTilesCount > this.tileConfig.maximumSuperTilesToLoad || currentObjectCount > this.tileConfig.maximumObjectsToLoad)
		) {
			const oldestKey = this.loadedSuperTileKeys.first()
			const foundSuperTile = this.superTiles.get(oldestKey)

			if (foundSuperTile) {
				const superTileObjectCount = foundSuperTile.objectCount

				if (this.unloadSuperTile(foundSuperTile)) {
					currentObjectCount -= superTileObjectCount
					superTilesCount--
				}
			}
		}
	}

	// The number of objects in all SuperTiles which have been loaded to memory.
	objectCount(): number {
		let count = 0

		this.superTiles.forEach(st => {
			count += st!.objectCount
		})

		return count
	}

	// Bounding box of the union of all loaded objects.
	getLoadedObjectsBoundingBox(): THREE.Box3 | null {
		if (this.loadedObjectsBoundingBox) {
			return this.loadedObjectsBoundingBox
		} else if (this.superTiles.isEmpty()) {
			return null
		} else {
			let bbox = new THREE.Box3()

			this.superTiles.forEach(st => {
				const newBbox = st!.getContentsBoundingBox()

				if (newBbox && newBbox.min.x !== null && newBbox.min.x !== Infinity)
					bbox = bbox.union(newBbox)
			})

			if (bbox.min.x === null || bbox.min.x === Infinity)
				this.loadedObjectsBoundingBox = null
			else
				this.loadedObjectsBoundingBox = bbox

			return this.loadedObjectsBoundingBox
		}
	}

	/**
	 * Finds the center of the bottom of the bounding box, so that when we view the model
	 * the whole thing appears above the artificial ground plane.
	 */
	centerPoint(): THREE.Vector3 | null {
		const bbox = this.getLoadedObjectsBoundingBox()

		if (bbox)
			return bbox.getCenter().setY(bbox.min.y)
		else
			return null
	}

	// Clean slate
	unloadAllTiles(): boolean {
		if (this.isLoadingTiles) return false

		this.superTiles.forEach(st => this.unloadSuperTile(st!))
		return true
	}
}
