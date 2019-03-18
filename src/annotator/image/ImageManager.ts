/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as Electron from 'electron'
import * as THREE from 'three'
import {OrderedSet} from 'immutable'
import {ImageScreen} from './ImageScreen'
import {CalibratedImage} from './CalibratedImage'
import {LightboxWindowManager} from '../annotator-image-lightbox/LightboxWindowManager'
import * as IPCMessages from '../annotator-image-lightbox/IPCMessages'
import {readImageMetadataFile} from './Aurora'
import {
  getLogger as Logger,
  AnnotatedSceneActions,
  Events,
  UtmCoordinateSystem,
  EventEmitter,
} from '@mapperai/mapper-annotated-scene'
import {AuroraCameraParameters} from './CameraParameters'
import config from 'annotator-config'

const log = Logger(__filename)
const dialog = Electron.remote.dialog

interface ImageManagerSettings {
  imageScreenWidth: number // image screen width in meters
  imageScreenHeight: number // image screen height in meters
  visibleWireframe: boolean // whether to display a wireframe around the image
  clickedRayLength: number // length in meters of a ray cast from a camera through an image screen
}

// This tracks a set of images which can be displayed within the 3D scene as well as
// a subset of images which are loaded in their own window for closer inspection.
export class ImageManager {
  private settings: ImageManagerSettings
  private imageScreens: ImageScreen[]
  imageScreenMeshes: THREE.Mesh[]
  private opacity: number
  private lightboxWindow: LightboxWindowManager | null // pop full-size 2D images into their own window
  loadedImageDetails: OrderedSet<CalibratedImage>

  constructor(private utmCoordinateSystem: UtmCoordinateSystem, private channel: EventEmitter) {
    this.settings = {
      imageScreenWidth: config['image_manager.image_screen.width'],
      imageScreenHeight: config['image_manager.image_screen.height'],
      visibleWireframe: config['image_manager.image.wireframe.visible'],
      clickedRayLength: 100,
    }

    this.imageScreens = []
    this.imageScreenMeshes = []
    this.opacity = parseFloat(config['image_manager.image.opacity']) || 0.5
    this.lightboxWindow = null
    this.loadedImageDetails = OrderedSet()
  }

  // Set opacity of all images.
  setOpacity(opacity: number): boolean {
    if (this.opacity === opacity) return false
    this.opacity = opacity
    if (!this.imageScreens.length) return false
    this.imageScreens.forEach(i => i.setOpacity(opacity))
    this.channel.emit(Events.SCENE_SHOULD_RENDER)
    return true
  }

  showImageScreens(): void {
    this.imageScreens.forEach(i => i.makeVisible())
  }

  hideImageScreens(): void {
    this.imageScreens.forEach(i => i.makeInvisible())
  }

  // Get a list of interesting images from the user.
  loadImagesFromOpenDialog(): Promise<void> {
    return new Promise(
      (resolve: () => void, reject: (reason?: Error) => void): void => {
        const options: Electron.OpenDialogOptions = {
          message: 'Load Image Files',
          properties: ['openFile', 'multiSelections'],
          filters: [{name: 'images', extensions: ['jpeg', 'jpg', 'png']}],
        }

        const handler = (paths: string[]): void => {
          if (paths && paths.length) {
            const promises = paths.map(path => this.loadImageFromPath(path))

            Promise.all(promises)
              .then(() => resolve())
              .catch(err => reject(err))
          } else {
            reject(Error('no path selected'))
          }
        }

        dialog.showOpenDialog(options, handler)
      }
    )
  }

  // Load an image and its metadata.
  private loadImageFromPath(path: string): Promise<void> {
    return readImageMetadataFile(path, this.utmCoordinateSystem)
      .then(cameraParameters => {
        this.setUpScreen({
          path: path,
          imageScreen: new ImageScreen(
            path,
            this.settings.imageScreenWidth,
            this.settings.imageScreenHeight,
            this.settings.visibleWireframe
          ),
          parameters: cameraParameters,
        } as CalibratedImage)
      })
      .catch(err => {
        log.warn(`loadImageFromPath() failed on ${path}`)
        throw err
      })
  }

  // Manipulate an image object, using its metadata, so that it is located and oriented in a reasonable way in three.js space.
  private setUpScreen(calibratedImage: CalibratedImage): void {
    const screen = calibratedImage.imageScreen
    const position = calibratedImage.parameters.screenPosition
    const origin = calibratedImage.parameters.cameraOrigin

    screen.position.set(position.x, position.y, position.z)
    screen.scaleDistance(position.distanceTo(origin))
    screen.lookAt(origin)
    screen.setOpacity(this.opacity)
    screen.imageMesh.userData = calibratedImage // makes it easier to pass the object through the Annotator UI and back
    this.imageScreens.push(screen)
    this.imageScreenMeshes.push(screen.imageMesh)

    new AnnotatedSceneActions().addObjectToScene(screen)
    this.channel.emit(Events.IMAGE_SCREEN_LOAD_UPDATE, screen)
  }

  // When an image object is selected for closer inspection, push it over to the Lightbox for full-size, 2D display.
  loadImageIntoWindow(image: CalibratedImage): void {
    if (this.loadedImageDetails.has(image)) return

    if (!this.lightboxWindow) this.lightboxWindow = new LightboxWindowManager(this.channel)

    this.channel.on(Events.IMAGE_EDIT_STATE, this.onImageEditState)
    this.channel.on(Events.IMAGE_CLICK, this.onImageClick)
    this.channel.on(Events.LIGHTBOX_CLOSE, this.onLightboxWindowClose)

    this.loadedImageDetails = this.loadedImageDetails.add(image)

    this.lightboxWindow
      .windowSetState(this.toLightboxStateMessage())
      .catch(err => console.warn('loadImageIntoWindow() failed:', err))
  }

  private onLightboxWindowClose = (): void => {
    let updated = 0

    this.loadedImageDetails.forEach(i => i!.imageScreen.setHighlight(false) && updated++)

    this.loadedImageDetails = OrderedSet()

    if (updated) this.channel.emit(Events.SCENE_SHOULD_RENDER)
  }

  private toLightboxStateMessage(): IPCMessages.LightboxState {
    return {
      images: this.loadedImageDetails
        .reverse()
        .toArray()
        .map(i => {
          return {
            uuid: i.imageScreen.uuid,
            path: i.path,
          } as IPCMessages.LightboxImageDescription
        }),
    }
  }

  private onImageEditState = (state: IPCMessages.ImageEditState): void => {
    let updated = 0

    this.loadedImageDetails
      .filter(i => i!.imageScreen.uuid === state.uuid)
      .forEach(i => i!.imageScreen.setHighlight(state.active) && updated++)

    if (updated) this.channel.emit(Events.SCENE_SHOULD_RENDER)
  }

  private onImageClick = (click: IPCMessages.ImageClick): void => {
    this.loadedImageDetails
      .filter(i => i!.imageScreen.uuid === click.uuid)
      .forEach(i => {
        const parameters = i!.parameters

        if (parameters instanceof AuroraCameraParameters) {
          const ray = parameters.imageCoordinatesToRay(click.ratioX, click.ratioY, this.settings.clickedRayLength)

          this.channel.emit(Events.LIGHT_BOX_IMAGE_RAY_UPDATE, ray)
        } else {
          log.error(`found CalibratedImage with unknown type of parameters: ${parameters}`)
        }
      })
  }

  getImageScreen(imageScreenMesh: THREE.Mesh): ImageScreen | null {
    let foundScreen: ImageScreen | null = null

    this.imageScreens.forEach(screen => {
      if (screen.imageMesh === imageScreenMesh) foundScreen = screen
    })

    return foundScreen
  }

  highlightImageInLightbox(image: CalibratedImage): boolean {
    return this.imageSetState(image, true)
  }

  unhighlightImageInLightbox(image: CalibratedImage): boolean {
    return this.imageSetState(image, false)
  }

  private imageSetState(image: CalibratedImage, active: boolean): boolean {
    if (!this.loadedImageDetails.has(image)) return false

    if (this.lightboxWindow) {
      this.lightboxWindow.imageSetState({
        uuid: image.imageScreen.uuid,
        active: active,
      } as IPCMessages.ImageEditState)

      return true
    } else {
      log.warn('missing lightboxWindow')
      return false
    }
  }
}
