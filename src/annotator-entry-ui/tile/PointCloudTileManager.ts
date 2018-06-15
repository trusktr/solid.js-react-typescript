/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import config from '@/config'
import * as Fs from 'fs'
import * as Path from 'path'
import * as AsyncFile from 'async-file'
import * as THREE from 'three'
import * as MapperProtos from '@mapperai/mapper-models'
import Models = MapperProtos.mapper.models
import {threeDStepSize} from "./Constant"
import {baseGeometryTileMessageToTileMessage, pointCloudTileMessageToTileMessage} from "./Conversion"
import {PointCloudTileContents} from "@/annotator-entry-ui/model/TileContents"
import {TileMessage, TileMessageFormat} from "@/annotator-entry-ui/model/TileMessage"
import {UtmTile} from "./UtmTile"
import {SuperTile} from "./SuperTile"
import {PointCloudUtmTile} from "./PointCloudUtmTile"
import {PointCloudSuperTile} from "./PointCloudSuperTile"
import {UtmCoordinateSystem} from "../UtmCoordinateSystem"
import {convertToStandardCoordinateFrame, CoordinateFrameType} from "../geometry/CoordinateFrame"
import {TileIndex} from "../model/TileIndex"
import {TileServiceClient} from "./TileServiceClient"
import {LocalTileInstance, RemoteTileInstance, TileInstance} from "../model/TileInstance"
import Logger from "@/util/log"
import {
	BusyError,
	SuperTileUnloadAction, TileManager, TileManagerConfig,
	TileMetadata, utmTileScale
} from "@/annotator-entry-ui/tile/TileManager"
import {RangeSearch} from "@/annotator-entry-ui/model/RangeSearch"
import {OrderedMap} from "immutable"

const log = Logger(__filename)

let warningDelivered = false

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
	index.forEach(n => {
		if (isNaN(n)) nan++
	})
	if (nan)
		return null

	return {
		name: name,
		index: new THREE.Vector3(index[0], index[1], index[2]),
	}
}

const nullContents = new PointCloudTileContents([], [])

const sampleData = (contents: PointCloudTileContents, step: number): Array<Array<number>> => {
	if (step <= 0) {
		log.error("Can't sample data. Step should be > 0.")
		return []
	}
	if (!contents.points) {
		log.error("tile message is missing points")
		return []
	}
	if (!contents.colors) {
		log.error("tile message is missing colors")
		return []
	}

	if (step === 1)
		return [contents.points, contents.colors]

	const sampledPoints: Array<number> = []
	const sampledColors: Array<number> = []
	const stride = step * threeDStepSize

	for (let i = 0; i < contents.points.length; i += stride) {
		// Assuming the utm points are: easting, northing, altitude
		sampledPoints.push(contents.points[i])
		sampledPoints.push(contents.points[i + 1])
		sampledPoints.push(contents.points[i + 2])
		sampledColors.push(contents.colors[i])
		sampledColors.push(contents.colors[i + 1])
		sampledColors.push(contents.colors[i + 2])
	}
	return [sampledPoints, sampledColors]
}

interface PointCloudTileManagerConfig extends TileManagerConfig {
	pointsSize: number,
	tileMessageFormat: TileMessageFormat,
	samplingStep: number,
}

interface VoxelsConfig {
	enable: boolean,
	voxelSize: number,
	voxelsMaxHeight: number,
}

// This handles loading and unloading point cloud data (for read only). Each SuperTile has a point cloud,
// consolidated from its constituent Tiles, which when loaded is merged into a single data structure for
// three.js rendering.
export class PointCloudTileManager extends TileManager {
	protected readonly config: PointCloudTileManagerConfig
	superTiles: OrderedMap<string, PointCloudSuperTile> // all super tiles which we are aware of
	private pointsMaterial: THREE.PointsMaterial
	// TODO kill legacy voxel features
	voxelsConfig: VoxelsConfig
	voxelsMeshGroup: Array<THREE.Mesh>
	voxelsDictionary: Set<THREE.Vector3>
	voxelsHeight: Array<number>
	private HSVGradient: Array<THREE.Vector3>

	constructor(
		utmCoordinateSystem: UtmCoordinateSystem,
		onSuperTileLoad: (superTile: SuperTile) => void,
		onSuperTileUnload: (superTile: SuperTile, action: SuperTileUnloadAction) => void,
		tileServiceClient: TileServiceClient,
		enableVoxels: boolean,
	) {
		super(
			utmCoordinateSystem,
			onSuperTileLoad,
			onSuperTileUnload,
			tileServiceClient,
		)
		this.config = {
			layerId: 'base1', // a layer which contains instances of `BaseGeometryTileMessage`
			pointsSize: parseFloat(config.get('annotator.point_render_size')) || 1,
			tileMessageFormat: TileMessageFormat[config.get('tile_manager.tile_message_format') as string],
			initialSuperTilesToLoad: parseInt(config.get('tile_manager.initial_super_tiles_to_load'), 10) || 4,
			maximumSuperTilesToLoad: parseInt(config.get('tile_manager.maximum_super_tiles_to_load'), 10) || 10000,
			maximumObjectsToLoad: parseInt(config.get('tile_manager.maximum_points_to_load'), 10) || 100000,
			samplingStep: parseInt(config.get('tile_manager.sampling_step'), 10) || 5,
		}
		if (!this.config.tileMessageFormat)
			throw Error('bad tile_manager.tile_message_format: ' + config.get('tile_manager.tile_message_format'))
		this.pointsMaterial = new THREE.PointsMaterial({
			size: this.config.pointsSize,
			sizeAttenuation: false,
			vertexColors: THREE.VertexColors,
		})
		this.voxelsConfig = {
			enable: enableVoxels,
			voxelSize: 0.15,
			voxelsMaxHeight: 7,
		}
		this.voxelsMeshGroup = []
		this.voxelsHeight = []
		this.voxelsDictionary = new Set<THREE.Vector3>()
		this.HSVGradient = []
		this.generateGradient()
	}

	protected constructSuperTile(index: TileIndex, coordinateFrame: CoordinateFrameType, utmCoordinateSystem: UtmCoordinateSystem): SuperTile {
		return new PointCloudSuperTile(index, coordinateFrame, utmCoordinateSystem, this.pointsMaterial)
	}

	// Get all populated point clouds from all the super tiles.
	getPointClouds(): THREE.Points[] {
		return this.superTiles
			.valueSeq().toArray()
			.filter(st => !!st.pointCloud)
			.map(st => st.pointCloud!)
	}

	/**
	 * Generate a new color palette using HSV space
	 */
	private generateGradient(): void {
		log.info(`Generate color palette....`)
		let gradientValues: number = Math.floor((this.voxelsConfig.voxelsMaxHeight / this.voxelsConfig.voxelSize + 1))
		let height: number = this.voxelsConfig.voxelSize / 2
		for (let i = 0; i < gradientValues; ++i) {
			this.HSVGradient.push(PointCloudTileManager.heightToColor(height, this.voxelsConfig.voxelsMaxHeight))
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

		if (x < 60.0) {
			color[0] = kMax
			color[1] = posSlope * x + kMin
			color[2] = kMin
		} else if (x < 120.0) {
			color[0] = negSlope * x + 2 * kMax + kMin
			color[1] = kMax
			color[2] = kMin
		} else if (x < 180.0) {
			color[0] = kMin
			color[1] = kMax
			color[2] = posSlope * x - 2 * kMax + kMin
		} else if (x < 240.0) {
			color[0] = kMin
			color[1] = negSlope * x + 4 * kMax + kMin
			color[2] = kMax
		} else if (x <= 360) {
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

	// Load a point cloud tile message from a proto binary file.
	private loadTile(tileInstance: TileInstance): Promise<TileMessage> {
		let loader: Promise<Uint8Array>
		let parser: (buffer: Uint8Array) => TileMessage

		if (tileInstance instanceof LocalTileInstance) {
			loader = AsyncFile.readFile(tileInstance.fileSystemPath)
			switch (this.config.tileMessageFormat) {
				case TileMessageFormat.BaseGeometryTileMessage:
					parser = PointCloudTileManager.parseBaseGeometryTileMessage
					break
				case TileMessageFormat.PointCloudTileMessage:
					parser = PointCloudTileManager.parsePointCloudTileMessage
					break
				default:
					return Promise.reject(Error('unknown tileMessageFormat: ' + this.config.tileMessageFormat))
			}
		} else if (tileInstance instanceof RemoteTileInstance) {
			if (tileInstance.layerId === this.config.layerId) {
				loader = this.tileServiceClient.getTileContents(tileInstance.url)
				parser = PointCloudTileManager.parseBaseGeometryTileMessage
			} else {
				return Promise.reject(Error('unknown tileInstance.layerId: ' + tileInstance.layerId))
			}
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

	// TODO kill this legacy method
	// Given a path to a dataset, find all super tiles. Load point cloud data for some of them.
	// Returns true if super tiles were loaded.
	loadFromDirectory(datasetPath: string, coordinateFrame: CoordinateFrameType): Promise<boolean> {
		if (this.isLoadingTiles)
			return Promise.reject(new BusyError('busy loading point cloud'))
		this._isLoadingTiles = true
		return this.resetIsLoadingTiles(
			this.loadFromDirectoryImpl(datasetPath, coordinateFrame)
		)
	}

	// The useful bits of loadFromDirectory()
	private loadFromDirectoryImpl(datasetPath: string, coordinateFrame: CoordinateFrameType): Promise<boolean> {
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
					const utmTile = this.tileInstanceToUtmTile(tileInstance, coordinateFrame)
					this.addTileToSuperTile(utmTile, coordinateFrame, metadata!.name)
				})

				const promises = this.identifyFirstSuperTilesToLoad()
					.map(st => this.loadSuperTile(st))
				return Promise.all(promises)
			})
			.then(() => true) // true because we loaded some SuperTiles
	}

	protected tileInstanceToUtmTile(tileInstance: TileInstance, coordinateFrame: CoordinateFrameType): UtmTile {
		return new PointCloudUtmTile(
			tileInstance.tileIndex,
			this.pointCloudFileLoader(tileInstance, coordinateFrame),
		)
	}

	protected loadFromMapServerImpl(searches: RangeSearch[], coordinateFrame: CoordinateFrameType, loadAllPoints: boolean = false): Promise<boolean> {
		if (this.voxelsConfig.enable)
			log.warn('This app will leak memory when generating voxels while incrementally loading tiles. Fix it.')
		return super.loadFromMapServerImpl(searches, coordinateFrame, loadAllPoints)
	}

	// Get data from a file. Prepare it to instantiate a UtmTile.
	// Returns:
	//  - array of raw position data
	//  - array of raw color data
	//  - count of points
	private pointCloudFileLoader(tileInstance: TileInstance, coordinateFrame: CoordinateFrameType): () => Promise<PointCloudTileContents> {
		return (): Promise<PointCloudTileContents> =>
			this.loadTile(tileInstance)
				.then(msg => {
					if (!(msg.contents instanceof PointCloudTileContents)) {
						throw Error('got bad message contents with type: ' + typeof msg.contents)
					} else if (!msg.contents.points || msg.contents.points.length === 0) {
						return nullContents
					} else if (!this.checkCoordinateSystem(msg, coordinateFrame)) {
						throw Error('checkCoordinateSystem failed on: ' + tileInstance.url)
					} else {
						const [sampledPoints, sampledColors]: Array<Array<number>> = sampleData(msg.contents, this.config.samplingStep)
						const positions = this.rawDataToPositions(sampledPoints, coordinateFrame)
						return new PointCloudTileContents(positions, sampledColors)
					}
				})
	}

	private identifyFirstSuperTilesToLoad(): SuperTile[] {
		return this.superTiles
			.take(this.config.initialSuperTilesToLoad)
			.valueSeq().toArray()
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
			const threePoint = this.utmCoordinateSystem.utmToThreeJs(standardPoint.x, standardPoint.y, standardPoint.z)
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
}
