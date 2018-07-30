/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import {TileIndex} from "./TileIndex"

export class TileInstance {
	tileIndex: TileIndex
	layerId: LayerId
	url: string

	constructor(
		tileIndex: TileIndex,
		layerId: LayerId,
		url: string
	) {
		this.tileIndex = tileIndex
		this.layerId = layerId
		this.url = url
	}
}
