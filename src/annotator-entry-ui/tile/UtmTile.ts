/**
 *  Copyright 2017 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import {Scale3D} from "../geometry/Scale3D"
import {TileIndex, tileIndexFromVector3} from "../model/TileIndex"
import {TileContents} from "@/annotator-entry-ui/model/TileContents"

/*
 * A collection of arbitrary data from a rectangular volume of UTM space.
 * This assumes a single UTM zone, which is a Cartesian 3D space.
 */
export abstract class UtmTile {
	constructor(
		public index: TileIndex,
	) {}

	// Find the TileIndex for a super tile which contains the origin of this tile.
	// First convert from the tile's scale to the world coordinate frame,
	// and then to the super tile scale.
	superTileIndex(superTileScale: Scale3D): TileIndex {
		return tileIndexFromVector3(superTileScale, this.index.origin)
	}

	// Load serialized contents into memory.
	abstract load(): Promise<TileContents>

	// Reset the object to its initial state.
	abstract unload(): void
}
