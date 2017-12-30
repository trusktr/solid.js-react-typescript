/**
 *  Copyright 2017 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import {Scale3D} from "../geometry/Scale3D"
import {TileIndex, tileIndexFromVector3} from "../model/TileIndex"

/*
 * A collection of point cloud data for a rectangular volume of UTM space.
 * This assumes a single UTM zone, which is a Cartesian 3D space.
 * In practice this comes directly from a PointCloudTileMessage protobuf.
 */
export class UtmTile {
	index: TileIndex
	rawPositions: Array<number>
	rawColors: Array<number>

	constructor(
		index: TileIndex,
		rawPositions: Array<number>,
		rawColors: Array<number>,
	) {
		this.index = index
		this.rawPositions = rawPositions
		this.rawColors = rawColors
	}

	// Find the TileIndex for a super tile which contains the origin of this tile.
	// First convert from the tile's scale to the coordinate frame for point clouds,
	// and then to the super tile scale.
	superTileIndex(superTileScale: Scale3D): TileIndex {
		return tileIndexFromVector3(superTileScale, this.index.origin())
	}
}
