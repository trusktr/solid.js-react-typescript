/**
 *  Copyright 2017 Mapper Inc. Part of the mapper-annotator project.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

const config = require('../../config')
import * as Fs from 'fs'
import * as Path from 'path'
import * as AsyncFile from 'async-file'
import {OrderedMap} from 'immutable'
import * as THREE from 'three'
import * as MapperProtos from '@mapperai/mapper-models'
import Models = MapperProtos.mapper.models
import * as TypeLogger from 'typelogger'
import {SuperTile} from "./SuperTile"
import {UtmTile} from "./UtmTile"
import {UtmInterface} from "../UtmInterface"
import {BufferGeometry} from "three"
import {convertToStandardCoordinateFrame, CoordinateFrameType} from "../geometry/CoordinateFrame"
import {Scale3D} from "../geometry/Scale3D"
import {TileIndex} from "../model/TileIndex"

// tslint:disable-next-line:no-any
TypeLogger.setLoggerOutput(console as any)
const log = TypeLogger.getLogger(__filename)

// Set the dimensions of tiles and super tiles.
// Super tile boundaries coincide with tile boundaries, with no overlap.
function configToSharedScale(key: string): Scale3D {
	const tileScaleConfig: [number, number, number] = config.get(key) || [10, 10, 10]
	if (tileScaleConfig.length !== 3) throw Error(`invalid ${key} configuration '${tileScaleConfig}'`)
	tileScaleConfig.forEach(n => {
		if (isNaN(n) || n <= 0)
			throw Error(`invalid ${key} configuration '${tileScaleConfig}'`)
	})
	return new Scale3D(tileScaleConfig)
}
const tileScale = configToSharedScale('tile_manager.tile_scale')
const superTileScale = configToSharedScale('tile_manager.super_tile_scale')
if (!superTileScale.isMultipleOf(tileScale))
	throw Error('super_tile_scale must be a multiple of tile_scale')

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

export class TileManager extends UtmInterface {

	private hasGeometry: boolean
	// All super tiles which have some content loaded in memory.
	superTiles: OrderedMap<string, SuperTile>
	// This composite point cloud contains all super tile data, in a single structure for three.js rendering.
	// All points are stored with reference to UTM origin and offset,
	// but using the local coordinate system which has different axes.
	pointCloud: THREE.Points
	private initialSuperTilesToLoad: number
	private maxSuperTilesToLoad: number
	private samplingStep: number

	constructor() {
		super()
		this.hasGeometry = false
		this.superTiles = OrderedMap()
		this.pointCloud = new THREE.Points(
			new THREE.BufferGeometry(),
			new THREE.PointsMaterial({size: 0.05, vertexColors: THREE.VertexColors})
		)
		this.initialSuperTilesToLoad = parseInt(config.get('tile_manager.initial_super_tiles_to_load'), 10) || 4
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
	private checkCoordinateSystem(msg: Models.PointCloudTileMessage, inputCoordinateFrame: CoordinateFrameType): boolean {
		const num = msg.utmZoneNumber
		const northernHemisphere = msg.utmZoneNorthernHemisphere
		if (!num || northernHemisphere === null)
			return false
		const inputPoint = new THREE.Vector3(msg.originX, msg.originY, msg.originZ)
		const p = convertToStandardCoordinateFrame(inputPoint, inputCoordinateFrame)

		if (this.setOrigin(num, northernHemisphere, p))
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
		this.hasGeometry = true // Wouldn't it be nice if BufferGeometry had a method to do this?
		oldGeometry.dispose() // There is a vague and scary note in the docs about doing this, so here we go.
	}

	/**
	 * Given a path to a dataset, find all super tiles. Load point cloud data for some of them.
	 * @returns the center point of the bounding box of the data; hopefully
	 *   there will be something to look at there
	 */
	loadFromDataset(datasetPath: string, coordinateFrame: CoordinateFrameType, estimateGroundPlane: boolean): Promise<[THREE.Vector3 | null, number | null]> {
		// Consider all tiles within datasetPath.
		const fileMetadatas = Fs.readdirSync(datasetPath)
			.map(name => tileFileNameToTileMetadata(name))
			.filter(metadata => metadata !== null)
		if (!fileMetadatas.length)
			return Promise.reject(Error('no tiles found at ' + datasetPath))

		// Ensure that we have a valid coordinate system before doing anything else.
		const firstTilePromise = loadTile(Path.join(datasetPath, fileMetadatas[0]!.name))
			.then(firstMessage => {
				if (this.checkCoordinateSystem(firstMessage, coordinateFrame))
					return Promise.resolve()
				else
					return Promise.reject(Error('checkCoordinateSystem failed on first tile: ' + fileMetadatas[0]!.name))
			})

		// Instantiate tile and super tile classes for all the data.
		// Load some of the data to get us started.
		return firstTilePromise
			.then(() => {
				fileMetadatas.forEach(metadata => {
					const utmTile = new UtmTile(
						new TileIndex(tileScale, metadata!.index.x, metadata!.index.y, metadata!.index.z),
						this.loader(Path.join(datasetPath, metadata!.name), coordinateFrame),
					)
					const superTile = this.getOrCreateSuperTile(utmTile.superTileIndex(superTileScale), coordinateFrame)
					if (!superTile.addTile(utmTile))
						log.warn(`addTile() failed for ${metadata!.name}`)
				})

				const promises = this.superTiles
					.take(this.initialSuperTilesToLoad)
					.valueSeq().toArray().map(st => st.loadPointCloud())
				return Promise.all(promises)
			})
			.then(() => this.generatePointCloudFromSuperTiles())
	}

	loadFromSuperTile(superTile: SuperTile): Promise<[THREE.Vector3 | null, number | null]> {
		return superTile.loadPointCloud()
			.then(() => this.generatePointCloudFromSuperTiles())
	}

	private loader(filename: string, coordinateFrame: CoordinateFrameType):     () => Promise<[number[], number[]]> {
		return (): Promise<[number[], number[]]> =>
			loadTile(filename)
				.then(msg => {
					if (!msg.points || msg.points.length === 0) {
						return [[], []] as [number[], number[]]
					} else if (!this.checkCoordinateSystem(msg, coordinateFrame)) {
						throw Error('checkCoordinateSystem failed on: ' + filename)
					} else {
						const [sampledPoints, sampledColors]: Array<Array<number>> = sampleData(msg, this.samplingStep)
						const positions = this.rawDataToPositions(sampledPoints, coordinateFrame)
						return [positions, sampledColors] as [number[], number[]]
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
			const threePoint = this.utmToThreeJs(standardPoint.x, standardPoint.y, standardPoint.z)
			newPositions[i] = threePoint.x
			newPositions[i + 1] = threePoint.y
			newPositions[i + 2] = threePoint.z
		}

		return newPositions
	}

	/*
	 * Set the current denormalized point cloud.
	 * Return some summary values for UI display.
	 * @returns
	 *   centerPoint        a point at the bottom center of the cloud
	 *   groundPlaneZIndex  estimated height of the ground plane
	 */
	private generatePointCloudFromSuperTiles(): [THREE.Vector3 | null, number | null] {
		let rawPositions: Array<number> = []
		let rawColors: Array<number> = []

		this.superTiles.forEach(st => {
			if (st && st.hasPointCloud) {
				rawPositions = rawPositions.concat(st.rawPositions)
				rawColors = rawColors.concat(st.rawColors)
			}
		})

		const geometry = new THREE.BufferGeometry()
		geometry.addAttribute('position', new THREE.BufferAttribute(Float32Array.from(rawPositions), threeDStepSize))
		geometry.addAttribute('color', new THREE.BufferAttribute(Float32Array.from(rawColors), threeDStepSize))
		this.setGeometry(geometry)

		const groundPlaneZIndex = null
		return [this.centerPoint(), groundPlaneZIndex]
	}

	/**
	 * Convert array of 3d points into a THREE.Point object
	 */
	generatePointCloudFromRawData(
		points: Array<number>,
		inputColors: Array<number>,
		inputCoordinateFrame: CoordinateFrameType,
		estimateGroundPlane: boolean
	): [THREE.Vector3 | null, number | null] {
		const pointsSize = points.length
		const newPositions = new Array<number>(pointsSize)

		// This is a trivial solution to finding the local ground plane. Simply find a band of Z values with the most
		// points (arithmetic mode). Assume that band contains a large horizontal object which is a road.
		const zValueHistogram: Map<number, number> = new Map()
		const zValueBinSize = 10 // arbitrary setting for the physical size of bins, given data sets ~50m high
		let biggestBinIndex = 0
		let biggestBinCount = 0

		for (let i = 0; i < pointsSize; i += threeDStepSize) {
			const inputPoint = new THREE.Vector3(points[i], points[i + 1], points[i + 2])
			const standardPoint = convertToStandardCoordinateFrame(inputPoint, inputCoordinateFrame)
			const threePoint = this.utmToThreeJs(standardPoint.x, standardPoint.y, standardPoint.z)

			newPositions[i] = threePoint.x
			newPositions[i + 1] = threePoint.y
			newPositions[i + 2] = threePoint.z

			if (estimateGroundPlane) {
				const zIndex = Math.floor(standardPoint.z * zValueBinSize)
				if (zValueHistogram.has(zIndex))
					zValueHistogram.set(zIndex, zValueHistogram.get(zIndex)! + 1)
				else
					zValueHistogram.set(zIndex, 1)
			}
		}

		if (newPositions.length) {

			if (estimateGroundPlane) {
				zValueHistogram.forEach((count, index) => {
					if (count > biggestBinCount) {
						biggestBinIndex = index
						biggestBinCount = count
					}
				})
			}
		}

		let groundPlaneZIndex: number | null = null
		if (biggestBinCount)
			groundPlaneZIndex = (biggestBinIndex + 0.5) / zValueBinSize // Get the midpoint of the most popular bin.

		return [this.centerPoint(), groundPlaneZIndex]
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
		this.superTiles = OrderedMap()
		this.setGeometry(new THREE.BufferGeometry())
		this.hasGeometry = false
	}
}
