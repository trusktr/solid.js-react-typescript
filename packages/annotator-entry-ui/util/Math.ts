/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

// The smallest whole power of 2 greater than or equal to the input.
export function ceilingPowerOf2(n: number): number {
	if (n < 1) return 1
	// tslint:disable-next-line:no-bitwise
	const pow = 1 << 31 - Math.clz32(n)
	return pow === n ? pow : pow * 2
}
