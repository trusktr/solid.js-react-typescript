/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import {TileIndex} from "./TileIndex"

export class TileInstance {

	constructor(
		public tileIndex: TileIndex,
		public layerId: string,
		public url: string
	) { }
}
