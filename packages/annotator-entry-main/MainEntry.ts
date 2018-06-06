/**
 *  Copyright 2018 Mapper Inc. Part of the mapper-annotator project.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as Url from 'url'
import * as Path from 'path'
import * as Electron from 'electron'
import {BrowserWindow, BrowserWindowConstructorOptions} from 'electron'
import {isNullOrUndefined} from "util"
import {windowStateKeeperOptions} from "../util/WindowStateKeeperOptions"
import windowStateKeeper = require('electron-window-state')
import config from '@/config'

const app = Electron.app

// Ask for ~6GB memory
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=8096')

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let win: BrowserWindow | null

const isSecondInstance = app.makeSingleInstance(() => {
	if (win) {
		if (win.isMinimized()) win.restore()
		win.focus()
	}
})
if (isSecondInstance)
	app.quit()

function createWindow(): void {
	const windowName = 'browser-entry'

	// Load user's saved state.
	const savedState = windowStateKeeper(windowStateKeeperOptions(windowName))

	// Deal with window dimensions. Kiosk mode overrides all other settings.
	const setFullScreen = !!config.get('startup.kiosk_mode')
	let dimensionsOptions = {} as BrowserWindowConstructorOptions
	if (!setFullScreen) {
		// Merge with saved state.
		dimensionsOptions = {
			dimensionsOptions,
			...savedState,
		}

		// User's saved settings override config file settings.
		const userHasSavedState = !(isNullOrUndefined(savedState.x) || isNullOrUndefined(savedState.y))
		if (!userHasSavedState) {
			const width = parseInt(config.get('startup.electron.window.default.width'), 10)
			const height = parseInt(config.get('startup.electron.window.default.height'), 10)
			if (width && height) {
				dimensionsOptions.width = width
				dimensionsOptions.height = height
			}
		}
	}

	// Set some more browser window options.
	const options = {
		...dimensionsOptions,
		show: false,
		backgroundColor: config.get('startup.background_color') || '#000',
		webPreferences: {
			// so that window.open() gives us the underlying `window` object
			// rather than an Electron BrowserWindowProxy
			nativeWindowOpen: true
		},
	} as BrowserWindowConstructorOptions

	// Create the browser window.
	win = new BrowserWindow(options)
	if (setFullScreen)
		win.setFullScreen(true)
	else
		savedState.manage(win)

	win.once('ready-to-show', () => {
		win!.show()
	})

	// Open the DevTools.
	if (!!config.get('startup.show_dev_tools'))
		win.webContents.openDevTools()

	// and load the index.html of the app.
	win.loadURL(Url.format({
		pathname: Path.join(process.cwd(), `dist/app/${windowName}.html`),
		protocol: 'file:',
		slashes: true
	}))

	// Emitted when the window is closed.
	win.on('closed', () => {
		// Dereference the window object, usually you would store windows
		// in an array if your app supports multi windows, this is the time
		// when you should delete the corresponding element.
		win = null
	})
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow)

// Quit when all windows are closed.
app.on('window-all-closed', () => {
	// On macOS it is common for applications and their menu bar
	// to stay active until the user quits explicitly with Cmd + Q
	if (process.platform !== 'darwin') {
		app.quit()
	}
})

app.on('activate', () => {
	// On macOS it's common to re-create a window in the app when the
	// dock icon is clicked and there are no other windows open.
	if (win === null) {
		createWindow()
	}
})
