/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as Url from 'url'
import * as Path from 'path'
import * as Electron from 'electron'
import {BrowserWindowConstructorOptions} from 'electron'
import {windowStateKeeperOptions} from '../util/WindowStateKeeperOptions'
import {channel} from "../electron-ipc/Channel"
import {ImageEditState, LightboxState} from "../electron-ipc/Messages"

const config = require('../config')
const windowStateKeeper = require('electron-window-state')

interface LightboxWindowManagerSettings {
	backgroundColor: string
	openDevTools: boolean
}

// This handles communication between the main Annotator window in `annotator-entry-ui`
// and the LightboxWindowUI window.
export class LightboxWindowManager {
	private settings: LightboxWindowManagerSettings
	private window: Electron.BrowserWindow | null // pop full-size 2D images into their own window
	private loadingWindow: boolean
	private onImageEditState: (state: ImageEditState) => void
	private onClose: () => void

	constructor(
		onImageEditState: (state: ImageEditState) => void,
		onClose: () => void
	) {
		this.onImageEditState = onImageEditState
		this.onClose = onClose
		this.settings = {
			backgroundColor: config.get('startup.background_color') || '#000',
			openDevTools: !!config.get('startup.show_dev_tools'),
		}
		this.loadingWindow = false
		this.window = null

		Electron.ipcRenderer.on(channel.imageEditState, this.unpackOnImageEditState)
	}

	private createWindow(): Promise<void> {
		if (this.window) return Promise.resolve()
		if (this.loadingWindow) return Promise.resolve()

		this.loadingWindow = true

		const windowName = 'image-lightbox'

		const savedState = windowStateKeeper(windowStateKeeperOptions(windowName))
		const options = {
			...savedState,
			show: false,
			backgroundColor: this.settings.backgroundColor,
			scrollBounce: true,
		} as BrowserWindowConstructorOptions
		const win = new Electron.remote.BrowserWindow(options)
		savedState.manage(win)

		const result = new Promise<void>((resolve: () => void): void => {
			win.once('ready-to-show', () => {
				win.show()
				this.window = win
				this.loadingWindow = false
				resolve()
			})
		})

		if (this.settings.openDevTools)
			win.webContents.openDevTools()

		win.loadURL(Url.format({
			pathname: Path.join(process.cwd(), `dist/app/${windowName}.html`),
			protocol: 'file:',
			slashes: true
		}))

		win.on('closed', () => {
			this.window = null
			this.loadingWindow = false
			this.onClose()
		})

		return result
	}

	setState(state: LightboxState): Promise<void> {
		if (!state.images.length) return Promise.resolve()

		return this.createWindow()
			.then(() => {
				if (this.window)
					this.window.webContents.send(channel.lightboxState, state)
				else
					console.warn('missing window')
			})
	}

	private unpackOnImageEditState = (_: Electron.EventEmitter, state: ImageEditState): void => {
		this.onImageEditState(state)
	}
}
