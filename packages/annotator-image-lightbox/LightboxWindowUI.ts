/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as Electron from 'electron'
import {channel} from "../electron-ipc/Channel"
import * as TypeLogger from 'typelogger'
import {ImageEditState, LightboxImageDescription, LightboxState} from "../electron-ipc/Messages"
import {sendToAnnotator} from "../electron-ipc/Wrapper"

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

		Electron.ipcRenderer.on(channel.lightboxState, this.onLightboxState)
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

	private onImageMouseEnter = (ev: MouseEvent): void => {
		if ((ev.target as HTMLImageElement).id)
			LightboxWindowUI.imageSetState((ev.target as HTMLImageElement).id, true)
	}

	private onImageMouseLeave = (ev: MouseEvent): void => {
		if ((ev.target as HTMLImageElement).id)
			LightboxWindowUI.imageSetState((ev.target as HTMLImageElement).id, false)
	}

	private createLightboxImage(imageDescription: LightboxImageDescription): HTMLImageElement {
		const img = document.createElement('img')
		img.src = imageDescription.path
		img.id = imageDescription.uuid
		img.width = 600
		return img
	}
}

export const lightbox = new LightboxWindowUI()
