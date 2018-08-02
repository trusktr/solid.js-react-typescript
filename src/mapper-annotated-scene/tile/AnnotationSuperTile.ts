/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as THREE from 'three'
import {SuperTile} from '@/mapper-annotated-scene/tile/SuperTile'
import {TileIndex} from '@/mapper-annotated-scene/tile-model/TileIndex'
import {CoordinateFrameType} from '@/mapper-annotated-scene/geometry/CoordinateFrame'
import {UtmCoordinateSystem} from '@/mapper-annotated-scene/UtmCoordinateSystem'
import {AnnotationUtmTile} from '@/mapper-annotated-scene/tile/AnnotationUtmTile'
import {Annotation} from '@/mapper-annotated-scene/annotations/AnnotationBase'

export class AnnotationSuperTile extends SuperTile {
	tiles: AnnotationUtmTile[]
	annotations: Annotation[]

	constructor(
		index: TileIndex,
		coordinateFrame: CoordinateFrameType,
		utmCoordinateSystem: UtmCoordinateSystem,
	) {
		super(index, coordinateFrame, utmCoordinateSystem)
		this.annotations = []
	}

	// This is not used by Annotation tiles for now.
	getContentsBoundingBox(): THREE.Box3 | null {
		return null
	}

	// The contents load once. Call addTile() first.
	loadContents(): Promise<boolean> {
		if (this.isLoaded) return Promise.resolve(true)

		const promises = this.tiles.map(t => t.load())

		return Promise.all(promises)
			.then(results => {
				results.forEach(result => {
					if (result.annotations.length) this.annotations = this.annotations.concat(result.annotations)
				})

				this.isLoaded = true
				this.objectCount = this.annotations.length
				return true
			})
	}

	// Reset the object to its initial state.
	unloadContents(): void {
		this.isLoaded = false
		this.tiles.forEach(tile => tile.unload())
		this.annotations = []
		this.objectCount = 0
	}
}
