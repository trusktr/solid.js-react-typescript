/**
 *  Copyright 2018 Mapper Inc. Part of the mapper-annotator project.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import {BrowserWindow, BrowserWindowConstructorOptions} from 'electron'
import {isNullOrUndefined} from "util"
import {windowStateKeeperOptions} from "../../util/WindowStateKeeperOptions"
import windowStateKeeper = require('electron-window-state')
import config from '@/config'

export default
function restoreWindowState(win: BrowserWindow, windowName: string): void {
	console.log("INSIDE RESTORE")
	// Load user's saved state.
	const savedState = windowStateKeeper(windowStateKeeperOptions(windowName))

	// Deal with window dimensions. Kiosk mode overrides all other settings.
	const setFullScreen = false //!!config['startup.kiosk_mode']
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
	// NOTE It's not possible to set backgroundColor after already constructing a BrowserWindow =(
	Object.assign(options, {
		backgroundColor: config['startup.background_color'] || '#000',
	})

	if (!(isNullOrUndefined(options.width) || isNullOrUndefined(options.height)))
		win.setSize(options.width, options.height)
	if (!(isNullOrUndefined(options.x) || isNullOrUndefined(options.y)))
		win.setPosition(options.x, options.y)

	// if (setFullScreen)
	// 	win.setFullScreen(false)
	// else
	// 	savedState.manage(win)

	// Open the DevTools.
	if (!!config['startup.show_dev_tools'])
		win.webContents.openDevTools()
}
