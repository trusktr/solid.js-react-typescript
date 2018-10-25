/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import config, { configReady } from 'annotator-config'

const windowStateDirectory = 'window-state'

// Build a partial path to a preferences file.
// Return it within a partial configuration object for `electron-window-state`.
// https://www.npmjs.com/package/electron-window-state.
export async function windowStateKeeperOptions(
	windowName: string,
): Promise<object> {
	if (!windowName) throw Error('missing windowName')

	await configReady()
	const applicationDirectory =
		config['preferences.directory'] || 'mapper-annotator'
	const windowStatePrefsFile =
		applicationDirectory +
		'/' +
		windowStateDirectory +
		'/' +
		windowName +
		'.json'

	return {
		file: windowStatePrefsFile,
	}
}
