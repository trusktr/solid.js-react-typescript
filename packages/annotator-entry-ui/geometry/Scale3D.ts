/**
 *  Copyright 2017 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

export class Scale3D {
	xSize: number
	ySize: number
	zSize: number

	constructor(scales: [number, number, number]) {
		this.xSize = scales[0]
		this.ySize = scales[1]
		this.zSize = scales[2]
	}

	equals(that: Scale3D): boolean {
		return this.xSize === that.xSize
			&& this.ySize === that.ySize
			&& this.zSize === that.zSize
	}

	isMultipleOf(that: Scale3D): boolean {
		return this.xSize % that.xSize === 0
			&& this.ySize % that.ySize === 0
			&& this.zSize % that.zSize === 0
	}
}

// This defines the size of one tile in cartesian space.
// Tiles are constructed orthogonal to the three spacial dimensions.
// All dimensions are expressed in meters.
export function coordToIndex(coord: number, size: number): TileIndexDimension {
	const floor = Math.floor(coord / size)
	return (floor === 0 && coord < 0) // special case for underflow on very small, negative values of coord
		? -1
		: floor
}

export function indexToCoord(index: TileIndexDimension, size: number): number {
	return index * size
}
