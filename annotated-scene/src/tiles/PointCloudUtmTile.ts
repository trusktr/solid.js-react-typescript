/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import {UtmTile} from './UtmTile'
import {TileIndex} from '../tiles/tile-model/TileIndex'
import {threeDStepSize} from './Constant'
import {PointCloudTileContents} from '../tiles/tile-model/TileContents'

const minPointsToDefineGround = 20 // arbitrary setting to avoid creating ground loadTileGroundPlanes for sparse tiles
const maxPointsToDefineGround = 1000 // arbitrary setting to shorten the estimation for very dense tiles

/*
 * A tile with a point cloud in it. In practice this comes directly from a PointCloudTileMessage or
 * BaseGeometryTileMessage protobuf.
 */
export class PointCloudUtmTile extends UtmTile {
	private contents: PointCloudTileContents | null

	constructor(
		index: TileIndex,
		private pointCloudLoader: () => Promise<PointCloudTileContents>
	) {
		super(index)
	}

	load(): Promise<PointCloudTileContents> {
		if (this.contents) return Promise.resolve<PointCloudTileContents>(this.contents)

		return this.pointCloudLoader()
			.then(result => {
				this.contents = result
				return this.contents
			})
	}

	unload(): void {
		this.contents = null
	}

	// Find the average height of the ground within this tile. This assumes that the point cloud data
	// has passed through RoadFilter, configured with --above_road_coloring_scheme=HEIGHT and
	// --road_coloring_scheme=INTENSITY.
	groundAverageYIndex(): number | null {
		if (!this.contents) return null

		let totalYValues = 0
		let countGrayPoints = 0

		for (let i = 0; i < this.contents.points.length && countGrayPoints < maxPointsToDefineGround; i += threeDStepSize) {
			// If the point has gray color, assume it is part of the ground.
			if (this.contents.colors[i] === this.contents.colors[i + 1] && this.contents.colors[i + 1] === this.contents.colors[i + 2]) {
				totalYValues += this.contents.points[i + 1]
				countGrayPoints++
			}
		}

		if (countGrayPoints < minPointsToDefineGround)
			return null
		else
			return totalYValues / countGrayPoints
	}
}
