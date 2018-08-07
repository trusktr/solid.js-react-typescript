/**
 *  Copyright 2017 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as THREE from 'three'
import {vsprintf} from 'sprintf-js'
import config from '@/config'
import {isTupleOfNumbers} from '@/util/Validation'
import {TileIndexDimension} from '@/types/TypeAlias'

const defaultSeparator = '_' // for generating serializable ID strings

function numberToString(n: number): string {
	return vsprintf('%03d', [n])
}

export class Scale3D {
	readonly xSize: number
	readonly ySize: number
	readonly zSize: number
	private cachedString: string | null

	constructor(scales: [number, number, number]) {
		this.xSize = scales[0]
		this.ySize = scales[1]
		this.zSize = scales[2]
		this.cachedString = null
	}

	toString(separator: string = defaultSeparator): string {
		if (separator === defaultSeparator) {
			if (this.cachedString === null) {
				// The string representation with underscores leads with an underscore
				// for consistency with the protobuf enumerations of these things.
				this.cachedString = separator +
					numberToString(this.xSize) + separator +
					numberToString(this.ySize) + separator +
					numberToString(this.zSize)
			}

			return this.cachedString
		} else {
			return numberToString(this.xSize) + separator +
				numberToString(this.ySize) + separator +
				numberToString(this.zSize)
		}
	}

	equals(that: Scale3D): boolean {
		return this.xSize === that.xSize &&
			this.ySize === that.ySize &&
			this.zSize === that.zSize
	}

	isMultipleOf(that: Scale3D): boolean {
		return this.xSize % that.xSize === 0 &&
			this.ySize % that.ySize === 0 &&
			this.zSize % that.zSize === 0
	}

	toVector(): THREE.Vector3 {
		return new THREE.Vector3(this.xSize, this.ySize, this.zSize)
	}

	get volume(): number {
		return this.xSize * this.ySize * this.zSize
	}
}

// This defines the size of one tile in cartesian space.
// Tiles are constructed orthogonal to the three spacial dimensions.
// All dimensions are expressed in meters.
export function coordToIndex(coord: number, size: number): TileIndexDimension {
	const floor = Math.floor(coord / size)

	if (!isFinite(floor) || size < 0) throw Error(`out-of-bounds arguments in coordToIndex(${coord}, ${size})`)

	return (floor === 0 && coord < 0) // special case for underflow on very small, negative values of coord
		? -1
		: floor
}

export function indexToCoord(index: TileIndexDimension, size: number): number {
	return index * size
}

export function configToScale3D(key: string): Scale3D {
	const tileScaleConfig: [number, number, number] = config[key] || [10, 10, 10]

	if (!isTupleOfNumbers(tileScaleConfig, 3)) throw Error(`invalid ${key} configuration '${tileScaleConfig}'`)

	return new Scale3D(tileScaleConfig)
}
