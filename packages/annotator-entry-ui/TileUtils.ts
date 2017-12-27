/**
 *  Copyright 2017 Mapper Inc. Part of the mapper-annotator project.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

const config = require('../config')
import * as Fs from 'fs'
import * as Path from 'path'
import * as AsyncFile from 'async-file'
import * as THREE from 'three'
import * as MapperProtos from '@mapperai/mapper-models'
import Models = MapperProtos.mapper.models
import * as TypeLogger from 'typelogger'
import {UtmInterface} from "./UtmInterface"
import {BufferGeometry} from "three"

// tslint:disable-next-line:no-any
TypeLogger.setLoggerOutput(console as any)
const log = TypeLogger.getLogger(__filename)

export enum CoordinateFrameType {
	CAMERA = 0, // [northing, -altitude, easting]
	INERTIAL,    // [northing, easting, -altitude]
	CES_TEST,
}

const threeDStepSize: number = 3

let warningDelivered = false

/**
 * Load a point cloud tile message from a proto binary file
 */
function loadTile(filename: string): Promise<Models.PointCloudTileMessage> {
	return AsyncFile.readFile(filename)
		.then(buffer => Models.PointCloudTileMessage.decode(buffer))
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
}

const sampleData = (msg: Models.PointCloudTileMessage, step: number): Array<Array<number>> => {
	if (step <= 0) {
		log.error("Can't sample data. Step should be > 0.")
		return []
	}
	if (!msg.points) {
		log.error("PointCloudTileMessage is missing points")
		return []
	}
	if (!msg.colors) {
		log.error("PointCloudTileMessage is missing colors")
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

/**
 * Convert a 3D point to our standard format: [easting, northing, altitude]
 * @returns Point in standard coordinate frame format.
 */
const convertToStandardCoordinateFrame = (point: THREE.Vector3, pointCoordinateFrame: CoordinateFrameType): THREE.Vector3 | null => {
	switch (pointCoordinateFrame) {
		case CoordinateFrameType.CAMERA:
			// Raw input is [x: northing, y: -altitude, z: easting]
			return new THREE.Vector3(point.z, point.x, -point.y)
		case CoordinateFrameType.INERTIAL:
			// Raw input is [x: northing, y: easting, z: -altitude]
			return new THREE.Vector3(point.y, point.x, -point.z)
		case CoordinateFrameType.CES_TEST:
			return new THREE.Vector3(point.y, point.x, point.z)
		default:
			log.warn('Coordinate frame not recognized')
			return null
	}
}

export class TileManager extends UtmInterface {

	// All points are stored with reference to UTM origin and offset,
	// but using the local coordinate system which has different axes.
	pointCloud: THREE.Points
	rawPositions: Array<number>
	rawColors: Array<number>
	maxTilesToLoad: number
	progressStepSize: number
	samplingStep: number

	constructor() {
		super()

		this.pointCloud = new THREE.Points(
			new THREE.BufferGeometry(),
			new THREE.PointsMaterial({size: 0.05, vertexColors: THREE.VertexColors})
		)
		this.rawPositions = new Array<number>(0)
		this.rawColors = new Array<number>(0)
		this.maxTilesToLoad = parseInt(config.get('tile_manager.max_tiles_to_load'), 10) || 2000
		this.progressStepSize = parseInt(config.get('tile_manager.progress_step_size'), 10) || 100
		this.samplingStep = parseInt(config.get('tile_manager.sampling_step'), 10) || 5
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

	// "default" according to protobuf rules for default values
	private static isDefaultUtmZone(num: number, northernHemisphere: boolean): boolean {
		return num === 0 && northernHemisphere === false
	}

	// The first tile we see defines the local origin and UTM zone for the lifetime of the application.
	// All other data is expected to lie in the same zone.
	private checkCoordinateSystem(msg: Models.PointCloudTileMessage, inputCoordinateFrame: CoordinateFrameType): boolean {
		const num = msg.utmZoneNumber
		const northernHemisphere = msg.utmZoneNorthernHemisphere
		if (!num || northernHemisphere === null)
			return false
		const inputPoint = new THREE.Vector3(msg.originX, msg.originY, msg.originZ)
		const p = convertToStandardCoordinateFrame(inputPoint, inputCoordinateFrame)

		if (!p)
			return false
		else if (this.setOrigin(num, northernHemisphere, p))
			return true
		else
			return TileManager.isDefaultUtmZone(num, northernHemisphere)
				|| this.utmZoneNumber === num && this.utmZoneNorthernHemisphere === northernHemisphere
	}

	/**
	 * Replace existing geometry with a new one.
	 */
	private setGeometry(newGeometry: BufferGeometry): void {
		const oldGeometry = this.pointCloud.geometry
		this.pointCloud.geometry = newGeometry
		oldGeometry.dispose() // There is a vague and scary note in the docs about doing this, so here we go.
	}

	/**
	 * Given a path to a dataset it loads all PointCloudTiles computed for display and
	 * merges them into a single super tile.
	 * @returns the center point of the bounding box of the data; hopefully
	 *   there will be something to look at there
	 */
	async loadFromDataset(datasetPath: string, coordinateFrame: CoordinateFrameType): Promise<THREE.Vector3 | null> {
		let points: Array<number> = []
		let colors: Array<number> = []
		const files = Fs.readdirSync(datasetPath)
		let coordsFailed = 0
		let maxFileCount = files.length
		if (maxFileCount > this.maxTilesToLoad) maxFileCount = this.maxTilesToLoad

		const printProgress = function (current: number, total: number, stepSize: number): void {
			if (total <= (stepSize * 2)) return
			if (current % stepSize === 0) log.info(`processing ${current} of ${total} files`)
		}

		for (let i = 0; i < maxFileCount; i++) {
			printProgress(i, maxFileCount, this.progressStepSize)

			if (files[i] === 'tile_index.md' || files[i] === '.DS_Store') {
				continue
			}

			const msg = await loadTile(Path.join(datasetPath, files[i]))

			if (!msg.points || msg.points.length === 0) {
				continue
			}

			if (!this.checkCoordinateSystem(msg, coordinateFrame)) {
				coordsFailed++
				continue
			}

			const [sampledPoints, sampledColors]: Array<Array<number>> = sampleData(msg, this.samplingStep)

			points = points.concat(sampledPoints)
			colors = colors.concat(sampledColors)
		}

		log.info("Num loaded points: " + points.length / 3)

		if (coordsFailed) {
			log.warn('rejected ' + coordsFailed + ' tiles due to UTM zone mismatch')
		}

		return Promise.resolve(this.generatePointCloudFromRawData(points, colors, coordinateFrame))
	}

	/**
	 * Convert array of 3d points into a THREE.Point object
	 */
	generatePointCloudFromRawData(points: Array<number>, inputColors: Array<number>, inputCoordinateFrame: CoordinateFrameType): THREE.Vector3 | null {
		const pointsSize = points.length
		const newPositions = new Array<number>(pointsSize)

		for (let i = 0; i < pointsSize; i += threeDStepSize) {
			const inputPoint = new THREE.Vector3(points[i], points[i + 1], points[i + 2])
			const standardPoint = convertToStandardCoordinateFrame(inputPoint, inputCoordinateFrame)
			if (standardPoint) {
				const threePoint = this.utmToThreeJs(standardPoint.x, standardPoint.y, standardPoint.z)

				newPositions[i] = threePoint.x
				newPositions[i + 1] = threePoint.y
				newPositions[i + 2] = threePoint.z
			}
		}

		if (newPositions.length) {
			if (this.rawPositions.length > 0) {
				this.rawPositions = this.rawPositions.concat(newPositions)
				this.rawColors = this.rawColors.concat(inputColors)
			} else {
				this.rawPositions = newPositions
				this.rawColors = inputColors
			}

			const geometry = new THREE.BufferGeometry()
			geometry.addAttribute('position', new THREE.BufferAttribute(Float32Array.from(this.rawPositions), threeDStepSize))
			geometry.addAttribute('color', new THREE.BufferAttribute(Float32Array.from(this.rawColors), threeDStepSize))

			this.setGeometry(geometry)
		}

		return this.centerPoint()
	}

	/**
	 * Finds the center of the bottom of the bounding box, so that when we view the model
	 * the whole thing appears above the artificial ground plane.
	 */
	centerPoint(): THREE.Vector3 | null {
		if (this.pointCloud && this.rawPositions.length) {
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
		this.rawPositions = new Array<number>(0)
		this.rawColors = new Array<number>(0)
		this.setGeometry(new THREE.BufferGeometry())
	}
}
