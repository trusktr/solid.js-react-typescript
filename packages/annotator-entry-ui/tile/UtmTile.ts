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
	hasPointCloud: boolean
	index: TileIndex
	private pointCloudLoader: () => Promise<[number[], number[]]>
	private rawPositions: Array<number>
	private rawColors: Array<number>

	constructor(
		index: TileIndex,
		pointCloudLoader: () => Promise<[number[], number[]]>
	) {
		this.hasPointCloud = false
		this.index = index
		this.pointCloudLoader = pointCloudLoader
	}

	// Find the TileIndex for a super tile which contains the origin of this tile.
	// First convert from the tile's scale to the coordinate frame for point clouds,
	// and then to the super tile scale.
	superTileIndex(superTileScale: Scale3D): TileIndex {
		return tileIndexFromVector3(superTileScale, this.index.origin())
	}

	loadPointCloud(): Promise<[number[], number[]]> {
		if (this.hasPointCloud)
			return Promise.resolve<[number[], number[]]>([this.rawPositions, this.rawColors])

		return this.pointCloudLoader()
			.then(result => {
				this.rawPositions = result[0]
				this.rawColors = result[1]
				this.hasPointCloud = true
				return [this.rawPositions, this.rawColors] as [number[], number[]]
			})
	}
}
