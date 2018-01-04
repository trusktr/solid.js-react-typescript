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
	pointCount: number
	index: TileIndex
	private pointCloudLoader: () => Promise<[number[], number[], number]>
	private rawPositions: Array<number>
	private rawColors: Array<number>

	constructor(
		index: TileIndex,
		pointCloudLoader: () => Promise<[number[], number[], number]>
	) {
		this.hasPointCloud = false
		this.pointCount = 0
		this.index = index
		this.pointCloudLoader = pointCloudLoader
	}

	// Find the TileIndex for a super tile which contains the origin of this tile.
	// First convert from the tile's scale to the coordinate frame for point clouds,
	// and then to the super tile scale.
	superTileIndex(superTileScale: Scale3D): TileIndex {
		return tileIndexFromVector3(superTileScale, this.index.origin)
	}

	loadPointCloud(): Promise<[number[], number[], number]> {
		if (this.hasPointCloud)
			return Promise.resolve<[number[], number[], number]>([this.rawPositions, this.rawColors, this.pointCount])

		return this.pointCloudLoader()
			.then(result => {
				this.rawPositions = result[0]
				this.rawColors = result[1]
				this.pointCount = result[2]
				this.hasPointCloud = true
				return [this.rawPositions, this.rawColors, this.pointCount] as [number[], number[], number]
			})
	}

	// Reset the object to its initial state.
	unloadPointCloud(): void {
		this.hasPointCloud = false
		this.rawPositions = []
		this.rawColors = []
	}
}
