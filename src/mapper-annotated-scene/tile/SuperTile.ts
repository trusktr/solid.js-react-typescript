/**
 *  Copyright 2017 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as THREE from 'three'
import {TileIndex} from '../tile-model/TileIndex'
import {UtmTile} from './UtmTile'
import {convertToStandardCoordinateFrame, CoordinateFrameType} from '../geometry/CoordinateFrame'
import {UtmCoordinateSystem} from '../UtmCoordinateSystem'

/*
 * A collection of zero or more tiles within a unique, contiguous 3D volume.
 * Tile data can be added progressively, but not removed.
 * Bounding box contents are inclusive at the low edges and exclusive at the high edges.
 */
export abstract class SuperTile {
	isLoaded: boolean
	objectCount: number
	threeJsBoundingBox: THREE.Box3
	tiles: UtmTile[]

	constructor(
		public index: TileIndex,
		public coordinateFrame: CoordinateFrameType,
		private utmCoordinateSystem: UtmCoordinateSystem,
	) {
		this.isLoaded = false
		this.objectCount = 0
		this.tiles = []

		const utmBoundingBox = index.boundingBox
		const min = convertToStandardCoordinateFrame(utmBoundingBox.min, coordinateFrame)
		const max = convertToStandardCoordinateFrame(utmBoundingBox.max, coordinateFrame)

		this.threeJsBoundingBox = new THREE.Box3(
			this.utmCoordinateSystem.utmToThreeJs(min.x, min.y, min.z),
			this.utmCoordinateSystem.utmToThreeJs(max.x, max.y, max.z),
		)
	}

	key(): string {
		return this.index.toString()
	}

	abstract getContentsBoundingBox(): THREE.Box3 | null

	// SuperTile doesn't have to be filled densely with tiles. Add tiles only if they are not empty.
	addTile(tile: UtmTile): boolean {
		if (this.isLoaded) return false

		// Ignore duplicates.
		const newKey = tile.index.toString()

		if (this.tiles.find(t => t.index.toString() === newKey)) return false

		// Validate that the tile exists in the volume described by this super tile.
		if (this.index.equals(tile.superTileIndex(this.index.scale))) {
			this.tiles.push(tile)
			return true
		} else {
			return false
		}
	}

	// The contents load only once. Call addTile() first.
	abstract loadContents(): Promise<boolean>

	// Reset the object to its initial state.
	abstract unloadContents(): void
}
