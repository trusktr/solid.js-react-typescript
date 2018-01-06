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
import {SuperTile} from "./SuperTile"
import {UtmTile} from "./UtmTile"
import {UtmInterface} from "../UtmInterface"
import {BufferGeometry} from "three"
import {convertToStandardCoordinateFrame, CoordinateFrameType} from "../geometry/CoordinateFrame"
import {Scale3D} from "../geometry/Scale3D"
import {TileIndex} from "../model/TileIndex"
import LocalStorage from "../state/LocalStorage"

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
const utmTileScale = configToSharedScale('tile_manager.utm_tile_scale')
const superTileScale = configToSharedScale('tile_manager.super_tile_scale')
if (!superTileScale.isMultipleOf(utmTileScale))
	throw Error('super_tile_scale must be a multiple of utm_tile_scale')

const threeDStepSize: number = 3
const loadedSuperTileKeysKey = 'loadedSuperTileKeys'
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
	private storage: LocalStorage // persistent state for UI settings
	hasGeometry: boolean
	superTiles: OrderedMap<string, SuperTile> // all super tiles which we are aware of
	loadedSuperTileKeys: OrderedSet<string> // keys to super tiles which have some content loaded in memory
	// This composite point cloud contains all super tile data, in a single structure for three.js rendering.
	// All points are stored with reference to UTM origin and offset,
	// but using the local coordinate system which has different axes.
	pointCloud: THREE.Points
	voxelsMeshGroup: Array<THREE.Mesh>
	voxelsDictionary: Set<THREE.Vector3>
	voxelSize: number
	private onSuperTileUnload: (superTile: SuperTile) => void
	private initialSuperTilesToLoad: number // preload some super tiles; initially we don't know how many points they will contain
	private maximumPointsToLoad: number // after loading super tiles we can trim them back by point count
	private samplingStep: number
 
	constructor(onSuperTileUnload: (superTile: SuperTile) => void) {
		super()
		this.storage = new LocalStorage()
		this.onSuperTileUnload = onSuperTileUnload
		this.hasGeometry = false
		this.superTiles = OrderedMap()
		this.setLoadedSuperTileKeys(OrderedSet())
		const pointsSize = parseFloat(config.get('annotator.point_render_size')) || 1
		this.pointCloud = new THREE.Points(
			new THREE.BufferGeometry(),
			new THREE.PointsMaterial({size: pointsSize, vertexColors: THREE.VertexColors})
		)
		this.voxelsMeshGroup = []
		this.voxelsDictionary = new Set<THREE.Vector3>()
		this.voxelSize = 0.3
		this.initialSuperTilesToLoad = parseInt(config.get('tile_manager.initial_super_tiles_to_load'), 10) || 4
		this.maximumPointsToLoad = parseInt(config.get('tile_manager.maximum_points_to_load'), 10) || 100000
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

	// Update state of which super tiles are loaded; and save that state for use when the application is reloaded.
	private setLoadedSuperTileKeys(newKeys: OrderedSet<string>): void {
		this.loadedSuperTileKeys = newKeys
		this.setSuperTilesPreference()
	}

	private setSuperTilesPreference(): void {
		if (!this.loadedSuperTileKeys.isEmpty())
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
     * Create voxels geometry given a list of indices for the occupied voxels
     */
    generateVoxels(): void {

    	log.warn(`There are ${this.voxelsDictionary.size} voxels. Start creating them....`)

		// Voxel params
		let voxelSizeForRender = 0.9 * this.voxelSize
		let maxVoxelsPerArray: number = 100000

		// Voxels buffers
    	const allPositions = new Array<Array<number>>()
		let positions: Array<number> = []

		// Generate voxels
		let count: number = 0
		let voxelIndex: THREE.Vector3
		for (voxelIndex of this.voxelsDictionary) {

			if (count % maxVoxelsPerArray === 0) {
				positions = new Array<number>()
				allPositions.push(positions)
				log.warn(`Processing voxel ${count}`)
			}
			count++

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
		}
		log.warn('Done generating voxels.')

		log.warn('Add them to the mesh....')
		for (let j = 0; j < allPositions.length; j++) {
			let floatBuffer = new THREE.Float32BufferAttribute(allPositions[j], 3)
			let buffer = new THREE.BufferGeometry()
			buffer.addAttribute('position', floatBuffer);
			let voxelsMesh = new THREE.Mesh(buffer, new THREE.MeshLambertMaterial({
				color: new THREE.Color(1, 1, 1),
				side: THREE.DoubleSide
			}))
			this.voxelsMeshGroup.push(voxelsMesh)
		}
		log.warn('Done adding them to the mesh.')
	}

	/**
	 * Given a path to a dataset, find all super tiles. Load point cloud data for some of them.
	 */
	loadFromDataset(datasetPath: string, coordinateFrame: CoordinateFrameType): Promise<void> {
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
						new TileIndex(utmTileScale, metadata!.index.x, metadata!.index.y, metadata!.index.z),
						this.pointCloudFileLoader(Path.join(datasetPath, metadata!.name), coordinateFrame),
					)
					const superTile = this.getOrCreateSuperTile(utmTile.superTileIndex(superTileScale), coordinateFrame)
					if (!superTile.addTile(utmTile))
						log.warn(`addTile() failed for ${metadata!.name}`)
				})

				const promises = this.identifyFirstSuperTilesToLoad()
					.map(st => this.loadSuperTile(st))
				return Promise.all(promises)
			})
			.then(() => this.generatePointCloudFromSuperTiles())
	}

	// Get data from a file. Prepare it to instantiate a UtmTile.
	// Returns:
	//  - array of raw position data
	//  - array of raw color data
	//  - count of points
	private pointCloudFileLoader(filename: string, coordinateFrame: CoordinateFrameType): () => Promise<[number[], number[], number]> {
		return (): Promise<[number[], number[], number]> =>
			loadTile(filename)
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

	// Load data for a single SuperTile. This assumes that loadFromDataset() already happened.
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
		if (this.loadedSuperTileKeys.contains(key))
			return Promise.resolve(true)
		else
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
		let rawPositions: Array<number> = []
		let rawColors: Array<number> = []

		this.superTiles.forEach(st => {
			if (st && st.hasPointCloud) {
				rawPositions = rawPositions.concat(st.getRawPositions())
				rawColors = rawColors.concat(st.getRawColors())
			}
		})

		const geometry = new THREE.BufferGeometry()
		geometry.addAttribute('position', new THREE.BufferAttribute(Float32Array.from(rawPositions), threeDStepSize))
		geometry.addAttribute('color', new THREE.BufferAttribute(Float32Array.from(rawColors), threeDStepSize))
		this.setGeometry(geometry)
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
		this.setGeometry(new THREE.BufferGeometry())
		this.hasGeometry = false
	}
}
