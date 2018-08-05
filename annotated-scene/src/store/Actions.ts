/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as requireContext from 'require-context'
import * as path from 'path'

/**
 * Recurse the actions/ directory and load all the modules
 */
export function loadActions(): void {
	// eslint-disable-next-line typescript/no-explicit-any
	const context = requireContext(path.resolve(__dirname, './actions'), true, /\.ts$/)

	context.keys().forEach(context)
}
