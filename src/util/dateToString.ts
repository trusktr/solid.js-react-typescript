/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import { vsprintf } from 'sprintf-js'

// Convert input to a string that is safe for URLs, file names, and who knows what else.
export function dateToString(date: Date): string {
	const dateElements = [
		date.getUTCFullYear(),
		date.getUTCMonth() + 1,
		date.getUTCDate(),
		date.getUTCHours(),
		date.getUTCMinutes(),
		date.getUTCSeconds(),
		date.getUTCMilliseconds(),
	]

	return vsprintf('%04d-%02d-%02dT%02d-%02d-%02d.%03dZ', dateElements)
}
