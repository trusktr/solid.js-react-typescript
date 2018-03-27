/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

// tslint:disable-next-line:no-any
export function isTupleOfNumbers(input: any[], length: number): boolean {
	if (!Array.isArray(input) || input.length !== length)
		return false
	let valid = true
	input.forEach(n => {
		if (isNaN(n)) valid = false
	})
	return valid
}
