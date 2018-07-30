/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import {configToScale3D, Scale3D} from "@/mapper-annotated-scene/geometry/Scale3D"

// The spatial scale should be set once for the entire application.
export class ScaleProvider {
	readonly utmTileScale: Scale3D
	readonly superTileScale: Scale3D

	constructor() {
		// Set the dimensions of tiles and super tiles.
		// Super tile boundaries coincide with tile boundaries, with no overlap.
		this.utmTileScale = configToScale3D('tile_manager.utm_tile_scale')
		this.superTileScale = configToScale3D('tile_manager.super_tile_scale')
		if (!this.superTileScale.isMultipleOf(this.utmTileScale))
			throw Error('super_tile_scale must be a multiple of utm_tile_scale')
	}
}
