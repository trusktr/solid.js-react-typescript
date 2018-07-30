/**
 *  Copyright 2018 Mapper Inc. Part of the mapper-annotator project.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as Url from 'url'
import * as Path from 'path'
import * as Electron from 'electron'
import {BrowserWindow} from 'electron'
import restoreWindowState from './restoreWindowState'

const app = Electron.app

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

	win = new BrowserWindow({
		show: false,
		webPreferences: {
			// allow code inside this window to use use native window.open()
			nativeWindowOpen: true
		},
	})

	restoreWindowState(win, windowName)

	win.webContents.once('did-finish-load', () => {
		win!.show()
	})

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
	app.quit()
})

app.on('activate', () => {
	// On macOS it's common to re-create a window in the app when the
	// dock icon is clicked and there are no other windows open.
	if (win === null) {
		createWindow()
	}
})
