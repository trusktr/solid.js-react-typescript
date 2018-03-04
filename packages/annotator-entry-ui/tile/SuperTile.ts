/**
 *  Copyright 2017 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as THREE from 'three'
import {TileIndex} from "../model/TileIndex"
import {UtmTile} from "./UtmTile"
import {convertToStandardCoordinateFrame, CoordinateFrameType} from "../geometry/CoordinateFrame"
import {UtmInterface} from "../UtmInterface"
import {emptyPositions, threeDStepSize} from "./Constant"

/*
 * A collection of zero or more tiles within a unique, contiguous 3D volume.
 * Tile data can be added progressively, but not removed.
 * Bounding box contents are inclusive at the low edges and exclusive at the high edges.
 */
export class SuperTile extends UtmInterface {
	pointCloud: THREE.Points | null
	pointCount: number
	private pointCloudBoundingBox: THREE.Box3 | null
	index: TileIndex
	coordinateFrame: CoordinateFrameType
	threeJsBoundingBox: THREE.Box3
	private tiles: UtmTile[]
	private rawPositions: Float32Array

	constructor(
		index: TileIndex,
		coordinateFrame: CoordinateFrameType,
		utmParent: UtmInterface,
	) {
		super()
		this.pointCloud = null
		this.pointCount = 0
		this.pointCloudBoundingBox = null
		this.tiles = []
		this.rawPositions = emptyPositions
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

	}

	key(): string {
		return this.index.toString()
	}

	getPointCloudBoundingBox(): THREE.Box3 | null {
		if (this.pointCloudBoundingBox) {
			return this.pointCloudBoundingBox
		} else if (!this.pointCloud) {
			return null
		} else {
			this.pointCloud.geometry.computeBoundingBox()
			this.pointCloudBoundingBox = this.pointCloud.geometry.boundingBox
			return this.pointCloudBoundingBox
		}
	}

	// SuperTile doesn't have to be filled densely with tiles. Add tiles only if they are not empty.
	addTile(tile: UtmTile): boolean {
		if (this.pointCloud)
			return false

		// Ignore duplicates.
		const newKey = tile.index.toString()
		if (this.tiles.find(t => t.index.toString() === newKey))
			return false

		// Validate that the tile exists in the volume described by this super tile.
		if (this.index.equals(tile.superTileIndex(this.index.scale))) {
			this.tiles.push(tile)
			return true
		} else {
			return false
		}
	}

	// The point cloud loads once. Call addTile() first.
	loadPointCloud(pointsMaterial: THREE.PointsMaterial): Promise<boolean> {
		if (this.pointCloud)
			return Promise.resolve(true)

		const promises = this.tiles.map(t => t.loadPointCloud())
		return Promise.all(promises)
			.then(results => {
				let arraySize = 0
				results.forEach(result => {
					arraySize += result[0].length
				})

				const rawPositions = new Float32Array(arraySize)
				const rawColors = new Float32Array(arraySize)
				let n = 0
				results.forEach(result => {
					const superTilePositions = result[0]
					for (let i = 0; i < superTilePositions.length; i++, n++) {
						rawPositions[n] = superTilePositions[i]
					}
				})
				n = 0
				results.forEach(result => {
					const superTileColors = result[1]
					for (let i = 0; i < superTileColors.length; i++, n++) {
						rawColors[n] = superTileColors[i]
					}
				})

				const geometry = new THREE.BufferGeometry()
				geometry.addAttribute('position', new THREE.BufferAttribute(rawPositions, threeDStepSize))
				geometry.addAttribute('color', new THREE.BufferAttribute(rawColors, threeDStepSize))
				this.pointCloud = new THREE.Points(geometry, pointsMaterial)
				this.pointCount = arraySize / threeDStepSize
				this.rawPositions = rawPositions

				return true
			})
	}

	// Reset the object to its initial state.
	unloadPointCloud(): void {
		this.tiles.forEach(tile => tile.unloadPointCloud())
		if (this.pointCloud) {
			this.pointCloud.geometry.dispose()
			this.pointCloud = null
		}
		this.pointCloudBoundingBox = null
		this.pointCount = 0
		this.rawPositions = emptyPositions
	}

	getRawPositions(): Float32Array {
		return this.rawPositions
	}
}
