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
import {PointCloudTileContents} from "@/mapper-annotated-scene/tile-model/TileContents"
import {TileMessage} from "@/mapper-annotated-scene/tile-model/TileMessage"
import {UtmTile} from "./UtmTile"
import {SuperTile} from "./SuperTile"
import {PointCloudUtmTile} from "./PointCloudUtmTile"
import {PointCloudSuperTile} from "./PointCloudSuperTile"
import {UtmCoordinateSystem} from "../UtmCoordinateSystem"
import {convertToStandardCoordinateFrame, CoordinateFrameType} from "../geometry/CoordinateFrame"
import {TileIndex} from "@/mapper-annotated-scene/tile-model/TileIndex"
import {TileServiceClient} from "./TileServiceClient"
import {TileInstance} from "@/mapper-annotated-scene/tile-model/TileInstance"
import Logger from "@/util/log"
import {TileManager, TileManagerConfig} from "@/mapper-annotated-scene/tile/TileManager"
import {OrderedMap} from "immutable"
import {ScaleProvider} from "@/mapper-annotated-scene/tile/ScaleProvider"
import AnnotatedSceneActions from "@/mapper-annotated-scene/src/store/actions/AnnotatedSceneActions.ts";

const log = Logger(__filename)

const nullContents = new PointCloudTileContents([], [])

interface PointCloudTileManagerConfig extends TileManagerConfig {
	pointsSize: number,
	samplingStep: number,
	maxPointsDensity: number,
}

// This handles loading and unloading point cloud data (for read only). Each SuperTile has a point cloud,
// consolidated from its constituent Tiles, which when loaded is merged into a single data structure for
// three.js rendering.
//
// TODO JOE, there's TileManager base class, but there probably needs to be a
// higher-level "tile managers" manager that manages which tiles (AoIs) need to
// load in each layer (in each TileManager).
export class PointCloudTileManager extends TileManager {
	protected readonly config: PointCloudTileManagerConfig
	superTiles: OrderedMap<string, PointCloudSuperTile> // all super tiles which we are aware of
	private pointsMaterial: THREE.PointsMaterial

	constructor(
		scaleProvider: ScaleProvider,
		utmCoordinateSystem: UtmCoordinateSystem,
		tileServiceClient: TileServiceClient,
	) {
		super(
			scaleProvider,
			utmCoordinateSystem,
			tileServiceClient,
		)
		if (config['tile_manager.tile_message_format'])
			log.warn('config option tile_manager.tile_message_format has been removed.')
		this.config = {
			layerId: 'base1', // a layer which contains instances of `BaseGeometryTileMessage`
			pointsSize: parseFloat(config['annotator.point_render_size']) || 1,
			initialSuperTilesToLoad: parseInt(config['tile_manager.initial_super_tiles_to_load'], 10) || 4,
			maximumSuperTilesToLoad: parseInt(config['tile_manager.maximum_super_tiles_to_load'], 10) || 10000,
			maximumObjectsToLoad: parseInt(config['tile_manager.maximum_points_to_load'], 10) || 100000,
			samplingStep: parseInt(config['tile_manager.sampling_step'], 10) || 5,
			maxPointsDensity: parseInt(config['tile_manager.maximum_point_density'], 10) || 0,
		}
		if (this.config.samplingStep <= 0)
			throw Error(`Bad config 'tile_manager.sampling_step' = ${this.config.samplingStep}. Step should be > 0.`)
		this.pointsMaterial = new THREE.PointsMaterial({
			size: this.config.pointsSize,
			sizeAttenuation: false,
			vertexColors: THREE.VertexColors,
		})

		this.setPointCloud = (superTiles:OrderedMap<string, SuperTile>) => {new AnnotatedSceneActions().setPointCloudSuperTiles(superTiles)}
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
						const [sampledPoints, sampledColors]: Array<Array<number>> = this.sampleData(msg.contents, tileInstance.tileIndex.scale.volume)
						const positions = this.rawDataToPositions(sampledPoints, coordinateFrame)
						return new PointCloudTileContents(positions, sampledColors)
					}
				})
	}

	// Some point clouds are too dense to be useful. Thin them out and discard excess points. Better late than never.
	private sampleData(contents: PointCloudTileContents, tileVolume: number): Array<Array<number>> {
		if (!contents.points) {
			log.error("tile message is missing points")
			return [[], []]
		}
		if (!contents.colors) {
			log.error("tile message is missing colors")
			return [[], []]
		}

		// Take the more restrictive of two config settings. One is a linear sampling rate. The other
		// is a variable sampling rate based on the local density of each tile.
		let samplingStep = this.config.samplingStep
		if (this.config.maxPointsDensity > 0) {
			const pointCount = contents.points.length / threeDStepSize
			const pointDensity = pointCount / tileVolume
			if (pointDensity > this.config.maxPointsDensity) {
				const densitySamplingStep = Math.ceil(pointDensity / this.config.maxPointsDensity)
				if (densitySamplingStep > samplingStep)
					samplingStep = densitySamplingStep
			}
		}

		if (samplingStep <= 1)
			return [contents.points, contents.colors]

		const sampledPoints: Array<number> = []
		const sampledColors: Array<number> = []
		const stride = samplingStep * threeDStepSize

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
		}

		return newPositions
	}
}
