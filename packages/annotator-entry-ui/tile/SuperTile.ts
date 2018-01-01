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
	index: TileIndex
	coordinateFrame: CoordinateFrameType
	threeJsBoundingBox: THREE.Box3
	tiles: UtmTile[]
	rawPositions: Array<number>
	rawColors: Array<number>

	constructor(index: TileIndex, coordinateFrame: CoordinateFrameType, utmParent: UtmInterface) {
		super()
		this.index = index
		this.coordinateFrame = coordinateFrame
		this.setOriginWithInterface(utmParent)

		const utmBoundingBox = index.boundingBox()
		const min = convertToStandardCoordinateFrame(utmBoundingBox.min, coordinateFrame)
		const max = convertToStandardCoordinateFrame(utmBoundingBox.max, coordinateFrame)
		this.threeJsBoundingBox = new THREE.Box3(
			this.utmToThreeJs(min.x, min.y, min.z),
			this.utmToThreeJs(max.x, max.y, max.z),
		)

		this.tiles = []
		this.rawPositions = []
		this.rawColors = []
	}

	hasTileData(): boolean {
		return this.tiles.length > 0
	}

	addTile(tile: UtmTile): boolean {
		// First validate that the tile exists in the volume described by this super tile.
		if (this.index.equals(tile.superTileIndex(this.index.scale))) {
			this.tiles.push(tile)
			this.rawPositions = this.rawPositions.concat(tile.rawPositions)
			this.rawColors = this.rawColors.concat(tile.rawColors)
			return true
		} else
			return false
	}
}
