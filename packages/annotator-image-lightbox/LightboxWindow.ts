/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as Url from 'url'
import * as Path from 'path'
import * as Electron from 'electron'
import {BrowserWindowConstructorOptions} from 'electron'
import {windowStateKeeperOptions} from '../util/WindowStateKeeperOptions'

const config = require('../config')
const windowStateKeeper = require('electron-window-state')

interface LightboxWindowSettings {
	windowBackgroundColor: string
	openDevTools: boolean
}

export class LightboxWindow {
	private settings: LightboxWindowSettings
	private imageDetailsWindow: Electron.BrowserWindow | null // pop full-size 2D images into their own window
	private onClose: () => void

	constructor(onClose: () => void) {
		this.onClose = onClose
		this.settings = {
			windowBackgroundColor: config.get('startup.background_color') || '#000',
			openDevTools: !!config.get('startup.show_dev_tools'),
		}
		this.imageDetailsWindow = null
	}

	private createWindow(): Electron.BrowserWindow {
		if (this.imageDetailsWindow) return this.imageDetailsWindow

		const windowName = 'image-lightbox'

		const savedState = windowStateKeeper(windowStateKeeperOptions(windowName))
		const options = {
			...savedState,
			show: false,
			backgroundColor: this.settings.windowBackgroundColor,
			scrollBounce: true,
		} as BrowserWindowConstructorOptions
		const win = new Electron.remote.BrowserWindow(options)
		savedState.manage(win)

		win.once('ready-to-show', () => win.show())

		if (this.settings.openDevTools)
			win.webContents.openDevTools()

		win.loadURL(Url.format({
			pathname: Path.join(process.cwd(), `dist/app/${windowName}.html`),
			protocol: 'file:',
			slashes: true
		}))

		win.on('closed', () => {
			this.imageDetailsWindow = null
			this.onClose()
		})

		return win
	}
}
