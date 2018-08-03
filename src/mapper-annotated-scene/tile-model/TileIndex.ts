/**
 *  Copyright 2017 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as THREE from 'three'
import {coordToIndex, indexToCoord, Scale3D} from '../geometry/Scale3D'
import {TileIndexDimension} from '../../types/TypeAlias'

const defaultSeparator = ',' // for generating serializable ID strings

// Represents an address for a voxel in three-dimensional space.
// TileIndex can be serialized and deserialized using the String methods,
// but its Scale is assumed to be constant throughout a system and
// must be managed separately.
export class TileIndex {
	scale: Scale3D
	xIndex: TileIndexDimension
	yIndex: TileIndexDimension
	zIndex: TileIndexDimension
	origin: THREE.Vector3
	boundingBox: THREE.Box3
	private cachedString: string | null

	constructor(scale: Scale3D, xIndex: TileIndexDimension, yIndex: TileIndexDimension, zIndex: TileIndexDimension) {
		this.scale = scale
		this.xIndex = xIndex
		this.yIndex = yIndex
		this.zIndex = zIndex

		this.origin = new THREE.Vector3(
			indexToCoord(this.xIndex, this.scale.xSize),
			indexToCoord(this.yIndex, this.scale.ySize),
			indexToCoord(this.zIndex, this.scale.zSize)
		)

		this.boundingBox = new THREE.Box3(
			this.origin,
			this.origin.clone().add(this.scale.toVector())
		)

		this.cachedString = null
	}

	toString(separator: string = defaultSeparator): string {
		if (separator === defaultSeparator) {
			if (this.cachedString === null) {
				this.cachedString = this.xIndex.toString() + separator +
					this.yIndex.toString() + separator +
					this.zIndex.toString()
			}

			return this.cachedString
		} else {
			return this.xIndex.toString() + separator +
				this.yIndex.toString() + separator +
				this.zIndex.toString()
		}
	}

	equals(that: TileIndex): boolean {
		return this.xIndex === that.xIndex &&
			this.yIndex === that.yIndex &&
			this.zIndex === that.zIndex &&
			this.scale.equals(that.scale)
	}

	copy(xIndex: TileIndexDimension, yIndex: TileIndexDimension, zIndex: TileIndexDimension): TileIndex {
		return new TileIndex(this.scale, xIndex, yIndex, zIndex)
	}
}

export function tileIndexFromCoordinates(scale: Scale3D, x: number, y: number, z: number): TileIndex {
	return new TileIndex(scale, coordToIndex(x, scale.xSize), coordToIndex(y, scale.ySize), coordToIndex(z, scale.zSize))
}

export function tileIndexFromVector3(scale: Scale3D, v: THREE.Vector3): TileIndex {
	return tileIndexFromCoordinates(scale, v.x, v.y, v.z)
}
