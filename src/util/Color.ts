/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

export function hexStringToHexadecimal(hex: String): number {
	const colors = hexToRgbArray(hex)

	if (colors && colors.length === 3)
		return 0x10000 * colors[0] + 0x100 * colors[1] + colors[2]
	else return Number.NaN
}

// borrowed from https://stackoverflow.com/questions/5623838/rgb-to-hex-and-hex-to-rgb
export function hexToRgbArray(hex: String): number[] | null {
	// long version
	let r = hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)

	if (r) {
		return r.slice(1, 4).map(function(x) {
			return parseInt(x, 16)
		})
	}

	// short version
	r = hex.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i)

	if (r) {
		return r.slice(1, 4).map(function(x) {
			return 0x11 * parseInt(x, 16)
		})
	}

	return null
}
