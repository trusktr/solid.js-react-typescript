/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import {UtmTile} from "@/mapper-annotated-scene/tile/UtmTile"
import {AnnotationTileContents} from "@/mapper-annotated-scene/tile-model/TileContents"
import {TileIndex} from "@/mapper-annotated-scene/tile-model/TileIndex"

export class AnnotationUtmTile extends UtmTile {
	private contents: AnnotationTileContents | null

	constructor(
		index: TileIndex,
		private annotationLoader: () => Promise<AnnotationTileContents>,
	) {
		super(index)
	}

	load(): Promise<AnnotationTileContents> {
		if (this.contents)
			return Promise.resolve<AnnotationTileContents>(this.contents)

		return this.annotationLoader()
			.then(result => {
				this.contents = result
				return this.contents
			})
	}

	unload(): void {
		this.contents = null
	}
}
