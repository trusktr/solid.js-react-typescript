/**
 *  Copyright 2018 Mapper Inc. Part of the mapper-annotator project.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import {BrowserWindow, BrowserWindowConstructorOptions} from 'electron'
import {isNullOrUndefined} from 'util' // eslint-disable-line node/no-deprecated-api
import {windowStateKeeperOptions} from '../../util/WindowStateKeeperOptions'
import config from '@/config'
import windowStateKeeper = require('electron-window-state')

export default
function restoreWindowState(win: BrowserWindow, windowName: string): void {
	// Load user's saved state.
	const savedState = windowStateKeeper(windowStateKeeperOptions(windowName))

	savedState.manage(win)

	// Deal with window dimensions. Kiosk mode overrides all other settings.
	const setFullScreen = false // TODO JOE should this come from config? !!config['startup.kiosk_mode']
	const options = {} as BrowserWindowConstructorOptions

	if (!setFullScreen) {
		// Merge with saved state.
		Object.assign(options, savedState)

		// User's saved settings override config file settings.
		const userHasSavedState = !(isNullOrUndefined(savedState.x) || isNullOrUndefined(savedState.y))

		if (!userHasSavedState) {
			const width = parseInt(config['startup.electron.window.default.width'], 10)
			const height = parseInt(config['startup.electron.window.default.height'], 10)

			if (width && height) {
				options.width = width
				options.height = height
			}
		}
	}

	// Set some more browser window options.
	// NOTE JOE It's not possible to set Electron backgroundColor after already
	// constructing a BrowserWindow. We can set the CSS background color
	// though.
	// TODO JOE set CSS background color from config
	Object.assign(options, {
		backgroundColor: config['startup.background_color'] || '#000',
	})

	if (!(isNullOrUndefined(options.width) || isNullOrUndefined(options.height))) win.setSize(options.width, options.height)

	if (!(isNullOrUndefined(options.x) || isNullOrUndefined(options.y))) win.setPosition(options.x, options.y)

	// if (setFullScreen)
	// 	win.setFullScreen(false)
	// else
	// 	savedState.manage(win)

	// Open the DevTools.
	if (config['startup.show_dev_tools']) win.webContents.openDevTools()
}
