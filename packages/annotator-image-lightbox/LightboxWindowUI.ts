/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as Electron from 'electron'
import {channel} from "../electron-ipc/Channel"
import * as TypeLogger from 'typelogger'
import * as IpcMessages from "../electron-ipc/Messages"
import {toKeyboardEventHighlights} from "../electron-ipc/Serializaton"
import WindowCommunicator from '../util/WindowCommunicator'

// tslint:disable-next-line:no-any
TypeLogger.setLoggerOutput(console as any)
const log = TypeLogger.getLogger(__filename)

// The main class responsible for rendering a Lightbox window, which contains a variable list of 2D images.
class LightboxWindowUI {
	private lightboxState: IpcMessages.LightboxState
	private imageChildren: HTMLImageElement[]
	private com: WindowCommunicator

	constructor() {
		this.lightboxState = {images: []}
		this.imageChildren = []

		window.addEventListener('resize', this.onResize)
		window.addEventListener('keydown', this.onKeyDown)
		window.addEventListener('keyup', this.onKeyUp)

		this.com = new WindowCommunicator()
		this.com.emit( 'connect', 'ready!' )
		this.com.on('connect', msg => {
			console.log('Main window says: ', msg)
		})

		this.openComChannels()
	}

	private openComChannels() {
		console.log('set up the darn ipc channel in lightbox window')
		this.com.on(channel.lightboxState, this.onLightboxState)
		this.com.on(channel.imageEditState, this.onImageEditState)
	}

	private onResize = (): void =>
		this.imageChildren.forEach(i => this.scaleLightboxImage(i)())

	// Let Annotator handle all keyboard events.
	private onKeyDown = (event: KeyboardEvent): void => {
		if (event.defaultPrevented) return
		if (!event.repeat) // Annotator ignores repeating events, and streaming them through IPC probably wouldn't perform well.
			this.com.emit(channel.keyDownEvent, toKeyboardEventHighlights(event))
	}

	private onKeyUp = (event: KeyboardEvent): void => {
		if (event.defaultPrevented) return
		this.com.emit(channel.keyUpEvent, toKeyboardEventHighlights(event))
	}

	// Throw away the old state. Rebuild the UI based on the new state.
	private onLightboxState = (state: IpcMessages.LightboxState): void => {
		console.log(' ############# receive lightbox state')
		log.info('onLightboxState', state)
		const imageListElement = document.getElementById('image_list')
		if (imageListElement) {
			this.imageChildren.forEach(i => imageListElement.removeChild(i))
			this.imageChildren = []

			state.images.forEach(imageDescription => {
				const img = this.createLightboxImage(imageDescription)
				imageListElement.appendChild(img)
				this.imageChildren.push(img)
			})
			this.lightboxState = state
			console.log(this.lightboxState)
		} else
			log.warn('missing element image_list')
	}

	// Update UI for one image.
	private onImageEditState = (state: IpcMessages.ImageEditState): void => {
		this.imageChildren
			.filter(img => img.id === state.uuid)
			.forEach(img => img.className = state.active ? 'image_highlighted' : 'image_default')
	}

	private imageSetState(uuid: string, active: boolean): void {
		this.com.emit(channel.imageEditState, {uuid: uuid, active: active} as IpcMessages.ImageEditState)
	}

	// Notify listeners when the pointer hovers over an image.
	private onImageMouseEnter = (ev: MouseEvent): void => {
		if ((ev.target as HTMLImageElement).id)
			this.imageSetState((ev.target as HTMLImageElement).id, true)
	}

	// Notify listeners when the pointer stops hovering over an image.
	private onImageMouseLeave = (ev: MouseEvent): void => {
		if ((ev.target as HTMLImageElement).id)
			this.imageSetState((ev.target as HTMLImageElement).id, false)
	}

	// Notify listeners of the coordinates of a click on an image.
	private onImageMouseUp = (ev: MouseEvent): void => {
		const img = ev.target as HTMLImageElement
		const rect = img.getBoundingClientRect()
		const pixelX = ev.clientX - rect.left
		const pixelY = ev.clientY - rect.top
		const ratioX = pixelX / img.width
		const ratioY = pixelY / img.height
		this.com.emit(channel.imageClick, {uuid: img.id, ratioX: ratioX, ratioY: ratioY} as IpcMessages.ImageClick)
	}

	// Scale it to fit the width of its parent.
	private scaleLightboxImage(img: HTMLImageElement): () => void {
		return (): void => {
			if (img.parentNode instanceof HTMLElement) {
				const aspectRatio = img.naturalWidth / img.naturalHeight
				const w = img.parentNode.offsetWidth
				const h = img.parentNode.offsetWidth / aspectRatio
				img.style.width = w + 'px'
				img.style.height = h + 'px'
			} else {
				log.warn("can't scaleLightboxImage() without a parentNode")
			}
		}
	}

	private createLightboxImage(imageDescription: IpcMessages.LightboxImageDescription): HTMLImageElement {
		const img = document.createElement('img')
		img.src = imageDescription.path
		img.id = imageDescription.uuid
		img.width = 0
		img.height = 0
		img.className = 'image_default'
		img.onmouseenter = this.onImageMouseEnter
		img.onmouseleave = this.onImageMouseLeave
		img.onmouseup = this.onImageMouseUp
		img.onload = this.scaleLightboxImage(img)
		return img
	}
}

export const lightbox = new LightboxWindowUI()
