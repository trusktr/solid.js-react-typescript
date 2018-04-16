/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as Electron from 'electron'
import {channel} from "../electron-ipc/Channel"
import * as TypeLogger from 'typelogger'
import {ImageClick, ImageEditState, LightboxImageDescription, LightboxState} from "../electron-ipc/Messages"
import {sendToAnnotator} from "../electron-ipc/Wrapper"
import {toKeyboardEventHighlights} from "../electron-ipc/Serializaton"

// tslint:disable-next-line:no-any
TypeLogger.setLoggerOutput(console as any)
const log = TypeLogger.getLogger(__filename)

// The main class responsible for rendering a Lightbox window, which contains a variable list of 2D images.
class LightboxWindowUI {
	private lightboxState: LightboxState
	private imageChildren: HTMLImageElement[]

	constructor() {
		this.lightboxState = {images: []}
		this.imageChildren = []

		window.addEventListener('resize', this.onResize)
		window.addEventListener('keydown', this.onKeyDown)
		window.addEventListener('keyup', this.onKeyUp)

		Electron.ipcRenderer.on(channel.lightboxState, this.onLightboxState)
	}

	private onResize = (): void =>
		this.imageChildren.forEach(i => this.scaleLightboxImage(i)())

	// Let Annotator handle all keyboard events.
	private onKeyDown = (event: KeyboardEvent): void => {
		if (event.defaultPrevented) return
		if (!event.repeat) // Annotator ignores repeating events, and streaming them through IPC probably wouldn't perform well.
			sendToAnnotator(channel.keyDownEvent, toKeyboardEventHighlights(event))
	}

	private onKeyUp = (event: KeyboardEvent): void => {
		if (event.defaultPrevented) return
		sendToAnnotator(channel.keyUpEvent, toKeyboardEventHighlights(event))
	}

	// Throw away the old state. Rebuild the UI based on the new state.
	private onLightboxState = (_: Electron.EventEmitter, state: LightboxState): void => {
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
		} else
			log.warn('missing element image_list')
	}

	private static imageSetState(uuid: string, active: boolean): void {
		sendToAnnotator(channel.imageEditState, {uuid: uuid, active: active} as ImageEditState)
	}

	// Notify listeners when the pointer hovers over an image.
	private onImageMouseEnter = (ev: MouseEvent): void => {
		if ((ev.target as HTMLImageElement).id)
			LightboxWindowUI.imageSetState((ev.target as HTMLImageElement).id, true)
	}

	// Notify listeners when the pointer stops hovering over an image.
	private onImageMouseLeave = (ev: MouseEvent): void => {
		if ((ev.target as HTMLImageElement).id)
			LightboxWindowUI.imageSetState((ev.target as HTMLImageElement).id, false)
	}

	// Notify listeners of the coordinates of a click on an image.
	private onImageMouseUp = (ev: MouseEvent): void => {
		const img = ev.target as HTMLImageElement
		const rect = img.getBoundingClientRect()
		const pixelX = ev.clientX - rect.left
		const pixelY = ev.clientY - rect.top
		const ratioX = pixelX / img.width
		const ratioY = pixelY / img.height
		sendToAnnotator(channel.imageClick, {uuid: img.id, ratioX: ratioX, ratioY: ratioY} as ImageClick)
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

	private createLightboxImage(imageDescription: LightboxImageDescription): HTMLImageElement {
		const img = document.createElement('img')
		img.src = imageDescription.path
		img.id = imageDescription.uuid
		img.width = 0
		img.height = 0
		img.onmouseenter = this.onImageMouseEnter
		img.onmouseleave = this.onImageMouseLeave
		img.onmouseup = this.onImageMouseUp
		img.onload = this.scaleLightboxImage(img)
		return img
	}
}

export const lightbox = new LightboxWindowUI()
