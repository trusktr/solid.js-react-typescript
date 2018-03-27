/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import {TileIndex} from "./TileIndex"

export interface TileInstance {
	tileIndex: TileIndex,
	url: string,
}

export class RemoteTileInstance implements TileInstance {
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

export class LocalTileInstance implements TileInstance {
	tileIndex: TileIndex
	url: string
	fileSystemPath: string

	constructor(
		tileIndex: TileIndex,
		fileSystemPath: string
	) {
		this.tileIndex = tileIndex
		this.url = 'file://' + fileSystemPath
		this.fileSystemPath = fileSystemPath
	}
}
