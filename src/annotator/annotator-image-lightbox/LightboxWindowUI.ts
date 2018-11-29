/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import { channel } from '../../electron-ipc/Channel'
import * as IPCMessages from './IPCMessages'
import {
  getLogger as Logger,
  toKeyboardEventHighlights
} from '@mapperai/mapper-annotated-scene'
import WindowCommunicator from '../../util/WindowCommunicator'

const log = Logger(__filename)

// The main class responsible for rendering a Lightbox window, which contains a variable list of 2D images.
class LightboxWindowUI {
  private imageChildren: HTMLImageElement[]
  private communicator: WindowCommunicator

  constructor() {
    this.imageChildren = []

    window.addEventListener('resize', this.onResize)
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)

    this.communicator = new WindowCommunicator()
    this.communicator.send('connect', 'ready!')
    this.communicator.on('connect', msg => log.info('Main window says:', msg))

    this.openComChannels()
  }

  private openComChannels(): void {
    this.communicator.on(channel.lightboxState, this.onLightboxState)
    this.communicator.on(channel.imageEditState, this.onImageEditState)
  }

  private onResize = (): void =>
    this.imageChildren.forEach(i => this.scaleLightboxImage(i)())

  // Let Annotator handle all keyboard events.
  private onKeyDown = (event: KeyboardEvent): void => {
    if (event.defaultPrevented) return

    // Annotator ignores repeating events, and streaming them through IPC probably wouldn't perform well.
    if (!event.repeat) {
      this.communicator.send(
        channel.keyDownEvent,
        toKeyboardEventHighlights(event)
      )
    }
  }

  private onKeyUp = (event: KeyboardEvent): void => {
    if (event.defaultPrevented) return
    this.communicator.send(channel.keyUpEvent, toKeyboardEventHighlights(event))
  }

  // Throw away the old state. Rebuild the UI based on the new state.
  private onLightboxState = (state: IPCMessages.LightboxState): void => {
    const imageListElement = document.getElementById('image_list')

    if (imageListElement) {
      this.imageChildren.forEach(i => imageListElement.removeChild(i))
      this.imageChildren = []

      state.images.forEach(imageDescription => {
        const img = this.createLightboxImage(imageDescription)

        imageListElement.appendChild(img)
        this.imageChildren.push(img)
      })
    } else {
      log.warn('missing element image_list')
    }
  }

  // Update UI for one image.
  private onImageEditState = (state: IPCMessages.ImageEditState): void => {
    this.imageChildren
      .filter(img => img.id === state.uuid)
      .forEach(img => {
        img.className = state.active ? 'image_highlighted' : 'image_default'
      })
  }

  private imageSetState(uuid: string, active: boolean): void {
    this.communicator.send(channel.imageEditState, {
      uuid: uuid,
      active: active
    } as IPCMessages.ImageEditState)
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

    this.communicator.send(channel.imageClick, {
      uuid: img.id,
      ratioX: ratioX,
      ratioY: ratioY
    } as IPCMessages.ImageClick)
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

  private createLightboxImage(
    imageDescription: IPCMessages.LightboxImageDescription
  ): HTMLImageElement {
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