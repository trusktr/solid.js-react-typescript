/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import {TileIndex} from "../model/TileIndex"

// Information for instantiating a tile that is stored on a local file system.
export interface FileSystemTileMetadata {
	tileIndex: TileIndex,
	path: string,
}
