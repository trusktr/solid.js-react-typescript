/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as THREE from 'three'
import {TileIndex} from "../model/TileIndex"
import {PointCloudUtmTile} from "./PointCloudUtmTile"
import {CoordinateFrameType} from "../geometry/CoordinateFrame"
import {UtmCoordinateSystem} from "../UtmCoordinateSystem"
import {threeDStepSize} from "./Constant"
import {SuperTile} from "@/annotator-entry-ui/tile/SuperTile"

export class PointCloudSuperTile extends SuperTile {
	pointCloud: THREE.Points | null
	private pointCloudBoundingBox: THREE.Box3 | null
	tiles: PointCloudUtmTile[]

	constructor(
		index: TileIndex,
		coordinateFrame: CoordinateFrameType,
		utmCoordinateSystem: UtmCoordinateSystem,
		private pointsMaterial: THREE.PointsMaterial,
	) {
		super(index, coordinateFrame, utmCoordinateSystem)
		this.pointCloud = null
		this.pointCloudBoundingBox = null
	}

	getContentsBoundingBox(): THREE.Box3 | null {
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

	// The point cloud loads once. Call addTile() first.
	loadContents(): Promise<boolean> {
		if (this.isLoaded)
			return Promise.resolve(true)

		const promises = this.tiles.map(t => t.load())
		return Promise.all(promises)
			.then(results => {
				let arraySize = 0
				results.forEach(result => {
					arraySize += result.points.length
				})

				const rawPositions = new Float32Array(arraySize)
				const rawColors = new Float32Array(arraySize)
				let m = 0
				results.forEach(result => {
					const superTilePositions = result.points
					for (let i = 0; i < superTilePositions.length; i++, m++) {
						rawPositions[m] = superTilePositions[i]
					}
				})
				let n = 0
				results.forEach(result => {
					const superTileColors = result.colors
					for (let i = 0; i < superTileColors.length; i++, n++) {
						rawColors[n] = superTileColors[i]
					}
				})

				const geometry = new THREE.BufferGeometry()
				geometry.addAttribute('position', new THREE.BufferAttribute(rawPositions, threeDStepSize))
				geometry.addAttribute('color', new THREE.BufferAttribute(rawColors, threeDStepSize))
				this.pointCloud = new THREE.Points(geometry, this.pointsMaterial)
				this.objectCount = arraySize / threeDStepSize

				this.isLoaded = true
				return true
			})
	}

	// Reset the object to its initial state.
	unloadContents(): void {
		this.isLoaded = false
		this.tiles.forEach(tile => tile.unload())
		if (this.pointCloud) {
			this.pointCloud.geometry.dispose()
			this.pointCloud = null
		}
		this.pointCloudBoundingBox = null
		this.objectCount = 0
	}
}
