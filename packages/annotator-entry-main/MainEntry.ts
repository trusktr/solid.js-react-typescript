/**
 *  Copyright 2018 Mapper Inc. Part of the mapper-annotator project.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as Electron from 'electron'
import {BrowserWindow, BrowserWindowConstructorOptions} from 'electron'
const config = require('../config')

const app = Electron.app

const
	url = require('url'),
	Path = require('path')

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
	// Create the browser window.
	const options = {} as BrowserWindowConstructorOptions
	const width = parseInt(config.get('startup.electron.window.default.width'), 10)
	const height = parseInt(config.get('startup.electron.window.default.height'), 10)
	let maximize = false
	let goFullscreen = false
	if (width && height) {
		options.width = width
		options.height = height
	} else if (config.get('startup.kiosk_mode')) {
		goFullscreen = true
	} else {
		maximize = true
	}
	win = new BrowserWindow(options)
	if (goFullscreen) {
		win.setFullScreen(true)
	} else if (maximize) {
		win.maximize()
	}

	// Open the DevTools.
	if (!!config.get('startup.show_dev_tools'))
		win.webContents.openDevTools()

	// and load the index.html of the app.
	win.loadURL(url.format({
		pathname: Path.join(process.cwd(), 'dist/app/browser-entry.html'),
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

export {
}
