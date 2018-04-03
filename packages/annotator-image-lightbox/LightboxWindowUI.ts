/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as Electron from 'electron'
import {channel} from "./IPC"
import * as TypeLogger from 'typelogger'
import {LightboxState} from "./LightboxState"
import EventEmitter = Electron.EventEmitter

// tslint:disable-next-line:no-any
TypeLogger.setLoggerOutput(console as any)
const log = TypeLogger.getLogger(__filename)

class LightboxWindowUI {
	private lightboxState: LightboxState
	private imageChildren: HTMLImageElement[]

	constructor() {
		this.lightboxState = {images: []}
		this.imageChildren = []

		Electron.ipcRenderer.on(channel.lightboxState, this.onLightboxState)
	}

	bind(): void {
	}

	private onLightboxState = (_: EventEmitter, state: LightboxState): void => {
		log.info('onLightboxState', state)
		const imageListElement = document.getElementById('image_list')
		if (imageListElement) {
			this.imageChildren.forEach(i => imageListElement.removeChild(i))
			this.imageChildren = []

			state.images.forEach(imageDescription => {
				const img = document.createElement('img')
				img.src = imageDescription.path
				img.width = 300
				imageListElement.appendChild(img)
				this.imageChildren.push(img)
			})
			this.lightboxState = state
		} else
			log.warn('missing element image_list')
	}
}

export const lightbox = new LightboxWindowUI()
