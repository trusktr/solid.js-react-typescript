/**
 *  Copyright 2017 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import {Scale3D} from "../geometry/Scale3D"
import {TileIndex, tileIndexFromVector3} from "../model/TileIndex"
import {threeDStepSize} from "./Constant"

const minPointsToDefineGround = 20 // arbitrary setting to avoid creating ground loadTileGroundPlanes for sparse tiles
const maxPointsToDefineGround = 1000 // arbitrary setting to shorten the estimation for very dense tiles

/*
 * A collection of point cloud data for a rectangular volume of UTM space.
 * This assumes a single UTM zone, which is a Cartesian 3D space.
 * In practice this comes directly from a PointCloudTileMessage or
 * BaseGeometryTileMessage protobuf.
 */
export class UtmTile {
	hasPointCloud: boolean
	private rawPositions: Array<number>
	private rawColors: Array<number>

	constructor(
		public index: TileIndex,
		private pointCloudLoader: () => Promise<[number[], number[]]>
	) {
		this.hasPointCloud = false
	}

	// Find the TileIndex for a super tile which contains the origin of this tile.
	// First convert from the tile's scale to the coordinate frame for point clouds,
	// and then to the super tile scale.
	superTileIndex(superTileScale: Scale3D): TileIndex {
		return tileIndexFromVector3(superTileScale, this.index.origin)
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

	// Reset the object to its initial state.
	unloadPointCloud(): void {
		this.hasPointCloud = false
		this.rawPositions = []
		this.rawColors = []
	}

	// Find the average height of the ground within this tile. This assumes that the point cloud data
	// has passed through RoadFilter, configured with --above_road_coloring_scheme=HEIGHT and
	// --road_coloring_scheme=INTENSITY.
	groundAverageYIndex(): number | null {
		let totalYValues = 0
		let countGrayPoints = 0
		for (let i = 0; i < this.rawPositions.length && countGrayPoints < maxPointsToDefineGround; i += threeDStepSize) {
			// If the point has gray color, assume it is part of the ground.
			if (this.rawColors[i] === this.rawColors[i + 1] && this.rawColors[i + 1] === this.rawColors[i + 2]) {
				totalYValues += this.rawPositions[i + 1]
				countGrayPoints++
			}
		}

		if (countGrayPoints < minPointsToDefineGround)
			return null
		else
			return totalYValues / countGrayPoints
	}
}
