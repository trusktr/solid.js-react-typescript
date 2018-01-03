/**
 *  Copyright 2017 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as THREE from 'three'
import {TileIndex} from "../model/TileIndex"
import {UtmTile} from "./UtmTile"
import {convertToStandardCoordinateFrame, CoordinateFrameType} from "../geometry/CoordinateFrame"
import {UtmInterface} from "../UtmInterface"

/*
 * A collection of zero or more tiles within a unique, contiguous 3D volume.
 * Tile data can be added progressively, but not removed.
 * Bounding box contents are inclusive at the low edges and exclusive at the high edges.
 */
export class SuperTile extends UtmInterface {
	hasPointCloud: boolean
	pointCount: number
	index: TileIndex
	coordinateFrame: CoordinateFrameType
	threeJsBoundingBox: THREE.Box3
	private tiles: UtmTile[]
	private rawPositions: Array<number>
	private rawColors: Array<number>
	private pointStepSize: number

	constructor(
		index: TileIndex,
		coordinateFrame: CoordinateFrameType,
		utmParent: UtmInterface,
		pointStepSize: number
	) {
		super()
		this.hasPointCloud = false
		this.pointCount = 0
		this.index = index
		this.coordinateFrame = coordinateFrame
		this.setOriginWithInterface(utmParent)

		const utmBoundingBox = index.boundingBox
		const min = convertToStandardCoordinateFrame(utmBoundingBox.min, coordinateFrame)
		const max = convertToStandardCoordinateFrame(utmBoundingBox.max, coordinateFrame)
		this.threeJsBoundingBox = new THREE.Box3(
			this.utmToThreeJs(min.x, min.y, min.z),
			this.utmToThreeJs(max.x, max.y, max.z),
		)

		this.tiles = []
		this.rawPositions = []
		this.rawColors = []
		this.pointStepSize = pointStepSize
	}

	// SuperTile doesn't have to be filled densely with tiles. Add tiles only if they are not empty.
	addTile(tile: UtmTile): boolean {
		if (this.hasPointCloud)
			return false

		// Ignore duplicates.
		const newKey = tile.index.toString()
		if (this.tiles.find(t => t.index.toString() === newKey))
			return false

		// Validate that the tile exists in the volume described by this super tile.
		if (this.index.equals(tile.superTileIndex(this.index.scale))) {
			this.tiles.push(tile)
			return true
		} else
			return false
	}

	// The point cloud loads once. Call addTile() first.
	loadPointCloud(): Promise<boolean> {
		if (this.hasPointCloud)
			return Promise.resolve(true)

		const promises = this.tiles.map(t => t.loadPointCloud())
		return Promise.all(promises)
			.then(results => {
				results.forEach(result => {
					this.rawPositions = this.rawPositions.concat(result[0])
					this.rawColors = this.rawColors.concat(result[1])
				})
				this.hasPointCloud = true
				this.pointCount = this.rawPositions.length / this.pointStepSize
				return true
			})
	}

	// Reset the object to its initial state.
	unloadPointCloud(): void {
		this.tiles.forEach(tile => tile.unloadPointCloud())
		this.hasPointCloud = false
		this.pointCount = 0
		this.rawPositions = []
		this.rawColors = []
	}

	getRawPositions(): Array<number> {
		return this.rawPositions
	}

	getRawColors(): Array<number> {
		return this.rawColors
	}
}
