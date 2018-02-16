/**
 *  Copyright 2017 Mapper Inc. Part of the mapper-annotator project.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

const config = require('../../config')
import * as Fs from 'fs'
import * as Path from 'path'
import * as AsyncFile from 'async-file'
import * as lodash from 'lodash'
import {Option, none, option} from 'ts-option'
import {OrderedMap, OrderedSet} from 'immutable'
import * as THREE from 'three'
import * as MapperProtos from '@mapperai/mapper-models'
import Models = MapperProtos.mapper.models
import * as TypeLogger from 'typelogger'
import {
	baseGeometryTileMessageToTileMessage, pointCloudTileMessageToTileMessage,
	TileMessage, TileMessageFormat
} from "./TileMessage"
import {SuperTile} from "./SuperTile"
import {UtmTile} from "./UtmTile"
import {UtmInterface} from "../UtmInterface"
import {BufferGeometry} from "three"
import {convertToStandardCoordinateFrame, CoordinateFrameType} from "../geometry/CoordinateFrame"
import {Scale3D} from "../geometry/Scale3D"
import {TileIndex, tileIndexFromVector3} from "../model/TileIndex"
import LocalStorage from "../state/LocalStorage"
import {TileServiceClient} from "./TileServiceClient"
import {RangeSearch} from "../model/RangeSearch"
import {isTupleOfNumbers} from "../util/Validation"

// tslint:disable-next-line:no-any
TypeLogger.setLoggerOutput(console as any)
const log = TypeLogger.getLogger(__filename)

// Set the dimensions of tiles and super tiles.
// Super tile boundaries coincide with tile boundaries, with no overlap.
function configToSharedScale(key: string): Scale3D {
	const tileScaleConfig: [number, number, number] = config.get(key) || [10, 10, 10]
	if (!isTupleOfNumbers(tileScaleConfig, 3))
		throw Error(`invalid ${key} configuration '${tileScaleConfig}'`)
	return new Scale3D(tileScaleConfig)
}
const utmTileScale = configToSharedScale('tile_manager.utm_tile_scale')
const superTileScale = configToSharedScale('tile_manager.super_tile_scale')
if (!superTileScale.isMultipleOf(utmTileScale))
	throw Error('super_tile_scale must be a multiple of utm_tile_scale')

const threeDStepSize: number = 3
const loadedSuperTileKeysKey = 'loadedSuperTileKeys'
let warningDelivered = false

export class BusyError extends Error {}

function loadBaseGeometryTileMessage(filename: string): Promise<TileMessage> {
	return AsyncFile.readFile(filename)
		.then(buffer => Models.BaseGeometryTileMessage.decode(buffer))
		.catch(err => {throw Error('protobuf read failed: ' + err.message)})
		.then(msg => baseGeometryTileMessageToTileMessage(msg))
}

function loadPointCloudTileMessage(filename: string): Promise<TileMessage> {
	return AsyncFile.readFile(filename)
		.then(buffer => Models.PointCloudTileMessage.decode(buffer))
		.catch(err => {throw Error('protobuf read failed: ' + err.message)})
		.then(msg => {
			// Perception doesn't set UTM zone correctly. For now we have to assume the data are from San Francisco.
			if (!warningDelivered) {
				log.warn('forcing tiles into UTM zone 10N')
				warningDelivered = true
			}
			msg.utmZoneNumber = 10
			msg.utmZoneNorthernHemisphere = true
			return msg
		})
		.then(msg => pointCloudTileMessageToTileMessage(msg))
}

interface TileMetadata {
	name: string // file name
	index: THREE.Vector3 // scaled address in 3D space
}

// Infer the dimensions of a tile from its file name.
function tileFileNameToTileMetadata(name: string): TileMetadata | null {
	if (!name)
		return null

	const parts = name.split('.')
	if (parts.length !== 2 || parts[1] !== 'md')
		return null

	const index = parts[0].split('_')
		.map(n => parseInt(n, 10))
	if (index.length !== 3)
		return null
	let nan = 0
	index.forEach(n => {if (isNaN(n)) nan++})
	if (nan)
		return null

	return {
		name: name,
		index: new THREE.Vector3(index[0], index[1], index[2]),
	}
}

const sampleData = (msg: TileMessage, step: number): Array<Array<number>> => {
	if (step <= 0) {
		log.error("Can't sample data. Step should be > 0.")
		return []
	}
	if (!msg.points) {
		log.error("tile message is missing points")
		return []
	}
	if (!msg.colors) {
		log.error("tile message is missing colors")
		return []
	}

	const sampledPoints: Array<number> = []
	const sampledColors: Array<number> = []
	const stride = step * threeDStepSize

	for (let i = 0; i < msg.points.length; i += stride) {
		// Assuming the utm points are: easting, northing, altitude
		sampledPoints.push(msg.points[i])
		sampledPoints.push(msg.points[i + 1])
		sampledPoints.push(msg.points[i + 2])
		sampledColors.push(msg.colors[i])
		sampledColors.push(msg.colors[i + 1])
		sampledColors.push(msg.colors[i + 2])
	}
	return [sampledPoints, sampledColors]
}

// An empty shell used for initializing TileManager's origin.
function makeTileMessageForCurrentUtmZone(origin: THREE.Vector3): TileMessage {
	return {
		origin: origin,
		utmZoneNumber: 10, // TODO get these from config? read from an API call?
		utmZoneNorthernHemisphere: true,
		points: [],
		colors: [],
		intensities: [],
	}
}

// SuperTiles have a simple caching strategy for their constituent tiles; that is, they cache
// data for tiles they already know about. We make it simpler by populating all the constituent
// tiles up front. Then we can treat a SuperTile as the basic unit of cache within TileManager.
// This expands the input range search to cover the entire volume of the SuperTiles that are
// intersected by the search, and it converts the range to an array of all those SuperTiles.
function enumerateIntersectingSuperTileIndexes(search: RangeSearch): TileIndex[] {
	const min = tileIndexFromVector3(superTileScale, search.minPoint)
	const max = tileIndexFromVector3(superTileScale, search.maxPoint)
	const indexes: TileIndex[] = []
	const minX = min.xIndex < max.xIndex ? min.xIndex : max.xIndex
	const maxX = min.xIndex < max.xIndex ? max.xIndex : min.xIndex
	const minY = min.yIndex < max.yIndex ? min.yIndex : max.yIndex
	const maxY = min.yIndex < max.yIndex ? max.yIndex : min.yIndex
	const minZ = min.zIndex < max.zIndex ? min.zIndex : max.zIndex
	const maxZ = min.zIndex < max.zIndex ? max.zIndex : min.zIndex
	for (let x = minX; x <= maxX; x++) {
		for (let y = minY; y <= maxY; y++) {
			for (let z = minZ; z <= maxZ; z++) {
				indexes.push(min.copy(x, y, z))
			}
		}
	}
	return indexes
}

// TileManager loads tile data from disk or from the network. Tiles are aggregated into SuperTiles,
// which serve as a local cache for chunks of tile data.
export class TileManager extends UtmInterface {
	private storage: LocalStorage // persistent state for UI settings
	private coordinateSystemInitialized: boolean // indicates that this TileManager passed checkCoordinateSystem() and set an origin
	hasGeometry: boolean
	superTiles: OrderedMap<string, SuperTile> // all super tiles which we are aware of
	// Keys to super tiles which have points loaded in memory. It is ordered so that it works as a least-recently-used
	// cache when it comes time to unload excess super tiles.
	loadedSuperTileKeys: OrderedSet<string>
	// This composite point cloud contains all super tile data, in a single structure for three.js rendering.
	// All points are stored with reference to UTM origin and offset,
	// but using the local coordinate system which has different axes.
	pointCloud: THREE.Points
	// TileManager makes some assumptions about the state of super tiles and point clouds which lead to problems
	// with asynchronous requests to load points. Allow only one request at a time.
	private isLoadingPointCloud: boolean
	voxelsMeshGroup: Array<THREE.Mesh>
	voxelsDictionary: Set<THREE.Vector3>
	voxelsHeight: Array<number>
	voxelSize: number
	private voxelsMaxHeight: number
	private HSVGradient: Array<THREE.Vector3>
	private onSuperTileUnload: (superTile: SuperTile) => void
	private tileMessageFormat: TileMessageFormat
	private initialSuperTilesToLoad: number // preload some super tiles; initially we don't know how many points they will contain
	private maximumPointsToLoad: number // after loading super tiles we can trim them back by point count
	private samplingStep: number
	private tileServiceClient: TileServiceClient

	constructor(onSuperTileUnload: (superTile: SuperTile) => void) {
		super()
		this.storage = new LocalStorage()
		this.coordinateSystemInitialized = false
		this.onSuperTileUnload = onSuperTileUnload
		this.hasGeometry = false
		this.superTiles = OrderedMap()
		this.loadedSuperTileKeys = OrderedSet()
		const pointsSize = parseFloat(config.get('annotator.point_render_size')) || 1
		this.pointCloud = new THREE.Points(
			new THREE.BufferGeometry(),
			new THREE.PointsMaterial({size: pointsSize, vertexColors: THREE.VertexColors})
		)
		this.isLoadingPointCloud = false
		this.voxelsMeshGroup = []
		this.voxelsHeight = []
		this.voxelsDictionary = new Set<THREE.Vector3>()
		this.voxelSize = 0.15
		this.voxelsMaxHeight = 7
		this.HSVGradient = []
		this.generateGradient()
		this.tileMessageFormat = TileMessageFormat[config.get('tile_manager.tile_message_format') as string]
		if (!this.tileMessageFormat)
			throw Error('bad tile_manager.tile_message_format: ' + config.get('tile_manager.tile_message_format'))
		this.initialSuperTilesToLoad = parseInt(config.get('tile_manager.initial_super_tiles_to_load'), 10) || 4
		this.maximumPointsToLoad = parseInt(config.get('tile_manager.maximum_points_to_load'), 10) || 100000
		this.samplingStep = parseInt(config.get('tile_manager.sampling_step'), 10) || 5
		this.tileServiceClient = new TileServiceClient()
	}

	toString(): string {
		let offsetStr
		if (this.offset === undefined) {
			offsetStr = 'undefined'
		} else {
			offsetStr = this.offset.x + ',' + this.offset.y + ',' + this.offset.z
		}
		return 'TileManager(UTM Zone: ' + this.utmZoneNumber + this.utmZoneNorthernHemisphere + ', offset: [' + offsetStr + '])'
	}

	// Update state of which super tiles are loaded; and save that state for use when the application is reloaded.
	private setLoadedSuperTileKeys(newKeys: OrderedSet<string>): void {
		this.loadedSuperTileKeys = newKeys
		this.setSuperTilesPreference()
	}

	private setSuperTilesPreference(): void {
		this.storage.setItem(loadedSuperTileKeysKey, JSON.stringify(this.loadedSuperTileKeys.toArray()))
	}

	private getSuperTilesPreference(): Option<OrderedSet<string>> {
		try {
			return option(this.storage.getItem(loadedSuperTileKeysKey))
				.map(stored => OrderedSet(JSON.parse(stored!)))
		} catch (_) {
			return none
		}
	}

	private getOrCreateSuperTile(utmIndex: TileIndex, coordinateFrame: CoordinateFrameType): SuperTile {
		const key = utmIndex.toString()
		if (!this.superTiles.has(key))
			this.superTiles = this.superTiles.set(key, new SuperTile(utmIndex, coordinateFrame, this))
		return this.superTiles.get(key)
	}

	// "default" according to protobuf rules for default values
	private static isDefaultUtmZone(num: number, northernHemisphere: boolean): boolean {
		return num === 0 && northernHemisphere === false
	}

	// The first tile we see defines the local origin and UTM zone for the lifetime of the application.
	// All other data is expected to lie in the same zone.
	private checkCoordinateSystem(msg: TileMessage, inputCoordinateFrame: CoordinateFrameType): boolean {
		const num = msg.utmZoneNumber
		const northernHemisphere = msg.utmZoneNorthernHemisphere
		if (!num || northernHemisphere === null)
			return false
		const p = convertToStandardCoordinateFrame(msg.origin, inputCoordinateFrame)

		if (this.setOrigin(num, northernHemisphere, p))
			return true
		else
			return TileManager.isDefaultUtmZone(num, northernHemisphere)
				|| this.utmZoneNumber === num && this.utmZoneNorthernHemisphere === northernHemisphere
	}

	/**
	 * Replace existing geometry with a new one.
	 */
	private setGeometry(newGeometry: BufferGeometry, hasPoints: boolean): void {
		const oldGeometry = this.pointCloud.geometry
		this.pointCloud.geometry = newGeometry
		this.hasGeometry = this.hasGeometry || hasPoints // Wouldn't it be nice if BufferGeometry had a method to do this?
		oldGeometry.dispose() // There is a vague and scary note in the docs about doing this, so here we go.
	}

	/**
	 * Generate a new color palette using HSV space
	 */
	private generateGradient(): void {
		log.info(`Generate color palette....`)
		let gradientValues: number = Math.floor((this.voxelsMaxHeight / this.voxelSize + 1))
		let height: number = this.voxelSize / 2
		for (let i = 0; i < gradientValues; ++i ) {
			this.HSVGradient.push(TileManager.heightToColor(height, this.voxelsMaxHeight))
			height += this.voxelSize
		}
	}

	/**
	 * Assign an RGB color for a height value, given a fixed range [0, scale]
	 */
	private static heightToColor(height: number, scale: number): THREE.Vector3 {
		let x = (height / scale) * 360;
		if (x > 360.0)
			x = 360.0

		let color: THREE.Vector3 = new THREE.Vector3()
		let kMax: number = 1.0
		let kMin: number = 0.0
		let posSlope: number = (kMax - kMin) / 60.0
		let negSlope: number = (kMin - kMax) / 60.0

		if ( x < 60.0 ) {
			color[0] = kMax
			color[1] = posSlope * x + kMin
			color[2] = kMin
		} else if ( x < 120.0 ) {
			color[0] = negSlope * x + 2 * kMax + kMin
			color[1] = kMax
			color[2] = kMin
		} else if ( x < 180.0 ) {
			color[0] = kMin
			color[1] = kMax
			color[2] = posSlope * x - 2 * kMax + kMin
		} else if ( x < 240.0 ) {
			color[0] = kMin
			color[1] = negSlope * x + 4 * kMax + kMin
			color[2] = kMax
		} else if ( x <= 360 ) {
			color[0] = posSlope * x - 4 * kMax + kMin
			color[1] = kMin
			color[2] = kMax
		}
		return color
	}

	/**
	 * Create voxels geometry given a list of indices for the occupied voxels
	 */
	generateVoxels(): void {
		let maxBandValue: number = Math.floor((this.voxelsMaxHeight / this.voxelSize + 1))
		for (let band = 0; band < maxBandValue; band++) {
			log.info(`Processing height band ${band}...`)
			this.generateSingleBandVoxels(band, this.HSVGradient[band])
			log.info(`Height band ${band} done.`)
		}
	}

	/**
	 * Generate voxels in a single height band
	 */
	private generateSingleBandVoxels(heightBand: number, color: THREE.Vector3): void {

		log.info(`There are ${this.voxelsDictionary.size} voxels. Start creating them....`)

		// Voxel params
		let voxelSizeForRender = 0.9 * this.voxelSize
		let maxVoxelsPerArray: number = 100000

		// Voxels buffers
		const allPositions: Array<Array<number>> = []
		let positions: Array<number> = []

		// Generate voxels
		let heightIndex: number = 0
		let count: number = 0
		let voxelIndex: THREE.Vector3
		for (voxelIndex of this.voxelsDictionary) {

			// Prepare voxel color from voxel height
			let height = this.voxelsHeight[heightIndex]
			heightIndex++
			let currentHeightBand = Math.floor((height / this.voxelSize))
			if (currentHeightBand !== heightBand) {
				continue
			}

			if (count % maxVoxelsPerArray === 0) {
				positions = []
				allPositions.push(positions)
				log.info(`Processing voxel ${count}`)
			}

			// Prepare voxel geometry
			let p11 = voxelIndex.clone()
			p11.multiplyScalar(this.voxelSize)
			let p12 = new THREE.Vector3((p11.x + voxelSizeForRender), p11.y, p11.z)
			let p13 = new THREE.Vector3((p11.x + voxelSizeForRender), (p11.y + voxelSizeForRender), p11.z)
			let p14 = new THREE.Vector3(p11.x, (p11.y + voxelSizeForRender), p11.z)

			let p21 = new THREE.Vector3(p11.x, p11.y, (p11.z + voxelSizeForRender))
			let p22 = new THREE.Vector3(p12.x, p12.y, (p12.z + voxelSizeForRender))
			let p23 = new THREE.Vector3(p13.x, p13.y, (p13.z + voxelSizeForRender))
			let p24 = new THREE.Vector3(p14.x, p14.y, (p14.z + voxelSizeForRender))

			// Top
			positions.push(p11.x, p11.y, p11.z)
			positions.push(p12.x, p12.y, p12.z)
			positions.push(p13.x, p13.y, p13.z)

			positions.push(p11.x, p11.y, p11.z)
			positions.push(p13.x, p13.y, p13.z)
			positions.push(p14.x, p14.y, p14.z)

			// Bottom
			positions.push(p21.x, p21.y, p21.z)
			positions.push(p22.x, p22.y, p22.z)
			positions.push(p23.x, p23.y, p23.z)

			positions.push(p21.x, p21.y, p21.z)
			positions.push(p23.x, p23.y, p23.z)
			positions.push(p24.x, p24.y, p24.z)

			// Side 1
			positions.push(p11.x, p11.y, p11.z)
			positions.push(p12.x, p12.y, p12.z)
			positions.push(p22.x, p22.y, p22.z)

			positions.push(p11.x, p11.y, p11.z)
			positions.push(p22.x, p22.y, p22.z)
			positions.push(p21.x, p21.y, p21.z)

			// Side 2
			positions.push(p12.x, p12.y, p12.z)
			positions.push(p13.x, p13.y, p13.z)
			positions.push(p23.x, p23.y, p23.z)

			positions.push(p12.x, p12.y, p12.z)
			positions.push(p23.x, p23.y, p23.z)
			positions.push(p22.x, p22.y, p22.z)

			// Side 3
			positions.push(p13.x, p13.y, p13.z)
			positions.push(p14.x, p14.y, p14.z)
			positions.push(p24.x, p24.y, p24.z)

			positions.push(p13.x, p13.y, p13.z)
			positions.push(p24.x, p24.y, p24.z)
			positions.push(p23.x, p23.y, p23.z)

			// Side 4
			positions.push(p14.x, p14.y, p14.z)
			positions.push(p11.x, p11.y, p11.z)
			positions.push(p21.x, p21.y, p21.z)

			positions.push(p14.x, p14.y, p14.z)
			positions.push(p21.x, p21.y, p21.z)
			positions.push(p24.x, p24.y, p24.z)

			count++
		}
		log.info('Done generating voxels.')

		log.info('Add them to the mesh....')
		for (let j = 0; j < allPositions.length; j++) {
			let pointsBuffer = new THREE.Float32BufferAttribute(allPositions[j], 3)
			let buffer = new THREE.BufferGeometry()
			buffer.addAttribute('position', pointsBuffer)
			let voxelsMesh = new THREE.Mesh(buffer, new THREE.MeshLambertMaterial({
				color: new THREE.Color(color[0], color[1], color[2]),
				side: THREE.DoubleSide
			}))
			this.voxelsMeshGroup.push(voxelsMesh)
		}
		log.info('Done adding them to the mesh.')
	}

	/**
	 * Load a point cloud tile message from a proto binary file
	 */
	private loadTile(filename: string): Promise<TileMessage> {
		switch (this.tileMessageFormat) {
			case TileMessageFormat.BaseGeometryTileMessage:
				return loadBaseGeometryTileMessage(filename)
			case TileMessageFormat.PointCloudTileMessage:
				return loadPointCloudTileMessage(filename)
			default:
				return Promise.reject(Error('unknown tileMessageFormat: ' + this.tileMessageFormat))
		}
	}

	/**
	 * Given a path to a dataset, find all super tiles. Load point cloud data for some of them.
	 */
	loadFromDirectory(datasetPath: string, coordinateFrame: CoordinateFrameType): Promise<void> {
		if (this.isLoadingPointCloud)
			return Promise.reject(new BusyError('busy loading point cloud'))
		this.isLoadingPointCloud = true
		return this.resetIsLoadingPointCloud(
			this.loadFromDirectoryImpl(datasetPath, coordinateFrame)
		)
	}

	// Given a range search, find all intersecting super tiles. Load point cloud data for as many
	// as allowed by configuration, or all if loadAllPoints.
	// Side effect: Prune old SuperTiles as necessary.
	loadFromMapServer(search: RangeSearch, coordinateFrame: CoordinateFrameType, loadAllPoints: boolean = false): Promise<void> {
		if (this.isLoadingPointCloud)
			return Promise.reject(new BusyError('busy loading point cloud'))
		this.isLoadingPointCloud = true
		return this.resetIsLoadingPointCloud(
			this.loadFromMapServerImpl(search, coordinateFrame, loadAllPoints)
		)
	}

	private resetIsLoadingPointCloud(pointCloudResult: Promise<void>): Promise<void> {
		return pointCloudResult
			.then(() => {
				this.isLoadingPointCloud = false
			})
			.catch(err => {
				this.isLoadingPointCloud = false
				throw err
			})
	}

	// The useful bits of loadFromDirectory()
	private loadFromDirectoryImpl(datasetPath: string, coordinateFrame: CoordinateFrameType): Promise<void> {
		// Consider all tiles within datasetPath.
		let names: string[]
		try {
			names = Fs.readdirSync(datasetPath)
		} catch (err) {
			return Promise.reject(Error(`can't load tile files at ${datasetPath}`))
		}
		const fileMetadataList = names
			.map(name => tileFileNameToTileMetadata(name))
			.filter(metadata => metadata !== null)
		if (!fileMetadataList.length)
			return Promise.reject(Error('no tiles found at ' + datasetPath))

		// Ensure that we have a valid coordinate system before doing anything else.
		let firstTilePromise: Promise<void>
		if (this.coordinateSystemInitialized)
			firstTilePromise = Promise.resolve()
		else
			firstTilePromise = this.loadTile(Path.join(datasetPath, fileMetadataList[0]!.name))
				.then(firstMessage => {
					if (this.checkCoordinateSystem(firstMessage, coordinateFrame)) {
						this.coordinateSystemInitialized = true
						return Promise.resolve()
					} else {
						return Promise.reject(Error('checkCoordinateSystem failed on first tile: ' + fileMetadataList[0]!.name))
					}
				})

		// Instantiate tile and super tile classes for all the data.
		// Load some of the data to get us started.
		return firstTilePromise
			.then(() => {
				fileMetadataList.forEach(metadata => {
					const utmTile = new UtmTile(
						new TileIndex(utmTileScale, metadata!.index.x, metadata!.index.y, metadata!.index.z),
						this.pointCloudFileLoader(Path.join(datasetPath, metadata!.name), coordinateFrame),
					)
					this.addTileToSuperTile(utmTile, coordinateFrame, metadata!.name)
				})

				const promises = this.identifyFirstSuperTilesToLoad()
					.map(st => this.loadSuperTile(st))
				return Promise.all(promises)
			})
			.then(() => this.generatePointCloudFromSuperTiles())
	}

	// The useful bits of loadFromMapServer()
	private loadFromMapServerImpl(search: RangeSearch, coordinateFrame: CoordinateFrameType, loadAllPoints: boolean = false): Promise<void> {
		// Figure out which super tiles to load.
		const allStIndexes = enumerateIntersectingSuperTileIndexes(search)
		const filteredStIndexes = allStIndexes
			.filter(sti => this.superTiles.get(sti.toString()) === undefined)
		if (!filteredStIndexes.length)
			return Promise.resolve()
		if (!loadAllPoints && filteredStIndexes.length > this.initialSuperTilesToLoad)
			filteredStIndexes.length = this.initialSuperTilesToLoad

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
					'checkCoordinateSystem failed on first tile at: '
					+ originTile.utmZoneNumber
					+ originTile.utmZoneNorthernHemisphere
					+ ' ' + originTile.origin.x + ', ' + originTile.origin.y + ', ' + originTile.origin.z
				))
			}
		}

		// Break the super tiles into tiles, get tile metadata from the API client, and pack it all back into super tiles.
		const allTilesLoaded = firstTilePromise
			.then(() => {
				const tileLoadResults = filteredStIndexes.map(stIndex => {
					const superTileSearch = {
						minPoint: stIndex.boundingBox.min,
						maxPoint: stIndex.boundingBox.max
					}
					// TODO merge these into fewer API requests
					return this.tileServiceClient.getTilesByCoordinateRange(superTileSearch)
						.then(tileMetadataList => {
							if (tileMetadataList.length === 0) {
								this.getOrCreateSuperTile(stIndex, coordinateFrame)
							} else
								tileMetadataList.forEach(metadata => {
									const utmTile = new UtmTile(metadata.tileIndex, this.pointCloudFileLoader(metadata.path, coordinateFrame))
									this.addTileToSuperTile(utmTile, coordinateFrame, metadata.path)
								})
						})
				})
				return Promise.all(tileLoadResults)
			})

		// Load point clouds for the new tiles.
		return allTilesLoaded.then(() => {
			const promises = this.tileIndexesToSuperTiles(filteredStIndexes)
				.map(st => this.loadSuperTile(st))
			return Promise.all(promises)
		})
			.then(() => this.pruneSuperTiles())
			.then(() => this.generatePointCloudFromSuperTiles())
	}

	// Look up SuperTiles (that have already been instantiated) for a list of indexes.
	private tileIndexesToSuperTiles(superTileIndexList: TileIndex[]): SuperTile[] {
		return superTileIndexList
			.filter(sti => this.superTiles.has(sti.toString()))
			.map(sti => this.superTiles.get(sti.toString()))
	}

	// Get data from a file. Prepare it to instantiate a UtmTile.
	// Returns:
	//  - array of raw position data
	//  - array of raw color data
	//  - count of points
	private pointCloudFileLoader(filename: string, coordinateFrame: CoordinateFrameType): () => Promise<[number[], number[], number]> {
		return (): Promise<[number[], number[], number]> =>
			this.loadTile(filename)
				.then(msg => {
					if (!msg.points || msg.points.length === 0) {
						return [[], [], 0] as [number[], number[], number]
					} else if (!this.checkCoordinateSystem(msg, coordinateFrame)) {
						throw Error('checkCoordinateSystem failed on: ' + filename)
					} else {
						const [sampledPoints, sampledColors]: Array<Array<number>> = sampleData(msg, this.samplingStep)
						const positions = this.rawDataToPositions(sampledPoints, coordinateFrame)
						const pointCount = positions.length / threeDStepSize
						return [positions, sampledColors, pointCount] as [number[], number[], number]
					}
				})
	}

	// Tiles are collected into super tiles. Later the super tiles will manage loading and unloading point cloud data.
	private addTileToSuperTile(utmTile: UtmTile, coordinateFrame: CoordinateFrameType, tileName: string): void {
		const superTile = this.getOrCreateSuperTile(utmTile.superTileIndex(superTileScale), coordinateFrame)
		if (!superTile.addTile(utmTile))
			log.warn(`addTile() to ${superTile.index.toString()} failed for ${tileName}`)
	}

	private identifyFirstSuperTilesToLoad(): SuperTile[] {
		let toLoad: SuperTile[] = []

		// See if there are any valid super tile references from a previous session.
		const preferred = this.getSuperTilesPreference()
		if (preferred.nonEmpty) {
			toLoad = lodash.flatten(
				preferred.get
					.valueSeq().toArray()
					.map(key => option(this.superTiles.get(key!)).toArray)
			)
		}

		// If not, default behavior is to take the first few in the list.
		if (!toLoad.length)
			toLoad = this.superTiles
				.take(this.initialSuperTilesToLoad)
				.valueSeq().toArray()

		return toLoad
	}

	// Load data for a single SuperTile. This assumes that loadFromDirectory() or loadFromMapServer() already happened.
	// Side effect: prune old SuperTiles as necessary.
	loadFromSuperTile(superTile: SuperTile): Promise<void> {
		const key = superTile.index.toString()
		const foundSuperTile = this.superTiles.get(key)
		if (!foundSuperTile)
			return Promise.reject(`can't load nonexistent super tile '${key}'`)
		else
			return this.loadSuperTile(foundSuperTile)
				.then(() => this.pruneSuperTiles())
				.then(() => this.generatePointCloudFromSuperTiles())
	}

	private loadSuperTile(superTile: SuperTile): Promise<boolean> {
		const key = superTile.index.toString()
		if (this.loadedSuperTileKeys.contains(key)) {
			// Move it to the end of the queue for pruning super tiles.
			this.loadedSuperTileKeys.delete(key)
			this.loadedSuperTileKeys.add(key)
			this.setSuperTilesPreference()
			return Promise.resolve(true)
		} else
			return superTile.loadPointCloud()
				.then(success => {
					if (success)
						this.setLoadedSuperTileKeys(this.loadedSuperTileKeys.add(key))
					return success
				})
	}

	// Transform protobuf data to the correct coordinate frame and instantiate a tile.
	private rawDataToPositions(
		points: Array<number>,
		coordinateFrame: CoordinateFrameType
	): number[] {
		const pointsSize = points.length
		const newPositions = new Array<number>(pointsSize)

		for (let i = 0; i < pointsSize; i += threeDStepSize) {
			const inputPoint = new THREE.Vector3(points[i], points[i + 1], points[i + 2])
			const standardPoint = convertToStandardCoordinateFrame(inputPoint, coordinateFrame)
			const threePoint = this.utmToThreeJs(standardPoint.x, standardPoint.y, standardPoint.z)
			newPositions[i] = threePoint.x
			newPositions[i + 1] = threePoint.y
			newPositions[i + 2] = threePoint.z
			this.voxelsDictionary.add(threePoint.divideScalar(this.voxelSize).floor())
		}

		return newPositions
	}

	// When we exceed maximumPointsToLoad, unload old SuperTiles, keeping a minimum of one in memory.
	private pruneSuperTiles(): void {
		let count = 0
		while (this.loadedSuperTileKeys.size > 1 && this.pointCount() > this.maximumPointsToLoad) {
			const oldestKey = this.loadedSuperTileKeys.first()
			this.setLoadedSuperTileKeys(this.loadedSuperTileKeys.skip(1).toOrderedSet())
			const foundSuperTile = this.superTiles.get(oldestKey)
			if (foundSuperTile) {
				foundSuperTile.unloadPointCloud()
				this.onSuperTileUnload(foundSuperTile)
				count++
			}
		}
		if (count)
			log.info(`unloaded ${count} super tiles for better performance`)
	}

	/*
	 * Set the current denormalized point cloud.
	 * Return some summary values for UI display.
	 */
	private generatePointCloudFromSuperTiles(): void {
		let totalPoints = 0
		const positionsAry: number[][] = []
		const colorsAry: number[][] = []
		this.superTiles.forEach(st => {
			if (st && st.hasPointCloud) {
				const positions = st.getRawPositions()
				const length = positions.length
				if (length) {
					totalPoints += length
					positionsAry.push(positions)
					colorsAry.push(st.getRawColors())
				}
			}
		})

		const rawPositions = new Float32Array(totalPoints)
		const rawColors = new Float32Array(totalPoints)
		let n = 0
		positionsAry.forEach(superTilePositions => {
			for (let i = 0; i < superTilePositions.length; i++, n++) {
				rawPositions[n] = superTilePositions[i]
			}
		})
		n = 0
		colorsAry.forEach(superTileColors => {
			for (let i = 0; i < superTileColors.length; i++, n++) {
				rawColors[n] = superTileColors[i]
			}
		})

		const geometry = new THREE.BufferGeometry()
		geometry.addAttribute('position', new THREE.BufferAttribute(rawPositions, threeDStepSize))
		geometry.addAttribute('color', new THREE.BufferAttribute(rawColors, threeDStepSize))
		this.setGeometry(geometry, totalPoints > 0)
	}

	// This is a trivial solution to finding the local ground plane. Simply find a band of Y values with the most
	// points (arithmetic mode). Assume that band contains a large horizontal object which is a road.
	estimateGroundPlaneYIndex(): number | null {
		const yValueHistogram: Map<number, number> = new Map()
		const yValueBinSize = 0.7 // arbitrary setting for the physical size of bins, yields ~20 bins given data sets ~10m high
		let biggestBinIndex = 0
		let biggestBinCount = 0

		this.superTiles.forEach(st => {
			if (st && st.hasPointCloud) {
				const rawPositions = st.getRawPositions()
				for (let i = 0; i < rawPositions.length; i += threeDStepSize) {
					const yValue = rawPositions[i + 1]
					const yIndex = Math.floor(yValue / yValueBinSize)
					if (yValueHistogram.has(yIndex))
						yValueHistogram.set(yIndex, yValueHistogram.get(yIndex)! + 1)
					else
						yValueHistogram.set(yIndex, 1)
				}
			}
		})

		yValueHistogram.forEach((count, index) => {
			if (count > biggestBinCount) {
				biggestBinIndex = index
				biggestBinCount = count
			}
		})

		return biggestBinIndex > 0
			? (biggestBinIndex + 0.5) * yValueBinSize // Get the midpoint of the most popular bin.
			: null
	}

	// The number of points in all SuperTiles which have been loaded to memory.
	pointCount(): number {
		return this.superTiles
			.valueSeq().toArray()
			.map(st => st.pointCount)
			.reduce((a, b) => a + b, 0)
	}

	// Bounding box of the visible point cloud.
	boundingBox(): THREE.Box3 | null {
		if (this.hasGeometry) {
			const geometry = this.pointCloud.geometry
			geometry.computeBoundingBox()
			return geometry.boundingBox
		} else {
			return null
		}
	}

	/**
	 * Finds the center of the bottom of the bounding box, so that when we view the model
	 * the whole thing appears above the artificial ground plane.
	 */
	centerPoint(): THREE.Vector3 | null {
		if (this.hasGeometry) {
			const geometry = this.pointCloud.geometry
			geometry.computeBoundingBox()
			return geometry.boundingBox.getCenter().setY(geometry.boundingBox.min.y)
		} else {
			return null
		}
	}

	/**
	 * Clean slate.
	 */
	unloadAllPoints(): void {
		this.setLoadedSuperTileKeys(OrderedSet())
		this.superTiles = OrderedMap()
		this.setGeometry(new THREE.BufferGeometry(), false)
		this.hasGeometry = false
	}
}
