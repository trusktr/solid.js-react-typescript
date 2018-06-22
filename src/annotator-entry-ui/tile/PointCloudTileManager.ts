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
		onSuperTileLoad: (superTile: SuperTile) => void,
		onSuperTileUnload: (superTile: SuperTile) => void,
		tileServiceClient: TileServiceClient,
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
		}

		return newPositions
	}
}
