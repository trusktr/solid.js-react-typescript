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
import {threeDStepSize} from "./Constant"
import {
	baseGeometryTileMessageToTileMessage, pointCloudTileMessageToTileMessage,
	TileMessage, TileMessageFormat
} from "./TileMessage"
import {SuperTile} from "./SuperTile"
import {UtmTile} from "./UtmTile"
import {UtmInterface} from "../UtmInterface"
import {convertToStandardCoordinateFrame, CoordinateFrameType} from "../geometry/CoordinateFrame"
import {Scale3D} from "../geometry/Scale3D"
import {TileIndex, tileIndexFromVector3} from "../model/TileIndex"
import LocalStorage from "../state/LocalStorage"
import {TileServiceClient} from "./TileServiceClient"
import {RangeSearch} from "../model/RangeSearch"
import {LocalTileInstance, RemoteTileInstance, TileInstance} from "../model/TileInstance"
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

const loadedSuperTileKeysKey = 'loadedSuperTileKeys'
let warningDelivered = false

export class BusyError extends Error {}

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

	if (step === 1)
		return [msg.points, msg.colors]

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
// This expands the input range searches to cover the entire volume of the SuperTiles that are
// intersected by the searches, and it converts the ranges to an array of all those SuperTiles.
function enumerateIntersectingSuperTileIndexes(searches: RangeSearch[]): TileIndex[] {
	switch (searches.length) {
		case 0:
			return []
		case 1:
			return enumerateOneRange(searches[0])
		default:
			const enumerations = searches.map(search => enumerateOneRange(search))
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

function enumerateOneRange(search: RangeSearch): TileIndex[] {
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

export enum SuperTileUnloadAction {
	Unload,
	Delete,
}

interface TileManagerConfig {
	pointsSize: number,
	tileMessageFormat: TileMessageFormat,
	initialSuperTilesToLoad: number, // preload some super tiles; initially we don't know how many points they will contain
	maximumSuperTilesToLoad: number, // sanity check so we don't load lots of very sparse or empty super tiles
	maximumPointsToLoad: number, // after loading super tiles we can trim them back by point count
	samplingStep: number,
}

interface VoxelsConfig {
	enable: boolean,
	voxelSize: number,
	voxelsMaxHeight: number,
}

// TileManager loads tile data from disk or from the network. Tiles are aggregated into SuperTiles,
// which serve as a local cache for chunks of tile data. Each SuperTile has a point cloud, which
// when loaded is provided as a single structure for three.js rendering.
// All points are stored with reference to UTM origin and offset, but using the local coordinate
// system which has different axes.
export class TileManager extends UtmInterface {
	private config: TileManagerConfig
	voxelsConfig: VoxelsConfig
	private storage: LocalStorage // persistent state for UI settings
	private coordinateSystemInitialized: boolean // indicates that this TileManager passed checkCoordinateSystem() and set an origin
	superTiles: OrderedMap<string, SuperTile> // all super tiles which we are aware of
	// Keys to super tiles which have points loaded in memory. It is ordered so that it works as a least-recently-used
	// cache when it comes time to unload excess super tiles.
	private loadedSuperTileKeys: OrderedSet<string>
	private superTileUnloadBehavior: SuperTileUnloadAction
	private pointsMaterial: THREE.PointsMaterial
	// TileManager makes some assumptions about the state of super tiles and point clouds which lead to problems
	// with asynchronous requests to load points. Allow only one request at a time.
	private isLoadingPointCloud: boolean
	private pointCloudsBoundingBox: THREE.Box3 | null // cached state of the point clouds for all super tiles
	voxelsMeshGroup: Array<THREE.Mesh>
	voxelsDictionary: Set<THREE.Vector3>
	voxelsHeight: Array<number>
	private HSVGradient: Array<THREE.Vector3>
	private onSuperTileLoad: (superTile: SuperTile) => void
	private onSuperTileUnload: (superTile: SuperTile, action: SuperTileUnloadAction) => void
	private tileServiceClient: TileServiceClient

	constructor(
		enableVoxels: boolean,
		onSuperTileLoad: (superTile: SuperTile) => void,
		onSuperTileUnload: (superTile: SuperTile, action: SuperTileUnloadAction) => void,
		onTileServiceStatusUpdate: (tileServiceStatus: boolean) => void,
	) {
		super()
		this.config = {
			pointsSize: parseFloat(config.get('annotator.point_render_size')) || 1,
			tileMessageFormat: TileMessageFormat[config.get('tile_manager.tile_message_format') as string],
			initialSuperTilesToLoad: parseInt(config.get('tile_manager.initial_super_tiles_to_load'), 10) || 4,
			maximumSuperTilesToLoad: parseInt(config.get('tile_manager.maximum_super_tiles_to_load'), 10) || 10000,
			maximumPointsToLoad: parseInt(config.get('tile_manager.maximum_points_to_load'), 10) || 100000,
			samplingStep: parseInt(config.get('tile_manager.sampling_step'), 10) || 5,
		}
		if (!this.config.tileMessageFormat)
			throw Error('bad tile_manager.tile_message_format: ' + config.get('tile_manager.tile_message_format'))
		this.voxelsConfig = {
			enable: enableVoxels,
			voxelSize: 0.15,
			voxelsMaxHeight: 7,
		}
		this.storage = new LocalStorage()
		this.coordinateSystemInitialized = false
		this.onSuperTileLoad = onSuperTileLoad
		this.onSuperTileUnload = onSuperTileUnload
		this.superTiles = OrderedMap()
		this.loadedSuperTileKeys = OrderedSet()
		this.superTileUnloadBehavior = SuperTileUnloadAction.Unload
		this.pointsMaterial = new THREE.PointsMaterial({size: this.config.pointsSize, vertexColors: THREE.VertexColors})
		this.isLoadingPointCloud = false
		this.pointCloudsBoundingBox = null
		this.voxelsMeshGroup = []
		this.voxelsHeight = []
		this.voxelsDictionary = new Set<THREE.Vector3>()
		this.HSVGradient = []
		this.generateGradient()
		this.tileServiceClient = new TileServiceClient(onTileServiceStatusUpdate)
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

	// Get all populated point clouds from all the super tiles.
	getPointClouds(): THREE.Points[] {
		return this.superTiles
			.valueSeq().toArray()
			.filter(st => !!st.pointCloud)
			.map(st => st.pointCloud!)
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
	 * Generate a new color palette using HSV space
	 */
	private generateGradient(): void {
		log.info(`Generate color palette....`)
		let gradientValues: number = Math.floor((this.voxelsConfig.voxelsMaxHeight / this.voxelsConfig.voxelSize + 1))
		let height: number = this.voxelsConfig.voxelSize / 2
		for (let i = 0; i < gradientValues; ++i ) {
			this.HSVGradient.push(TileManager.heightToColor(height, this.voxelsConfig.voxelsMaxHeight))
			height += this.voxelsConfig.voxelSize
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
		if (!this.voxelsConfig.enable) {
			log.error('called generateVoxels() without enabling voxelsConfig')
			return
		}
		let maxBandValue: number = Math.floor((this.voxelsConfig.voxelsMaxHeight / this.voxelsConfig.voxelSize + 1))
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
		let voxelSizeForRender = 0.9 * this.voxelsConfig.voxelSize
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
			let currentHeightBand = Math.floor((height / this.voxelsConfig.voxelSize))
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
			p11.multiplyScalar(this.voxelsConfig.voxelSize)
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
		this.voxelsMeshGroup = []
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
	private loadTile(tileInstance: TileInstance): Promise<TileMessage> {
		let loader: Promise<Uint8Array>
		let parser: (buffer: Uint8Array) => TileMessage

		if (tileInstance instanceof LocalTileInstance) {
			loader = AsyncFile.readFile(tileInstance.fileSystemPath)
			switch (this.config.tileMessageFormat) {
				case TileMessageFormat.BaseGeometryTileMessage:
					parser = TileManager.parseBaseGeometryTileMessage
					break
				case TileMessageFormat.PointCloudTileMessage:
					parser = TileManager.parsePointCloudTileMessage
					break
				default:
					return Promise.reject(Error('unknown tileMessageFormat: ' + this.config.tileMessageFormat))
			}
		} else if (tileInstance instanceof RemoteTileInstance) {
			loader = this.tileServiceClient.getTileContents(tileInstance.url)
			// TODO map tileInstance.layerId to parser
			parser = TileManager.parseBaseGeometryTileMessage
		} else {
			return Promise.reject(Error('unknown tileInstance: ' + tileInstance))
		}

		return loader.then(buffer => parser(buffer))
	}

	private static parseBaseGeometryTileMessage(buffer: Uint8Array): TileMessage {
		let msg
		try {
			msg = Models.BaseGeometryTileMessage.decode(buffer)
		} catch (err) {
			throw Error('protobuf read failed: ' + err.message)
		}
		return baseGeometryTileMessageToTileMessage(msg)
	}

	private static parsePointCloudTileMessage(buffer: Uint8Array): TileMessage {
		let msg
		try {
			msg = Models.PointCloudTileMessage.decode(buffer)
		} catch (err) {
			throw Error('protobuf read failed: ' + err.message)
		}
		// Perception doesn't set UTM zone correctly. For now we have to assume the data are from San Francisco.
		if (!warningDelivered) {
			log.warn('forcing tiles into UTM zone 10N')
			warningDelivered = true
		}
		msg.utmZoneNumber = 10
		msg.utmZoneNorthernHemisphere = true
		return pointCloudTileMessageToTileMessage(msg)
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
	loadFromMapServer(searches: RangeSearch[], coordinateFrame: CoordinateFrameType, loadAllPoints: boolean = false): Promise<void> {
		if (this.isLoadingPointCloud)
			return Promise.reject(new BusyError('busy loading point cloud'))
		this.isLoadingPointCloud = true
		return this.resetIsLoadingPointCloud(
			this.loadFromMapServerImpl(searches, coordinateFrame, loadAllPoints)
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
		else {
			const metadata = fileMetadataList[0]!
			const tileIndex = new TileIndex(utmTileScale, metadata.index.x, metadata.index.y, metadata.index.z)
			const tileInstance = new LocalTileInstance(tileIndex, Path.join(datasetPath, metadata!.name))
			firstTilePromise = this.loadTile(tileInstance)
				.then(firstMessage => {
					if (this.checkCoordinateSystem(firstMessage, coordinateFrame)) {
						this.coordinateSystemInitialized = true
						return Promise.resolve()
					} else {
						return Promise.reject(Error('checkCoordinateSystem failed on first tile: ' + fileMetadataList[0]!.name))
					}
				})
		}

		// Instantiate tile and super tile classes for all the data.
		// Load some of the data to get us started.
		return firstTilePromise
			.then(() => {
				fileMetadataList.forEach(metadata => {
					const tileIndex = new TileIndex(utmTileScale, metadata!.index.x, metadata!.index.y, metadata!.index.z)
					const tileInstance = new LocalTileInstance(tileIndex, Path.join(datasetPath, metadata!.name))
					const utmTile = new UtmTile(
						tileIndex,
						this.pointCloudFileLoader(tileInstance, coordinateFrame),
					)
					this.addTileToSuperTile(utmTile, coordinateFrame, metadata!.name)
				})

				const promises = this.identifyFirstSuperTilesToLoad()
					.map(st => this.loadSuperTile(st))
				return Promise.all(promises)
			})
			.then(() => {return})
	}

	// The useful bits of loadFromMapServer()
	private loadFromMapServerImpl(searches: RangeSearch[], coordinateFrame: CoordinateFrameType, loadAllPoints: boolean = false): Promise<void> {
		// Default behavior when a super tile is evicted from cache is to unload its point cloud without deleting it.
		// That works well with a fixed data set which we would get with loadFromDirectory(). The UI allows a mix of
		// loading from directory and from a map server at any time. If we ever see a request for map server tiles,
		// assume the number of tiles (and super tiles) is unlimited, so we can't afford to keep any old ones.
		this.superTileUnloadBehavior = SuperTileUnloadAction.Delete

		if (this.voxelsConfig.enable)
			log.warn('This app will leak memory when generating voxels while incrementally loading tiles. Fix it.')

		// Figure out which super tiles to load.
		const allStIndexes = enumerateIntersectingSuperTileIndexes(searches)
		const filteredStIndexes = allStIndexes
			.filter(sti => this.superTiles.get(sti.toString()) === undefined)
		if (!filteredStIndexes.length)
			return Promise.resolve()
		if (!loadAllPoints && filteredStIndexes.length > this.config.initialSuperTilesToLoad)
			filteredStIndexes.length = this.config.initialSuperTilesToLoad

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
						.then(tileInstances => {
							if (tileInstances.length === 0) {
								this.getOrCreateSuperTile(stIndex, coordinateFrame)
							} else
								tileInstances.forEach(tileInstance => {
									const utmTile = new UtmTile(tileInstance.tileIndex, this.pointCloudFileLoader(tileInstance, coordinateFrame))
									this.addTileToSuperTile(utmTile, coordinateFrame, tileInstance.url)
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
	private pointCloudFileLoader(tileInstance: TileInstance, coordinateFrame: CoordinateFrameType): () => Promise<[number[], number[]]> {
		return (): Promise<[number[], number[]]> =>
			this.loadTile(tileInstance)
				.then(msg => {
					if (!msg.points || msg.points.length === 0) {
						return [[], []] as [number[], number[]]
					} else if (!this.checkCoordinateSystem(msg, coordinateFrame)) {
						throw Error('checkCoordinateSystem failed on: ' + tileInstance.url)
					} else {
						const [sampledPoints, sampledColors]: Array<Array<number>> = sampleData(msg, this.config.samplingStep)
						const positions = this.rawDataToPositions(sampledPoints, coordinateFrame)
						return [positions, sampledColors] as [number[], number[]]
					}
				})
	}

	// Tiles are collected into super tiles. Later the super tiles will manage loading and unloading point cloud data.
	private addTileToSuperTile(utmTile: UtmTile, coordinateFrame: CoordinateFrameType, tileName: string): void {
		const superTile = this.getOrCreateSuperTile(utmTile.superTileIndex(superTileScale), coordinateFrame)
		if (!superTile.addTile(utmTile))
			log.warn(`addTile() to ${superTile.key()} failed for ${tileName}`)
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
				.take(this.config.initialSuperTilesToLoad)
				.valueSeq().toArray()

		return toLoad
	}

	// Load data for a single SuperTile. This assumes that loadFromDirectory() or loadFromMapServer() already happened.
	// Side effect: prune old SuperTiles as necessary.
	loadFromSuperTile(superTile: SuperTile): Promise<void> {
		const foundSuperTile = this.superTiles.get(superTile.key())
		if (!foundSuperTile)
			return Promise.reject(`can't load nonexistent super tile '${superTile.key()}'`)
		else
			return this.loadSuperTile(foundSuperTile)
				.then(() => this.pruneSuperTiles())
	}

	private loadSuperTile(superTile: SuperTile): Promise<boolean> {
		if (this.loadedSuperTileKeys.contains(superTile.key())) {
			// Move it to the end of the queue for pruning super tiles.
			this.loadedSuperTileKeys.delete(superTile.key())
			this.loadedSuperTileKeys.add(superTile.key())
			this.setSuperTilesPreference()
			return Promise.resolve(true)
		} else
			return superTile.loadPointCloud(this.pointsMaterial)
				.then(success => {
					if (success) {
						this.pointCloudsBoundingBox = null
						this.setLoadedSuperTileKeys(this.loadedSuperTileKeys.add(superTile.key()))
						this.onSuperTileLoad(superTile)
					}
					return success
				})
	}

	private unloadSuperTile(superTile: SuperTile): boolean {
		this.onSuperTileUnload(superTile, this.superTileUnloadBehavior)
		let success = false
		switch (this.superTileUnloadBehavior) {
			case SuperTileUnloadAction.Unload:
				superTile.unloadPointCloud()
				success = true
				break
			case SuperTileUnloadAction.Delete:
				this.superTiles = this.superTiles.remove(superTile.key())
				success = true
				break
			default:
				log.error('unknown SuperTileUnloadAction: ' + this.superTileUnloadBehavior)
				success = false
		}
		if (success) {
			this.pointCloudsBoundingBox = null
			this.setLoadedSuperTileKeys(this.loadedSuperTileKeys.remove(superTile.key()))
		}
		return success
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
			if (this.voxelsConfig.enable) {
				// TODO this.voxelsDictionary should be spread out among super tiles so that voxels can be
				// TODO unloaded along with point clouds
				this.voxelsDictionary.add(threePoint.divideScalar(this.voxelsConfig.voxelSize).floor())
			}
		}

		return newPositions
	}

	// When we exceed maximumPointsToLoad, unload old SuperTiles, keeping a minimum of one in memory.
	private pruneSuperTiles(): void {
		let removedCount = 0
		let currentPointCount = this.pointCount()
		let superTilesCount = this.loadedSuperTileKeys.size
		while (
			superTilesCount > 1 &&
			(superTilesCount > this.config.maximumSuperTilesToLoad || currentPointCount > this.config.maximumPointsToLoad)
		) {
			const oldestKey = this.loadedSuperTileKeys.first()
			const foundSuperTile = this.superTiles.get(oldestKey)
			if (foundSuperTile) {
				const superTilePointCount = foundSuperTile.pointCount
				if (this.unloadSuperTile(foundSuperTile)) {
					currentPointCount -= superTilePointCount
					superTilesCount--
					removedCount++
				}
			}
		}
		if (removedCount)
			log.info(`unloaded ${removedCount} super tiles for better performance`)
	}

	// This is a trivial solution to finding the local ground plane. Simply find a band of Y values with the most
	// points (arithmetic mode). Assume that band contains a large horizontal object which is a road.
	estimateGroundPlaneYIndex(): number | null {
		const yValueHistogram: Map<number, number> = new Map()
		const yValueBinSize = 0.7 // arbitrary setting for the physical size of bins, yields ~20 bins given data sets ~10m high
		let biggestBinIndex = 0
		let biggestBinCount = 0

		this.superTiles.forEach(st => {
			const rawPositions = st!.getRawPositions()
			for (let i = 0; i < rawPositions.length; i += threeDStepSize) {
				const yValue = rawPositions[i + 1]
				const yIndex = Math.floor(yValue / yValueBinSize)
				if (yValueHistogram.has(yIndex))
					yValueHistogram.set(yIndex, yValueHistogram.get(yIndex)! + 1)
				else
					yValueHistogram.set(yIndex, 1)
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
		let count = 0
		this.superTiles.forEach(st => count += st!.pointCount)
		return count
	}

	// Bounding box of the union of all point clouds.
	getPointCloudBoundingBox(): THREE.Box3 | null {
		if (this.pointCloudsBoundingBox) {
			return this.pointCloudsBoundingBox
		} else if (this.superTiles.isEmpty()) {
			return null
		} else {
			let bbox = new THREE.Box3()
			this.superTiles.forEach(st => {
				const newBbox = st!.getPointCloudBoundingBox()
				if (newBbox && newBbox.min.x !== null && newBbox.min.x !== Infinity)
					bbox = bbox.union(newBbox)
			})
			if (bbox.min.x === null || bbox.min.x === Infinity)
				this.pointCloudsBoundingBox = null
			else
				this.pointCloudsBoundingBox = bbox
			return this.pointCloudsBoundingBox
		}
	}

	/**
	 * Finds the center of the bottom of the bounding box, so that when we view the model
	 * the whole thing appears above the artificial ground plane.
	 */
	centerPoint(): THREE.Vector3 | null {
		const bbox = this.getPointCloudBoundingBox()
		if (bbox)
			return bbox.getCenter().setY(bbox.min.y)
		else
			return null
	}

	// Clean slate
	unloadAllPoints(): boolean {
		if (this.isLoadingPointCloud)
			return false
		this.superTiles.forEach(st => this.unloadSuperTile(st!))
		return true
	}
}
