/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import config from '@/config'

const windowStateDirectory = 'window-state'

// Build a partial path to a preferences file.
// Return it within a partial configuration object for `electron-window-state`.
// https://www.npmjs.com/package/electron-window-state.
export function windowStateKeeperOptions(windowName: string): object {
	if (!windowName) throw Error('missing windowName')

	const applicationDirectory = config['preferences.directory'] || 'mapper-annotator'
	const windowStatePrefsFile = applicationDirectory + '/' + windowStateDirectory + '/' + windowName + '.json'

	return {
		file: windowStatePrefsFile,
	}
}
