/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as Url from 'url'
import * as Path from 'path'
import * as Electron from 'electron'
// import {BrowserWindowConstructorOptions} from 'electron'
import {windowStateKeeperOptions} from '../util/WindowStateKeeperOptions'
import {channel} from "../electron-ipc/Channel"
import * as IpcMessages from "../electron-ipc/Messages"
import config from '@/config'
import windowStateKeeper = require('electron-window-state')
import WindowCommunicator from '../util/WindowCommunicator'
import createPromise from '../util/createPromise'

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
	private onImageEditState: (state: IpcMessages.ImageEditState) => void
	private onImageClick: (click: IpcMessages.ImageClick) => void
	private onKeyDown: (event: IpcMessages.KeyboardEventHighlights) => void
	private onKeyUp: (event: IpcMessages.KeyboardEventHighlights) => void
	private onClose: () => void
	private lightboxCom: WindowCommunicator

	constructor(
		onImageEditState: (state: IpcMessages.ImageEditState) => void,
		onImageClick: (click: IpcMessages.ImageClick) => void,
		onKeyDown: (event: IpcMessages.KeyboardEventHighlights) => void,
		onKeyUp: (event: IpcMessages.KeyboardEventHighlights) => void,
		onClose: () => void
	) {
		this.onImageEditState = onImageEditState
		this.onImageClick = onImageClick
		this.onKeyDown = onKeyDown
		this.onKeyUp = onKeyUp
		this.onClose = onClose
		this.settings = {
			backgroundColor: config.get('startup.background_color') || '#000',
			openDevTools: !!config.get('startup.show_dev_tools'),
		}
		this.loadingWindow = false
		this.window = null
	}

	private createWindow(): Promise<void> {
		if (this.window) return Promise.resolve()
		if (this.loadingWindow) return Promise.resolve()

		this.loadingWindow = true

		const windowName = 'image-lightbox'
		const {promise, resolve} = createPromise<void, void>()

		// FIXME saved state doesn't work.
		const savedState = windowStateKeeper(windowStateKeeperOptions(windowName))
		console.log( objectToFeatureString( savedState ) )

		const options = `
			${objectToFeatureString( savedState )},
			show=yes,
			backgroundColor=${this.settings.backgroundColor},
			scrollBounce=yes,
			_blank,
		`

		const lightboxWindow = window.open(

			Url.format({
				pathname: Path.join(process.cwd(), `dist/app/${windowName}.html`),
				protocol: 'file:',
				slashes: true
			}),
			// 'about:blank',

			windowName,
			options // yeah, it's a string. Why would they make the API take a string of options???
		)!

		this.lightboxCom = new WindowCommunicator( lightboxWindow )

		this.openComChannels()

		// A trick (hack?) for getting the BrowserWindow we just created with native
		// window.open. The new window is now the focused window.
		const win = Electron.remote.BrowserWindow.getFocusedWindow()
		this.window = win

		savedState.manage(win)

		const onConnect = () => {
			this.lightboxCom.off('connect', onConnect)
			this.lightboxCom.emit('connect', 'ready!')

			win.show()
			this.loadingWindow = false
			resolve()
		}

		this.lightboxCom.on('connect', onConnect)

		if (this.settings.openDevTools)
			win.webContents.openDevTools()

		// win.loadURL(Url.format({
		// 	pathname: Path.join(process.cwd(), `dist/app/${windowName}.html`),
		// 	protocol: 'file:',
		// 	slashes: true
		// }))

		win.on('closed', () => {
			this.window = null
			this.loadingWindow = false
			this.closeComChannels()
			this.onClose()
		})

		return promise
	}

	openComChannels() {
		this.lightboxCom.on(channel.imageEditState, this.handleOnImageEditState)
		this.lightboxCom.on(channel.imageClick, this.handleOnImageClick)
		this.lightboxCom.on(channel.keyDownEvent, this.handleOnKeyDown)
		this.lightboxCom.on(channel.keyUpEvent, this.handleOnKeyUp)
	}

	closeComChannels() {
		this.lightboxCom.off(channel.imageEditState, this.handleOnImageEditState)
		this.lightboxCom.off(channel.imageClick, this.handleOnImageClick)
		this.lightboxCom.off(channel.keyDownEvent, this.handleOnKeyDown)
		this.lightboxCom.off(channel.keyUpEvent, this.handleOnKeyUp)
	}

	windowSetState(state: IpcMessages.LightboxState): Promise<void> {
		if (!state.images.length) return Promise.resolve()

		return this.createWindow()
			.then(() => {
				if (this.window) {
					console.log( 'window created -------------------------------------------------- ' )
					this.lightboxCom.emit(channel.lightboxState, state)
				}
				else
					console.warn('missing window')
			})
	}

	imageSetState(state: IpcMessages.ImageEditState): void {
		if (this.window)
			this.lightboxCom.emit(channel.imageEditState, state)
		else
			console.warn('missing window')
	}

	private handleOnImageEditState = (state: IpcMessages.ImageEditState): void =>
		this.onImageEditState(state)

	private handleOnImageClick = (click: IpcMessages.ImageClick): void =>
		this.onImageClick(click)

	private handleOnKeyDown = (event: IpcMessages.KeyboardEventHighlights): void =>
		this.onKeyDown(event)

	private handleOnKeyUp = (event: IpcMessages.KeyboardEventHighlights): void =>
		this.onKeyUp(event)
}

// regarding feature strings, see:
// https://developer.mozilla.org/en-US/docs/Web/API/Window/open#Window_features
function objectToFeatureString( obj: object ): string {

	// never set this to show=no or new windows can never be opened. See:
	// https://github.com/electron/electron/issues/13156
	let result = 'show=yes'

	let val

 	for ( const key in obj ) {

		val = obj[ key ]

		if ( typeof val === 'function' ) continue

		val = typeof val === 'string'
			? ( val === 'yes'
				? true
				: ( val === 'no' ? false : val )
			)
			: val

		val = typeof val === 'boolean' ? +!!val : val

		result += `,${ key }=${ val }`

	}

	return result

}
