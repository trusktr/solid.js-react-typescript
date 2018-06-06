import {BrowserWindowConstructorOptions} from 'electron'
import {isNullOrUndefined} from "util"
import {windowStateKeeperOptions} from "../util/WindowStateKeeperOptions"
import windowStateKeeper = require('electron-window-state')
import config from '@/config'

export default
function restoreWindowState( win, windowName ) {

	// Load user's saved state.
	const savedState = windowStateKeeper(windowStateKeeperOptions(windowName))

	// Deal with window dimensions. Kiosk mode overrides all other settings.
	const setFullScreen = !!config.get('startup.kiosk_mode')
	const options = {} as BrowserWindowConstructorOptions

	if (!setFullScreen) {
		// Merge with saved state.
		Object.assign(options, savedState)

		// User's saved settings override config file settings.
		const userHasSavedState = !(isNullOrUndefined(savedState.x) || isNullOrUndefined(savedState.y))
		if (!userHasSavedState) {
			const width = parseInt(config.get('startup.electron.window.default.width'), 10)
			const height = parseInt(config.get('startup.electron.window.default.height'), 10)
			if (width && height) {
				options.width = width
				options.height = height
			}
		}
	}

	// Set some more browser window options.
    // NOTE It's not possible to set backgroundColor after already constructing a BrowserWindow =(
	Object.assign(options, {
		backgroundColor: config.get('startup.background_color') || '#000',
	})

	win.setSize(options.width, options.height)
	win.setPosition(options.x, options.y)

	if (setFullScreen)
		win.setFullScreen(true)
	else
		savedState.manage(win)

	// Open the DevTools.
	if (!!config.get('startup.show_dev_tools'))
		win.webContents.openDevTools()
}
