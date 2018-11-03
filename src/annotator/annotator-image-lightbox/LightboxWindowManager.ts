/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as Url from 'url'
import * as Path from 'path'
import * as Electron from 'electron'
import { windowStateKeeperOptions } from '../../util/WindowStateKeeperOptions'
import { channel as ipcChannel } from '../../electron-ipc/Channel'
import * as IPCMessages from './IPCMessages'
import WindowCommunicator from '../../util/WindowCommunicator'
import createPromise, { Resolve } from '../../util/createPromise'
import { EventEmitter } from 'events'
import {
	KeyboardEventHighlights,
	Events,
} from '@mapperai/mapper-annotated-scene'
import windowStateKeeper from 'electron-window-state'
import config from 'annotator-config'

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

	private lightboxCommunicator: WindowCommunicator

	constructor(private channel: EventEmitter) {
		this.settings = {
			backgroundColor: config['startup.background_color'] || '#000',
			openDevTools: !!config['startup.show_dev_tools'],
		}

		this.loadingWindow = false
		this.window = null
	}

	private async createWindow(): Promise<void> {
		if (this.window) return Promise.resolve()
		if (this.loadingWindow) return Promise.resolve()

		this.loadingWindow = true

		const windowName = 'imageLightbox'
		const {
			promise,
			resolve,
		}: { promise: Promise<void>; resolve: Resolve<void> } = createPromise<
			void,
			void
		>()
		const savedState = windowStateKeeper(
			await windowStateKeeperOptions(windowName),
		)
		const options = `${objectToFeatureString(savedState)},_blank`
		const lightboxWindow = window.open(
			'about:blank',
			windowName,
			options, // yeah, it's a string. Why would they make the API take a string of options???
		)!
		// A trick (hack?) for getting the BrowserWindow we just created with native
		// window.open. The new window is now the focused window.
		const win = Electron.remote.BrowserWindow.getFocusedWindow()

		this.window = win

		// if ( savedState.isMaximized ) win.maximize()
		// if ( savedState.isFullScreen ) win.setFullScreen(true)

		savedState.manage(win)

		this.lightboxCommunicator = new WindowCommunicator(lightboxWindow)
		this.openChannels()

		const onConnect = (): void => {
			this.lightboxCommunicator.off('connect', onConnect)
			this.lightboxCommunicator.send('connect', 'ready!')

			this.loadingWindow = false
			resolve()
		}

		this.lightboxCommunicator.on('connect', onConnect)

		if (this.settings.openDevTools) win.webContents.openDevTools()

		win.loadURL(
			Url.format({
				pathname: Path.resolve(__dirname, `${windowName}.html`),
				protocol: 'file:',
				slashes: true,
			}),
		)

		win.on('closed', () => {
			this.window = null
			this.loadingWindow = false
			this.closeChannels()
			this.channel.emit(Events.LIGHTBOX_CLOSE, {})
		})

		return promise
	}

	openChannels(): void {
		this.lightboxCommunicator.on(
			ipcChannel.imageEditState,
			this.handleOnImageEditState,
		)

		this.lightboxCommunicator.on(ipcChannel.imageClick, this.handleOnImageClick)
		this.lightboxCommunicator.on(ipcChannel.keyDownEvent, this.handleOnKeyDown)
		this.lightboxCommunicator.on(ipcChannel.keyUpEvent, this.handleOnKeyUp)
	}

	closeChannels(): void {
		this.lightboxCommunicator.off(
			ipcChannel.imageEditState,
			this.handleOnImageEditState,
		)

		this.lightboxCommunicator.off(
			ipcChannel.imageClick,
			this.handleOnImageClick,
		)

		this.lightboxCommunicator.off(ipcChannel.keyDownEvent, this.handleOnKeyDown)
		this.lightboxCommunicator.off(ipcChannel.keyUpEvent, this.handleOnKeyUp)
	}

	windowSetState(state: IPCMessages.LightboxState): Promise<void> {
		if (!state.images.length) return Promise.resolve()

		return this.createWindow().then(() => {
			if (this.window)
				this.lightboxCommunicator.send(ipcChannel.lightboxState, state)
			else console.warn('missing window')
		})
	}

	imageSetState(state: IPCMessages.ImageEditState): void {
		if (this.window)
			this.lightboxCommunicator.send(ipcChannel.imageEditState, state)
		else console.warn('missing window')
	}

	private handleOnImageEditState = (
		state: IPCMessages.ImageEditState,
	): void => {
		this.channel.emit(Events.IMAGE_EDIT_STATE, state)
	}

	private handleOnImageClick = (click: IPCMessages.ImageClick): void => {
		this.channel.emit(Events.IMAGE_CLICK, click)
	}

	private handleOnKeyDown = (event: KeyboardEventHighlights): void => {
		this.channel.emit(Events.KEYDOWN, event)
	}

	private handleOnKeyUp = (event: KeyboardEventHighlights): void => {
		this.channel.emit(Events.KEYUP, event)
	}
}

// regarding feature strings, see:
// https://developer.mozilla.org/en-US/docs/Web/API/Window/open#Window_features
function objectToFeatureString(obj: object): string {
	// never set this to show=no or new windows can never be opened. See:
	// https://github.com/electron/electron/issues/13156
	let result = 'show=yes'
	let val

	for (let key in obj) {
		if (!obj.hasOwnProperty(key)) continue

		val = obj[key]

		if (typeof val === 'function') continue

		if (key === 'x') key = 'left'
		if (key === 'y') key = 'top'

		val =
			typeof val === 'string'
				? val === 'yes'
					? true
					: val === 'no'
						? false
						: val
				: val

		val = typeof val === 'boolean' ? +!!val : val

		result += `,${key}=${val}`
	}

	return result
}
