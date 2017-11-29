/**
 *  Copyright 2017 Mapper Inc. Part of the mapper-annotator project.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as Fs from 'fs'
import * as Path from 'path'
import * as AsyncFile from 'async-file'
import * as THREE from 'three'
import * as MapperProtos from '@mapperai/mapper-models'
import Models = MapperProtos.com.mapperai.models
import * as TypeLogger from 'typelogger'
import {UtmInterface} from "./UtmInterface"
import {BufferGeometry} from "three"

TypeLogger.setLoggerOutput(console as any)
const log = TypeLogger.getLogger(__filename)

export enum CoordinateFrameType {
	CAMERA = 0, // [northing, -altitude, easting]
	INERTIAL    // [northing, easting, -altitude]
}

const threeDStepSize: number = 3

/**
 * This opens a binary file for reading
 * @param filename
 * @returns {Promise<Buffer>}
 */
function readFile(filename : string) : Promise<Buffer> {
	return AsyncFile.readFile(filename)
}

/**
 * Load a point cloud tile message from a proto binary file
 * @param filename
 * @returns {Promise<com.mapperai.models.PointCloudTileMessage>}
 */
async function loadTile(filename : string) :  Promise<Models.PointCloudTileMessage> {
	let buffer = await readFile(filename)
	return Models.PointCloudTileMessage.decode(buffer as any)
}

const sampleData = (msg : Models.PointCloudTileMessage, step : number) => {
	if (step <= 0) {
		log.error("Can't sample data. Step should be > 0.")
		return
	}
	
	let sampledPoints : Array<number> = []
	let sampledColors : Array<number> = []
	let stride = step * threeDStepSize

	for (let i=0; i < msg.points.length; i+=stride) {
		// Assuming the utm points are: easting, northing, altitude
		sampledPoints.push(msg.points[i])
		sampledPoints.push(msg.points[i+1])
		sampledPoints.push(msg.points[i+2])
		sampledColors.push(msg.colors[i])
		sampledColors.push(msg.colors[i+1])
		sampledColors.push(msg.colors[i+2])
	}
	return [sampledPoints, sampledColors]
}

export class SuperTile extends UtmInterface {

	// All points are stored with reference to UTM origin and offset,
	// but using the local coordinate system which has different axes.
	pointCloud : THREE.Points
	rawPositions: Array<number>
	rawColors: Array<number>
	maxTilesToLoad : number
	progressStepSize: number
	samplingStep : number

	constructor() {
		super()

		this.pointCloud = new THREE.Points(
			new THREE.BufferGeometry(),
			new THREE.PointsMaterial({size: 0.05, vertexColors: THREE.VertexColors})
		)
		this.rawPositions = new Array<number>(0)
		this.rawColors = new Array<number>(0)
		this.maxTilesToLoad = 2000
		this.progressStepSize = 100
		this.samplingStep = 5
		this.pointCloud = null
	}

	toString(): string {
		let offsetStr
		if (this.offset === undefined) {
			offsetStr = 'undefined'
		} else {
			offsetStr = this.offset.x + ',' + this.offset.y + ',' + this.offset.z
		}
		return 'SuperTile(UTM Zone: ' + this.utmZoneNumber + this.utmZoneLetter + ', offset: [' + offsetStr + '])';
	}

	// "default" according to protobuf rules for default values
	private static isDefaultUtmZone(number: number, letter: string): boolean {
		return number === 0 && letter === ""
	}

	// The first tile we see defines the local origin and UTM zone for the lifetime of the application.
	// All other data is expected to lie in the same zone.
	private checkCoordinateSystem(msg: Models.PointCloudTileMessage, coordinateFrame: CoordinateFrameType): boolean {
		const number = msg.utmZoneNumber
		const letter = msg.utmZoneLetter
		let p : THREE.Vector3
		switch (coordinateFrame) {
			case CoordinateFrameType.CAMERA:
				// Raw input is [x: northing, y: -altitude, z: easting]
				p = new THREE.Vector3(msg.originZ, msg.originX, -msg.originY)
				break
			case CoordinateFrameType.INERTIAL:
				// Raw input is [x: northing, y: easting, z: -altitude]
				p = new THREE.Vector3(msg.originY, msg.originX, -msg.originZ)
				break
			default:
				log.warn('Coordinate frame not recognized')
		}
		if (this.setOrigin(number, letter, p)) {
			return true
		} else {
			return SuperTile.isDefaultUtmZone(number, letter)
				|| this.utmZoneNumber === number && this.utmZoneLetter === letter
		}
	}

	/**
	 * Replace existing geometry with a new one.
	 */
	private setGeometry(newGeometry: BufferGeometry) {
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
	async loadFromDataset(datasetPath: string, coordinateFrame: CoordinateFrameType): Promise<THREE.Vector3> {
		let points:Array<number> = []
		let colors:Array<number> = []
		let files = Fs.readdirSync(datasetPath)
		let coordsFailed = 0
		let maxFileCount = files.length
		if (maxFileCount > this.maxTilesToLoad) maxFileCount = this.maxTilesToLoad

		let printProgress = function (current: number, total: number, stepSize: number) {
			if (total <= (stepSize * 2)) return
			if (current % stepSize === 0) log.info(`processing ${current} of ${total} files`)
		}

		for (let i=0; i < maxFileCount; i++) {
			printProgress(i, maxFileCount, this.progressStepSize)

			if (files[i] === 'tile_index.md' || files[i] === '.DS_Store') {
				continue
			}

			let msg  = await loadTile(Path.join(datasetPath, files[i]))

			if (msg.points.length === 0) {
				continue
			}
			
			if (!this.checkCoordinateSystem(msg, coordinateFrame)) {
				coordsFailed++
				return
			}

			let [sampledPoints, sampledColors] = sampleData(msg, this.samplingStep)

			points = points.concat(sampledPoints)
			colors = colors.concat(sampledColors)
		}

		log.info("Num loaded points: " + points.length/3)
		
		if (coordsFailed) {
			log.warn('rejected ' + coordsFailed + ' tiles due to UTM zone mismatch')
		}

		return Promise.resolve(this.generatePointCloudFromRawData(points, colors, coordinateFrame))
	}

	/**
	 * Convert array of 3d points into a THREE.Point object
	 */
	generatePointCloudFromRawData(points: Array<number>, inputColors: Array<number>, coordinateFrame: CoordinateFrameType): THREE.Vector3 {
		const points_size = points.length
		const newPositions = new Array<number>(points_size)

		for (let i = 0; i < points_size; i += threeDStepSize) {
			// This function assumes that points are ordered as: [+x:easting, +y:northing, +z:altitude]
			let p : THREE.Vector3
			switch (coordinateFrame) {
				case CoordinateFrameType.CAMERA:
					// Raw input is [x: northing, y: -altitude, z: easting]
					p = this.utmToThreeJs(points[i+2], points[i], -points[i+1])
					break
				case CoordinateFrameType.INERTIAL:
					// Raw input is [x: northing, y: easting, z: -altitude]
					p = this.utmToThreeJs(points[i+1], points[i], -points[i+2])
					break
				default:
					log.warn('Coordinate frame not recognized')
			}
			
			newPositions[i] = p.x
			newPositions[i+1] = p.y
			newPositions[i+2] = p.z
		}

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
		return this.centerPoint()
	}

	/**
	 * Finds the center of the bottom of the bounding box, so that when we view the model
	 * the whole thing appears above the artificial ground plane.
	 */
	centerPoint(): THREE.Vector3 {
		if (this.pointCloud) {
			const geometry = this.pointCloud.geometry
			geometry.computeBoundingBox()
			return geometry.boundingBox.getCenter().setY(geometry.boundingBox.min.y)
		} else {
			return
		}
	}

	/**
	 * Clean slate.
	 */
	unloadAllPoints() {
		this.rawPositions = new Array<number>(0)
		this.rawColors = new Array<number>(0)
		this.setGeometry(new THREE.BufferGeometry())
	}
}
