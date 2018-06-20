/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import config from '@/config'
import * as THREE from 'three'
import * as MapperProtos from '@mapperai/mapper-models'
import Models = MapperProtos.mapper.models
import {threeDStepSize} from "./Constant"
import {baseGeometryTileMessageToTileMessage} from "./Conversion"
import {PointCloudTileContents} from "@/annotator-entry-ui/model/TileContents"
import {TileMessage} from "@/annotator-entry-ui/model/TileMessage"
import {UtmTile} from "./UtmTile"
import {SuperTile} from "./SuperTile"
import {PointCloudUtmTile} from "./PointCloudUtmTile"
import {PointCloudSuperTile} from "./PointCloudSuperTile"
import {UtmCoordinateSystem} from "../UtmCoordinateSystem"
import {convertToStandardCoordinateFrame, CoordinateFrameType} from "../geometry/CoordinateFrame"
import {TileIndex} from "../model/TileIndex"
import {TileServiceClient} from "./TileServiceClient"
import {TileInstance} from "../model/TileInstance"
import Logger from "@/util/log"
import {TileManager, TileManagerConfig} from "@/annotator-entry-ui/tile/TileManager"
import {RangeSearch} from "@/annotator-entry-ui/model/RangeSearch"
import {OrderedMap} from "immutable"
import {ScaleProvider} from "@/annotator-entry-ui/tile/ScaleProvider"

const log = Logger(__filename)

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
		scaleProvider: ScaleProvider,
		utmCoordinateSystem: UtmCoordinateSystem,
		onSuperTileLoad: (superTile: SuperTile) => void,
		onSuperTileUnload: (superTile: SuperTile) => void,
		tileServiceClient: TileServiceClient,
		enableVoxels: boolean,
	) {
		super(
			scaleProvider,
			utmCoordinateSystem,
			onSuperTileLoad,
			onSuperTileUnload,
			tileServiceClient,
		)
		if (config.get('tile_manager.tile_message_format'))
			log.warn('config option tile_manager.tile_message_format has been removed.')
		this.config = {
			layerId: 'base1', // a layer which contains instances of `BaseGeometryTileMessage`
			pointsSize: parseFloat(config.get('annotator.point_render_size')) || 1,
			initialSuperTilesToLoad: parseInt(config.get('tile_manager.initial_super_tiles_to_load'), 10) || 4,
			maximumSuperTilesToLoad: parseInt(config.get('tile_manager.maximum_super_tiles_to_load'), 10) || 10000,
			maximumObjectsToLoad: parseInt(config.get('tile_manager.maximum_points_to_load'), 10) || 100000,
			samplingStep: parseInt(config.get('tile_manager.sampling_step'), 10) || 5,
		}
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

		if (tileInstance.layerId === this.config.layerId) {
			loader = this.tileServiceClient.getTileContents(tileInstance.url)
			parser = PointCloudTileManager.parseBaseGeometryTileMessage
		} else {
			return Promise.reject(Error('unknown tileInstance.layerId: ' + tileInstance.layerId))
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
