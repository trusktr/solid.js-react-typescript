/**
 *  Copyright 2017 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import {TileIndex} from "../model/TileIndex"
import {UtmTile} from "./UtmTile"

/*
 * A collection of zero or more tiles within a unique, contiguous 3D volume.
 * Tile data can be added progressively, but not removed.
 * Bounding box contents are inclusive at the low edges and exclusive at the high edges.
 */
export class SuperTile {
	index: TileIndex
	tiles: UtmTile[]
	rawPositions: Array<number>
	rawColors: Array<number>

	constructor(index: TileIndex) {
		this.index = index
		this.tiles = []
		this.rawPositions = []
		this.rawColors = []
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
