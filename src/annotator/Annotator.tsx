/**
 *  Copyright 2017 Mapper Inc. Part of the mapper-annotator project.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

// TODO JOE
// - [ ] move app-specific events out of shared lib Events object
// - [x] move filesystem stuff out
// - [ ] move app actions out of shared lib actions
// - [ ] fix window state keeper

import config from 'annotator-config'
import * as Electron from 'electron'
import { flatten } from 'lodash'
import Button from '@material-ui/core/Button';
import { SimpleKML } from '../util/KmlUtils'
import * as Dat from 'dat.gui'
import { isNullOrUndefined } from 'util' // eslint-disable-line node/no-deprecated-api
import * as MapperProtos from '@mapperai/mapper-models'
import * as THREE from 'three'
import { ImageManager } from './image/ImageManager'
import { CalibratedImage } from './image/CalibratedImage'
import * as React from 'react'
import AnnotatorMenuView from './AnnotatorMenuView'
import { hexStringToHexadecimal } from '../util/Color'
import loadAnnotations from '../util/loadAnnotations'
import {
  AnnotatedSceneState,
  MousePosition,
  mousePositionToGLSpace,
  AnnotationType,
  AnnotationManager,
  Lane,
  NeighborLocation,
  NeighborDirection,
  Key,
  LayerId,
  LayerStatus,
  Layer,
  StatusWindowState,
  AnnotatedSceneController,
  THREEColorValue,
  getLogger as Logger,
  toProps,
  Events,
  AnnotatedSceneActions,
  DataProviderFactory,
  KeyboardEventHighlights,
  IAnnotatedSceneConfig,
  Marker,
  Annotation,
  DefaultConfig,
  StatusWindowActions,
} from '@mapperai/mapper-annotated-scene'
import { ReactUtil } from '@mapperai/mapper-saffron-sdk'
import {
  IThemedProperties,
  withStatefulStyles,
  mergeStyles,
} from '@mapperai/mapper-themes'
import {
  menuSpacing,
  panelBorderRadius,
} from './styleVars'
import { saveFileWithDialog } from '../util/file'

// const credentialProvider = async () => ({
// 	accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
// 	secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ''
// })

// TODO FIXME JOE tell webpack not to do synthetic default exports
// eslint-disable-next-line typescript/no-explicit-any
const dat: typeof Dat = (Dat as any).default as typeof Dat
import $ = require('jquery')
const dialog = Electron.remote.dialog
const log = Logger(__filename)

const allLayers: LayerId[] = ['base1', 'base1hi', 'anot1']

// Groups of layers which are visible together. They are toggled on/off with the 'show/hide' command.
// - all visible
// - annotations hidden
// - everything but annotations hidden
const layerGroups: LayerId[][] = [
  allLayers,
  ['base1', 'base1hi'], // todo IMAGE_SCREENS layer
  ['anot1']
]

const defaultLayerGroupIndex = 0

/**
 * The Annotator class is in charge of rendering the 3d Scene that includes the point clouds
 * and the annotations. It also handles the mouse and keyboard events needed to select
 * and modify the annotations.
 */

interface AnnotatorState {
  background: THREEColorValue
  layerGroupIndex: number
  bezierScaleFactor: number

  imageScreenOpacity: number

  annotationManager: AnnotationManager | null
  annotatedSceneController: AnnotatedSceneController | null

  lockBoundaries: boolean
  lockLanes: boolean
  lockPolygons: boolean
  lockTrafficDevices: boolean
  isImageScreensVisible: boolean

  annotatedSceneConfig?: IAnnotatedSceneConfig

  maxSuperTilesToLoad: number
  maxPointDensity: number
  roadPointsIntensityScale: number
}

interface AnnotatorProps extends IThemedProperties {
  statusWindowState?: StatusWindowState
  uiMenuVisible?: boolean
  carPose?: MapperProtos.mapper.models.PoseMessage
  isLiveMode?: boolean
  rendererSize?: Electron.Size
  camera?: THREE.Camera
  dataProviderFactory: DataProviderFactory
  isShiftKeyPressed?: boolean
  isAddMarkerMode?: boolean
  isAddConnectionMode?: boolean
  isConnectLeftNeighborMode?: boolean
  isConnectRightNeighborMode?: boolean
  isConnectFrontNeighborMode?: boolean
  isJoinAnnotationMode?: boolean
  isAddConflictOrDeviceMode?: boolean
  isMouseDown?: boolean
  isMouseDragging?: boolean
  mousePosition?: MousePosition
  isTransformControlsAttached?: boolean
  getAnnotationManagerRef?: (annotationManager: AnnotationManager | null) => void
  activeAnnotation?: Annotation | null
}

@ReactUtil.typedConnect(
  toProps(
    AnnotatedSceneState,
    'uiMenuVisible',
    'statusWindowState',
    'carPose',
    'isLiveMode',
    'rendererSize',
    'camera',
    'isShiftKeyPressed',
    'isAddMarkerMode',
    'isAddConnectionMode',
    'isConnectLeftNeighborMode',
    'isConnectRightNeighborMode',
    'isConnectFrontNeighborMode',
    'isJoinAnnotationMode',
    'isAddConflictOrDeviceMode',
    'isMouseDown',
    'isMouseDragging',
    'mousePosition',
    'activeAnnotation',
    'isTransformControlsAttached'
  )
)

@withStatefulStyles(styles)
export default class Annotator extends React.Component<
  AnnotatorProps,
  AnnotatorState
> {
  private raycasterImageScreen: THREE.Raycaster // used to highlight ImageScreens for selection
  private imageManager: ImageManager
  private highlightedImageScreenBox: THREE.Mesh | null // image screen which is currently active in the Annotator UI
  private highlightedLightboxImage: CalibratedImage | null // image screen which is currently active in the Lightbox UI
  private lightboxImageRays: THREE.Line[] // rays that have been formed in 3D by clicking images in the lightbox
  private gui?: dat.GUI
  private statusWindowActions = new StatusWindowActions()
  private sceneActions = new AnnotatedSceneActions()

  constructor(props: AnnotatorProps) {
    super(props)

    if (!isNullOrUndefined(config['output.trajectory.csv.path']))
      log.warn('Config option output.trajectory.csv.path has been removed.')

    if (!isNullOrUndefined(config['annotator.generate_voxels_on_point_load'])) {
      log.warn(
        'Config option annotator.generate_voxels_on_point_load has been removed.'
      )
    }

    if (config['startup.animation.fps']) {
      log.warn(
        'Config option startup.animation.fps has been removed. Use startup.render.fps.'
      )
    }

    this.raycasterImageScreen = new THREE.Raycaster()
    this.highlightedImageScreenBox = null
    this.highlightedLightboxImage = null
    this.lightboxImageRays = []

    const maxSuperTilesToLoad = parseInt(
      localStorage.getItem('maxSuperTilesToLoad') ||
      DefaultConfig['tile_manager.maximum_super_tiles_to_load'].toString()
    )
    const maxPointDensity = parseInt(
      localStorage.getItem('maxPointDensity') ||
      DefaultConfig['tile_manager.maximum_point_density'].toString()
    )
    const roadPointsIntensityScale = parseInt(DefaultConfig['tile_manager.road_points_intensity_scale'].toString())

    this.state = {
      background: hexStringToHexadecimal(
        config['startup.background_color'] || '#1d232a'
      ),
      layerGroupIndex: defaultLayerGroupIndex,
      bezierScaleFactor: 6,

      imageScreenOpacity:
        parseFloat(config['image_manager.image.opacity']) || 0.5,

      annotationManager: null,
      annotatedSceneController: null,

      isImageScreensVisible: true,

      lockBoundaries: false,
      lockLanes: false,
      lockPolygons: false,
      lockTrafficDevices: false,

      maxSuperTilesToLoad,
      maxPointDensity,
      roadPointsIntensityScale,
    }
  }

  private datContainer: JQuery

  // Create a UI widget to adjust application settings on the fly.
  createControlsGui(): void {
    if (!isNullOrUndefined(config['startup.show_color_picker'])) {
      log.warn(
        'config option startup.show_color_picker has been renamed to startup.show_control_panel'
      )
    }
    if (!config['startup.show_control_panel']) return

    const gui = (this.gui = new dat.GUI({
      hideable: false,
      closeOnTop: true,
      autoPlace: false,
    }))
    this.datContainer = $('<div class="dg ac"></div>')

    this.datContainer.append(gui.domElement)
    $('.annotated-scene-container').append(this.datContainer)

    this.datContainer.css({
      position: 'absolute',
      top: 0,
      left: 0
    })

    gui.domElement.className = 'threeJs_gui'

    gui.domElement.setAttribute(
      'style',
      `
			width: 245px;
			position: absolute;
			top: 13px;
			left: 13px;
			right: initial;
			bottom: initial;
			background: rgba(0,0,0,0.5);
			padding: 10px;
		`
    )

    const closeButton = gui.domElement.querySelector('.close-button')

    closeButton!.setAttribute(
      'style',
      `
			padding-bottom: 5px;
			cursor: pointer;
		`
    )

    gui
      .addColor(this.state, 'background')
      .name('Background')
      .onChange(() => {
        this.forceUpdate()
      })

    gui
      .add(this.state, 'imageScreenOpacity', 0, 1)
      .name('Image Opacity')
      .onChange((value: number) => {
        this.imageManager.setOpacity(value)
      })

    new AnnotatedSceneActions().setLockBoundaries(this.state.lockBoundaries)
    new AnnotatedSceneActions().setLockLanes(this.state.lockLanes)
    new AnnotatedSceneActions().setLockPolygons(this.state.lockPolygons)

    new AnnotatedSceneActions().setLockTrafficDevices(
      this.state.lockTrafficDevices
    )

    const folderLock = gui.addFolder('Lock')

    folderLock
      .add(this.state, 'lockBoundaries')
      .name('Boundaries')
      .onChange((value: boolean) => {
        if (
          value &&
          this.state.annotationManager!.getActiveBoundaryAnnotation()
        ) {
          this.state.annotatedSceneController!.cleanTransformControls()
          this.uiEscapeSelection()
        }

        new AnnotatedSceneActions().setLockBoundaries(value)
      })

    folderLock
      .add(this.state, 'lockLanes')
      .name('Lanes')
      .onChange((value: boolean) => {
        if (
          value &&
          (this.state.annotationManager!.getActiveLaneAnnotation() ||
            this.state.annotationManager!.getActiveConnectionAnnotation())
        ) {
          this.state.annotatedSceneController!.cleanTransformControls()
          this.uiEscapeSelection()
        }

        new AnnotatedSceneActions().setLockLanes(value)
      })

    folderLock
      .add(this.state, 'lockPolygons')
      .name('Polygons')
      .onChange((value: boolean) => {
        if (
          value &&
          this.state.annotationManager!.getActivePolygonAnnotation()
        ) {
          this.state.annotatedSceneController!.cleanTransformControls()
          this.uiEscapeSelection()
        }

        new AnnotatedSceneActions().setLockPolygons(value)
      })

    folderLock
      .add(this.state, 'lockTrafficDevices')
      .name('Traffic Devices')
      .onChange((value: boolean) => {
        if (
          value &&
          this.state.annotationManager!.getActiveTrafficDeviceAnnotation()
        ) {
          this.state.annotatedSceneController!.cleanTransformControls()
          this.uiEscapeSelection()
        }

        new AnnotatedSceneActions().setLockTrafficDevices(value)
      })

    folderLock.open()

    const folderConnection = gui.addFolder('Connection params')

    const bezierScaleFactor = this.state.bezierScaleFactor

    folderConnection
      .add({ bezierScaleFactor }, 'bezierScaleFactor', 1, 50)
      .step(1)
      .name('Curvature')
      .onChange(bezierScaleFactor => {
        this.setState({ bezierScaleFactor })
      })

    folderConnection.open()

    const tileFolder = gui.addFolder('Tile Settings')

    tileFolder
      .add({ maxSuperTilesToLoad: this.state.maxSuperTilesToLoad }, 'maxSuperTilesToLoad', 1, 3000)
      .step(1)
      .name('Max tiles')
      .onChange(maxSuperTilesToLoad => this.setState({ maxSuperTilesToLoad }))

    tileFolder
      .add({ maxPointDensity: this.state.maxPointDensity }, 'maxPointDensity', 1, 1000)
      .step(1)
      .name('Max density')
      .onChange(maxPointDensity => this.setState({ maxPointDensity }))

    tileFolder
      .add({roadPointsIntensityScale: this.state.roadPointsIntensityScale}, 'roadPointsIntensityScale', 1, 50)
      .step(1)
      .name('Road contrast')
      .onChange(roadPointsIntensityScale => this.setState({roadPointsIntensityScale}))

    tileFolder.open()
  }

  private destroyControlsGui(): void {
    if (!this.gui) return
    this.gui.destroy()
    this.gui.domElement.remove()
    this.datContainer.remove()
  }

  // When ImageManager loads an image, add it to the scene.
  // IDEA JOE The UI can have check boxes for showing/hiding layers.
  // private onImageScreenLoad = (): void => {
  // 	this.state.annotatedSceneController!.setLayerVisibility([Layers.IMAGE_SCREENS])
  // }

  // When a lightbox ray is created, add it to the scene.
  // On null, remove all rays.
  // private onLightboxImageRay = (ray: THREE.Line): void => {
  // 	// Accumulate rays while shift is pressed, otherwise clear old ones.
  // 	if (!this.props.isShiftKeyPressed) this.clearLightboxImageRays()
  //
  // 	this.state.annotatedSceneController!.setLayerVisibility([Layers.IMAGE_SCREENS])
  // 	this.lightboxImageRays.push(ray)
  // 	new AnnotatedSceneActions().addObjectToScene(ray)
  // }

  private clearLightboxImageRays = (): void => {
    if (!this.lightboxImageRays.length) return

    this.lightboxImageRays.forEach(r =>
      new AnnotatedSceneActions().removeObjectFromScene(r)
    )

    this.lightboxImageRays = []
  }

  private getLightboxImageRays = (
    callback: (lightboxImageRays: THREE.Line[]) => void
  ): void => {
    callback(this.lightboxImageRays)
  }

  private checkForImageScreenSelection = (): void => {
    if (this.props.isLiveMode) return
    if (!this.props.isShiftKeyPressed) return
    if (this.props.isMouseDown) return
    if (this.props.isAddMarkerMode) return
    if (this.props.isAddConnectionMode) return
    if (
      this.props.isConnectLeftNeighborMode ||
      this.props.isConnectRightNeighborMode ||
      this.props.isConnectFrontNeighborMode
    )
      return
    if (this.props.isJoinAnnotationMode) return
    if (!this.state.isImageScreensVisible) return

    if (!this.imageManager.imageScreenMeshes.length)
      return this.unHighlightImageScreenBox()

    const mouse = mousePositionToGLSpace(
      this.props.mousePosition!,
      this.props.rendererSize!
    )

    this.raycasterImageScreen.setFromCamera(mouse, this.props.camera!)

    const intersects = this.raycasterImageScreen.intersectObjects(
      this.imageManager.imageScreenMeshes
    )

    // No screen intersected
    if (!intersects.length) {
      this.unHighlightImageScreenBox()
    } else {
      // Get intersected screen
      const first = intersects[0].object as THREE.Mesh
      const image = first.userData as CalibratedImage

      // Unhighlight previous screen
      if (
        (this.highlightedImageScreenBox &&
          this.highlightedImageScreenBox.id !== first.id) ||
        (this.highlightedLightboxImage &&
          this.highlightedLightboxImage !== image)
      )
        this.unHighlightImageScreenBox()

      // Highlight new screen
      this.highlightImageScreenBox(first)
    }
  }

  private clickImageScreenBox = (event: MouseEvent): void => {
    if (this.props.isLiveMode) return
    if (this.props.isMouseDragging) return
    if (!this.state.isImageScreensVisible) return

    switch (event.button) {
      // Left click released
      case 0: {
        if (!this.highlightedImageScreenBox) return

        const mouse = mousePositionToGLSpace(
          this.props.mousePosition!,
          this.props.rendererSize!
        )

        this.raycasterImageScreen.setFromCamera(mouse, this.props.camera!)

        const intersects = this.raycasterImageScreen.intersectObject(
          this.highlightedImageScreenBox
        )

        if (intersects.length) {
          const image = this.highlightedImageScreenBox
            .userData as CalibratedImage

          this.unHighlightImageScreenBox()
          this.imageManager.loadImageIntoWindow(image)
        }

        break
      }

      // Middle click released
      case 1: {
        // no actions
        break
      }

      // Right  click released
      case 2: {
        if (this.props.isShiftKeyPressed) return

        const mouse = mousePositionToGLSpace(
          this.props.mousePosition!,
          this.props.rendererSize!
        )

        this.raycasterImageScreen.setFromCamera(mouse, this.props.camera!)

        const intersects = this.raycasterImageScreen.intersectObjects(
          this.imageManager.imageScreenMeshes
        )

        // Get intersected screen
        if (intersects.length) {
          const first = intersects[0].object as THREE.Mesh
          const material = first.material as THREE.MeshBasicMaterial

          material.opacity = this.state.imageScreenOpacity

          const screen = this.imageManager.getImageScreen(first)

          if (screen) screen.unloadImage()

          this.state.annotatedSceneController!.shouldRender()
        }

        break
      }

      default:
        log.warn('This should never happen.')
    }
  }

  // Draw the box with max opacity to indicate that it is active.
  private highlightImageScreenBox(imageScreenBox: THREE.Mesh): void {
    if (this.props.isLiveMode) return
    if (!this.props.isShiftKeyPressed) return

    if (imageScreenBox === this.highlightedImageScreenBox) return

    this.highlightedImageScreenBox = imageScreenBox

    const screen = this.imageManager.getImageScreen(imageScreenBox)

    if (screen) {
      screen
        .loadImage()
        .then(loaded => {
          if (loaded) {
            this.state.annotatedSceneController!.shouldRender()
            return true
          }

          return false
        })
        .catch(err => log.warn('getImageScreen() failed', err))
    }

    const image = imageScreenBox.userData as CalibratedImage

    // If it's already loaded in the lightbox, highlight it in the lightbox.
    // Don't allow it to be loaded a second time.
    if (this.imageManager.loadedImageDetails.has(image)) {
      if (this.imageManager.highlightImageInLightbox(image))
        this.highlightedLightboxImage = image
      return
    }

    const material = imageScreenBox.material as THREE.MeshBasicMaterial

    material.opacity = 1.0
    this.state.annotatedSceneController!.shouldRender()
  }

  // Draw the box with default opacity like all the other boxes.
  private unHighlightImageScreenBox(): void {
    if (this.highlightedLightboxImage) {
      if (
        this.imageManager.unhighlightImageInLightbox(
          this.highlightedLightboxImage
        )
      )
        this.highlightedLightboxImage = null
    }

    if (!this.highlightedImageScreenBox) return

    const material = this.highlightedImageScreenBox
      .material as THREE.MeshBasicMaterial

    material.opacity = this.state.imageScreenOpacity
    this.highlightedImageScreenBox = null
    this.state.annotatedSceneController!.shouldRender()
  }

  mapKey(
    key: Key,
    fn: (e?: KeyboardEvent | KeyboardEventHighlights) => void
  ): void {
    this.state.annotatedSceneController!.mapKey(key, fn)
  }

  mapKeyDown(
    key: Key,
    fn: (e?: KeyboardEvent | KeyboardEventHighlights) => void
  ): void {
    this.state.annotatedSceneController!.mapKeyDown(key, fn)
  }

  mapKeyUp(
    key: Key,
    fn: (e?: KeyboardEvent | KeyboardEventHighlights) => void
  ): void {
    this.state.annotatedSceneController!.mapKeyUp(key, fn)
  }

  keyHeld(key: Key, fn: (held: boolean) => void): void {
    this.state.annotatedSceneController!.keyHeld(key, fn)
  }

  setKeys(): void {
    // TODO JOE later: better keymap organization, a way to specify stuff like
    // `ctrl+a` and let users customize. Perhaps built on ELectron
    // accelerators and possibly similar to Atom key maps.

    const actions = new AnnotatedSceneActions()

    this.mapKey('Backspace', () => this.uiDeleteActiveAnnotation())
    this.mapKey('Escape', () => this.uiEscapeSelection())
    this.mapKeyDown('Shift', () => this.onShiftKeyDown())
    this.mapKeyUp('Shift', () => this.onShiftKeyUp())
    // this.mapKey('A', () => this.uiDeleteAllAnnotations()) // disable for now
    this.mapKey('b', () => this.uiAddAnnotation(AnnotationType.BOUNDARY))

    this.mapKey('C', () =>
      this.state.annotatedSceneController!.focusOnPointCloud()
    )

    this.mapKey('d', () => this.state.annotationManager!.deleteLastMarker())
    this.mapKey('F', () => this.uiReverseLaneDirection())
    this.mapKey('h', () => this.uiToggleLayerVisibility())
    this.mapKey('P', () => this.state.annotationManager!.publish())
    this.mapKey('n', () => this.uiAddAnnotation(AnnotationType.LANE))

    this.mapKey('R', () =>
      this.state.annotatedSceneController!.resetTiltAndCompass()
    )

    this.mapKey('p', () => this.uiAddAnnotation(AnnotationType.POLYGON))
    this.mapKey('t', () => this.uiAddAnnotation(AnnotationType.TRAFFIC_DEVICE))

    this.mapKey('V', () =>
      this.state.annotatedSceneController!.toggleCameraType()
    )

    this.mapKey('X', () =>
      this.state.annotationManager!.cycleTransformControlModes()
    )

    this.keyHeld('a', held => actions.setAddMarkerMode(held))
    this.keyHeld('c', held => actions.setAddConnectionMode(held))
    this.keyHeld('f', held => actions.setConnectFrontNeighborMode(held))
    this.keyHeld('j', held => actions.setJoinAnnotationMode(held))
    this.keyHeld('l', held => actions.setConnectLeftNeighborMode(held))
    this.keyHeld('q', held => actions.setAddConflictOrDeviceMode(held))
    this.keyHeld('r', held => actions.setConnectRightNeighborMode(held))
  }

  addImageScreenLayer(): void {
    // const imagesToggle = (visible: boolean): void => {
    // 	this.setState({isImageScreensVisible: visible})
    // }
    //this.state.annotatedSceneController!.addLayer(Layers.IMAGE_SCREENS, imagesToggle)
  }

  /**
   * Unselect whatever is selected in the UI:
   *  - an active control point
   *  - a selected annotation
   */
  uiEscapeSelection(): void {
    if (this.props.isTransformControlsAttached) {
      // defer to the next tick so that TransformControls has a chance to run it's synchronous escape key logic
      setTimeout(() => {
        this.state.annotatedSceneController!.cleanTransformControls()
      }, 0)
    } else if (this.state.annotationManager!.state.activeAnnotation) {
      this.state.annotationManager!.unsetActiveAnnotation()
      this.deactivateAllAnnotationPropertiesMenus()
    }

    if (document.activeElement && document.activeElement.tagName === 'INPUT')
      (document.activeElement as HTMLInputElement).blur()
  }

  // TODO JOE I don't think we need this because checkForImageScreenSelection is
  // already triggered on mousemove, and checkForImageScreenSelection checks
  // if Shift key is pressed, so this may be redundant.
  private onShiftKeyDown = (): void => {
    this.checkForImageScreenSelection()
  }

  private onShiftKeyUp = (): void => {
    this.unHighlightImageScreenBox()
  }

  private uiDeleteActiveAnnotation(): void {
    // Delete annotation from scene
    if (this.state.annotationManager!.deleteActiveAnnotation()) {
      log.info('Deleted selected annotation')
      this.deactivateLanePropUI()
      this.state.annotationManager!.hideTransform()
    }
  }

  // Create an annotation, add it to the scene, and activate (highlight) it.
  private uiAddAnnotation(annotationType: AnnotationType): void {
    if (
      this.state.annotationManager!.createAndAddAnnotation(
        annotationType,
        true
      )[0]
    ) {
      this.sceneActions.setLayerStatus(Layer.anot1, LayerStatus.Visible)
      log.info(`Added new ${AnnotationType[annotationType]} annotation`)
      this.deactivateAllAnnotationPropertiesMenus(annotationType)
      this.resetAllAnnotationPropertiesMenuElements()
      this.state.annotationManager!.hideTransform()
    } else {
      throw new Error(
        'unable to add annotation of type ' + AnnotationType[annotationType]
      )
    }
  }

  private saveAnnotationsJson = () => {
    const json = JSON.stringify(this.state.annotationManager!.annotationsToJSON())
    const sessionId = this.state.annotatedSceneController!.dataProvider!.sessionId

    saveFileWithDialog(
      json,
      'application/json',
      `annotations${sessionId ? '-'+sessionId : ''}.json`
    )
  }

  /**
   * 	Save lane waypoints (only) to KML.
   */
  private saveAnnotationsKML = () => {
    const { utmCoordinateSystem } = this.state.annotatedSceneController!.state

    function annotationToGeoPoints(a: Annotation): Array<THREE.Vector3> {
      return a.outline.map(m => utmCoordinateSystem!.threeJsToLngLatAlt(m.position))
    }

    // Get all the points and convert to lat lon
    const kml = new SimpleKML()

    const annotations = this.state.annotationManager!.state
    annotations.boundaryAnnotations.forEach(a => kml.addPath(annotationToGeoPoints(a)))
    annotations.laneAnnotations.forEach(a => kml.addPolygon(annotationToGeoPoints(a)))
    annotations.connectionAnnotations.forEach(a => kml.addPolygon(annotationToGeoPoints(a)))
    annotations.trafficDeviceAnnotations.forEach(a => kml.addPoints(annotationToGeoPoints(a)))

    const sessionId = this.state.annotatedSceneController!.dataProvider!.sessionId

    saveFileWithDialog(
      kml.toString(),
      'application/vnd.google-earth.kml+xml',
      `annotations${sessionId ? '-'+sessionId : ''}.kml`
    )
  }

  private addFront(): void {
    log.info('Adding connected annotation to the front')

    if (
      this.state.annotationManager!.addConnectedLaneAnnotation(
        NeighborLocation.FRONT,
        NeighborDirection.SAME
      )
    )
      Annotator.deactivateFrontSideNeighbours()
  }

  private addLeftSame(): void {
    log.info('Adding connected annotation to the left - same direction')

    if (
      this.state.annotationManager!.addConnectedLaneAnnotation(
        NeighborLocation.LEFT,
        NeighborDirection.SAME
      )
    )
      Annotator.deactivateLeftSideNeighbours()
  }

  private addLeftReverse(): void {
    log.info('Adding connected annotation to the left - reverse direction')

    if (
      this.state.annotationManager!.addConnectedLaneAnnotation(
        NeighborLocation.LEFT,
        NeighborDirection.REVERSE
      )
    )
      Annotator.deactivateLeftSideNeighbours()
  }

  private addRightSame(): void {
    log.info('Adding connected annotation to the right - same direction')

    if (
      this.state.annotationManager!.addConnectedLaneAnnotation(
        NeighborLocation.RIGHT,
        NeighborDirection.SAME
      )
    )
      Annotator.deactivateRightSideNeighbours()
  }

  private addRightReverse(): void {
    log.info('Adding connected annotation to the right - reverse direction')

    if (
      this.state.annotationManager!.addConnectedLaneAnnotation(
        NeighborLocation.RIGHT,
        NeighborDirection.REVERSE
      )
    )
      Annotator.deactivateRightSideNeighbours()
  }

  private uiReverseLaneDirection(): void {
    log.info('Reverse lane direction.')

    const {
      result,
      existLeftNeighbour,
      existRightNeighbour
    }: {
      result: boolean
      existLeftNeighbour: boolean
      existRightNeighbour: boolean
    } = this.state.annotationManager!.reverseLaneDirection()

    if (result) {
      if (existLeftNeighbour) Annotator.deactivateLeftSideNeighbours()
      else Annotator.activateLeftSideNeighbours()

      if (existRightNeighbour) Annotator.deactivateRightSideNeighbours()
      else Annotator.activateRightSideNeighbours()
    }
  }

  // TODO JOE handle DOM events the React way {{

  /**
   * Bind functions events to interface elements
   */
  private bindLanePropertiesPanel(): void {
    const lcType = $('#lp_select_type')

    lcType.on('change', () => {
      lcType.blur()

      const activeAnnotation = this.state.annotationManager!.getActiveLaneAnnotation()

      if (activeAnnotation === null) return

      log.info(
        'Adding lane type: ' +
          lcType
            .children('option')
            .filter(':selected')
            .text()
      )

      activeAnnotation.type = +lcType.val()
    })

    const lcLeftType = $('#lp_select_left_type')

    lcLeftType.on('change', () => {
      lcLeftType.blur()

      const activeAnnotation = this.state.annotationManager!.getActiveLaneAnnotation()

      if (activeAnnotation === null) return

      log.info(
        'Adding left side type: ' +
          lcLeftType
            .children('option')
            .filter(':selected')
            .text()
      )

      activeAnnotation.leftLineType = +lcLeftType.val()
      activeAnnotation.updateVisualization()
    })

    const lcLeftColor = $('#lp_select_left_color')

    lcLeftColor.on('change', () => {
      lcLeftColor.blur()

      const activeAnnotation = this.state.annotationManager!.getActiveLaneAnnotation()

      if (activeAnnotation === null) return

      log.info(
        'Adding left side color: ' +
          lcLeftColor
            .children('option')
            .filter(':selected')
            .text()
      )

      activeAnnotation.leftLineColor = +lcLeftColor.val()
      activeAnnotation.updateVisualization()
    })

    const lcRightType = $('#lp_select_right_type')

    lcRightType.on('change', () => {
      lcRightType.blur()

      const activeAnnotation = this.state.annotationManager!.getActiveLaneAnnotation()

      if (activeAnnotation === null) return

      log.info(
        'Adding right side type: ' +
          lcRightType
            .children('option')
            .filter(':selected')
            .text()
      )

      activeAnnotation.rightLineType = +lcRightType.val()
      activeAnnotation.updateVisualization()
    })

    const lcRightColor = $('#lp_select_right_color')

    lcRightColor.on('change', () => {
      lcRightColor.blur()

      const activeAnnotation = this.state.annotationManager!.getActiveLaneAnnotation()

      if (activeAnnotation === null) return

      log.info(
        'Adding right side color: ' +
          lcRightColor
            .children('option')
            .filter(':selected')
            .text()
      )

      activeAnnotation.rightLineColor = +lcRightColor.val()
      activeAnnotation.updateVisualization()
    })
  }

  unbindLanePropertiesPanel() {
    $('#lp_select_type').off()
    $('#lp_select_left_type').off()
    $('#lp_select_left_color').off()
    $('#lp_select_right_type').off()
    $('#lp_select_right_color').off()
  }

  private bindLaneNeighborsPanel(): void {
    const lpAddLeftOpposite = $('#lp_add_left_opposite')

    lpAddLeftOpposite.on('click', () => {
      this.addLeftReverse()
    })

    const lpAddLeftSame = $('#lp_add_left_same')

    lpAddLeftSame.on('click', () => {
      this.addLeftSame()
    })

    const lpAddRightOpposite = $('#lp_add_right_opposite')

    lpAddRightOpposite.on('click', () => {
      this.addRightReverse()
    })

    const lpAddRightSame = $('#lp_add_right_same')

    lpAddRightSame.on('click', () => {
      this.addRightSame()
    })

    const lpAddFront = $('#lp_add_forward')

    lpAddFront.on('click', () => {
      this.addFront()
    })
  }

  unbindLaneNeighborsPanel() {
    $('#lp_add_left_opposite').off()
    $('#lp_add_left_same').off()
    $('#lp_add_right_opposite').off()
    $('#lp_add_right_same').off()
    $('#lp_add_forward').off()
  }

  private bindConnectionPropertiesPanel(): void {
    const cpType = $('#cp_select_type')

    cpType.on('change', () => {
      cpType.blur()

      const activeAnnotation = this.state.annotationManager!.getActiveConnectionAnnotation()

      if (activeAnnotation === null) return

      // prettier-ignore
      log.info('Adding connection type: ' + cpType.children('options').filter(':selected').text())

      activeAnnotation.type = +cpType.val()
    })

    const cpLeftType = $('#cp_select_left_type')
    cpLeftType.on('change', () => {
      cpLeftType.blur()
      const activeAnnotation = this.state.annotationManager!.getActiveConnectionAnnotation()
      if (activeAnnotation === null) return
      // prettier-ignore
      log.info("Adding left side type: " + cpLeftType.children("option").filter(":selected").text())
      activeAnnotation.leftLineType = +cpLeftType.val()
      activeAnnotation.updateVisualization()
    })

    const cpLeftColor = $('#cp_select_left_color')
    cpLeftColor.on('change', () => {
      cpLeftColor.blur()
      const activeAnnotation = this.state.annotationManager!.getActiveConnectionAnnotation()
      if (activeAnnotation === null) return
      // prettier-ignore
      log.info("Adding left side color: " + cpLeftColor.children("option").filter(":selected").text())
      activeAnnotation.leftLineColor = +cpLeftColor.val()
      activeAnnotation.updateVisualization()
    })

    const cpRightType = $('#cp_select_right_type')
    cpRightType.on('change', () => {
      cpRightType.blur()
      const activeAnnotation = this.state.annotationManager!.getActiveConnectionAnnotation()
      if (activeAnnotation === null) return
      // prettier-ignore
      log.info("Adding right side type: " + cpRightType.children("option").filter(":selected").text())
      activeAnnotation.rightLineType = +cpRightType.val()
      activeAnnotation.updateVisualization()
    })

    const cpRightColor = $('#cp_select_right_color')
    cpRightColor.on('change', () => {
      cpRightColor.blur()
      const activeAnnotation = this.state.annotationManager!.getActiveConnectionAnnotation()
      if (activeAnnotation === null) return
      // prettier-ignore
      log.info("Adding left side color: " + cpRightColor.children("option").filter(":selected").text())
      activeAnnotation.rightLineColor = +cpRightColor.val()
      activeAnnotation.updateVisualization()
    })
  }

  unbindConnectionPropertiesPanel() {
    $('#cp_select_type').off()
    $('#cp_select_left_type').off()
    $('#cp_select_left_color').off()
    $('#cp_select_right_type').off()
    $('#cp_select_right_color').off()
  }

  private bindPolygonPropertiesPanel(): void {
    // nothing in this panel at the moment
  }
  unbindPolygonPropertiesPanel() {
    // nothing to unbind
  }

  private bindTrafficDevicePropertiesPanel(): void {
    const tpType = $('#tp_select_type')

    tpType.on('change', () => {
      tpType.blur()

      const activeAnnotation = this.state.annotationManager!.getActiveTrafficDeviceAnnotation()

      if (activeAnnotation === null) return

      log.info(
        'Adding traffic device type: ' +
          tpType
            .children('option')
            .filter(':selected')
            .text()
      )

      activeAnnotation.type = +tpType.val()
      activeAnnotation.updateVisualization()
      this.state.annotatedSceneController!.shouldRender()
    })
  }

  unbindTrafficDevicePropertiesPanel() {
    $('#tp_select_type').off()
  }

  private bindBoundaryPropertiesPanel(): void {
    const bpType = $('#bp_select_type')

    bpType.on('change', () => {
      bpType.blur()

      const activeAnnotation = this.state.annotationManager!.getActiveBoundaryAnnotation()

      if (activeAnnotation === null) return

      log.info(
        'Adding boundary type: ' +
          bpType
            .children('options')
            .filter(':selected')
            .text()
      )

      activeAnnotation.type = +bpType.val()
    })

    const bpColor = $('#bp_select_color')

    bpColor.on('change', () => {
      bpColor.blur()

      const activeAnnotation = this.state.annotationManager!.getActiveBoundaryAnnotation()

      if (activeAnnotation === null) return

      log.info(
        'Adding boundary color: ' +
          bpColor
            .children('options')
            .filter(':selected')
            .text()
      )

      activeAnnotation.color = +bpColor.val()
    })
  }

  unbindBoundaryPropertiesPanel() {
    $('#bp_select_type').off()
    $('#bp_select_color').off()
  }

  private bind(): void {
    this.bindLanePropertiesPanel()
    this.bindLaneNeighborsPanel()
    this.bindConnectionPropertiesPanel()
    this.bindPolygonPropertiesPanel()
    this.bindTrafficDevicePropertiesPanel()
    this.bindBoundaryPropertiesPanel()

    const menuControlElement = $('#menu_control')

    if (menuControlElement.length) menuControlElement[0].style.visibility = 'visible'
    else log.warn('missing element menu_control')

    const toolsDelete = $('#tools_delete')

    toolsDelete.on('click', () => {
      this.uiDeleteActiveAnnotation()
    })

    const toolsAddLane = $('#tools_add_lane')

    toolsAddLane.on('click', () => {
      this.uiAddAnnotation(AnnotationType.LANE)
    })

    const toolsAddTrafficDevice = $('#tools_add_traffic_device')

    toolsAddTrafficDevice.on('click', () => {
      this.uiAddAnnotation(AnnotationType.TRAFFIC_DEVICE)
    })

    const toolsLoadImages = $('#tools_load_images')

    toolsLoadImages.on('click', () => {
      this.imageManager
        .loadImagesFromOpenDialog()
        .catch(err =>
          log.warn('loadImagesFromOpenDialog failed: ' + err.message)
        )
    })

    const toolsLoadAnnotation = $('#tools_load_annotation')

    toolsLoadAnnotation.on('click', () => {
      const options: Electron.OpenDialogOptions = {
        message: 'Load Annotations File',
        properties: ['openFile'],
        filters: [{ name: 'json', extensions: ['json'] }]
      }

      const handler = async (paths: string[]): Promise<void> => {
        if (paths && paths.length) {
          try {
            await loadAnnotations.call(
              this,
              paths[0],
              this.state.annotatedSceneController!
            )
          } catch (err) {
            log.warn('loadAnnotations failed: ' + err.message)
          }
        }
      }

      dialog.showOpenDialog(options, handler)
    })

    this.deactivateAllAnnotationPropertiesMenus()
  }

  unbind() {
    this.unbindLanePropertiesPanel()
    this.unbindLaneNeighborsPanel()
    this.unbindConnectionPropertiesPanel()
    this.unbindPolygonPropertiesPanel()
    this.unbindTrafficDevicePropertiesPanel()
    this.unbindBoundaryPropertiesPanel()

    $('#menu_control').off()
    $('#tools_add_lane').off()
    $('#tools_add_traffic_device').off()
    $('#tools_load_images').off()
    $('#tools_load_annotation').off()
    $('#tools_export_kml').off()
  }

  // }}

  private expandAccordion(domId: string): void {
    if (!this.props.uiMenuVisible) return
    $(domId).accordion('option', { active: 0 })
  }

  private collapseAccordion(domId: string): void {
    if (!this.props.uiMenuVisible) return
    $(domId).accordion('option', { active: false })
  }

  // TODO JOE this all will be controlled by React state + markup  at some point {{

  private resetAllAnnotationPropertiesMenuElements = (): void => {
    this.resetBoundaryProp()
    this.resetLaneProp()
    this.resetConnectionProp()
    this.resetPolygonProp()
    this.resetTrafficDeviceProp()
  }

  /**
   * Reset lane properties elements based on the current active lane
   */
  private resetLaneProp(): void {
    const activeAnnotation = this.state.annotationManager!.getActiveLaneAnnotation()

    if (!activeAnnotation) return

    this.expandAccordion('#menu_lane')

    if (activeAnnotation.neighborsIds.left.length > 0)
      Annotator.deactivateLeftSideNeighbours()
    else Annotator.activateLeftSideNeighbours()

    if (activeAnnotation.neighborsIds.right.length > 0)
      Annotator.deactivateRightSideNeighbours()
    else Annotator.activateRightSideNeighbours()

    if (activeAnnotation.neighborsIds.front.length > 0)
      Annotator.deactivateFrontSideNeighbours()
    else Annotator.activateFrontSideNeighbours()

    const lpSelectType = $('#lp_select_type')

    lpSelectType.removeAttr('disabled')
    lpSelectType.val(activeAnnotation.type.toString())

    const lpSelectLeft = $('#lp_select_left_type')

    lpSelectLeft.removeAttr('disabled')
    lpSelectLeft.val(activeAnnotation.leftLineType.toString())

    const lpSelectLeftColor = $('#lp_select_left_color')

    lpSelectLeftColor.removeAttr('disabled')
    lpSelectLeftColor.val(activeAnnotation.leftLineColor.toString())

    const lpSelectRight = $('#lp_select_right_type')

    lpSelectRight.removeAttr('disabled')
    lpSelectRight.val(activeAnnotation.rightLineType.toString())

    const lpSelectRightColor = $('#lp_select_right_color')

    lpSelectRightColor.removeAttr('disabled')
    lpSelectRightColor.val(activeAnnotation.rightLineColor.toString())
  }

  /**
   * Reset polygon properties elements based on the current active polygon
   */
  private resetPolygonProp(): void {
    const activeAnnotation = this.state.annotationManager!.getActivePolygonAnnotation()

    if (!activeAnnotation) return

    this.expandAccordion('#menu_polygon')
  }

  /**
   * Reset traffic device properties elements based on the current active traffic device
   */
  private resetTrafficDeviceProp(): void {
    const activeAnnotation = this.state.annotationManager!.getActiveTrafficDeviceAnnotation()

    if (!activeAnnotation) return

    this.expandAccordion('#menu_traffic_device')

    const tpSelectType = $('#tp_select_type')

    tpSelectType.removeAttr('disabled')
    tpSelectType.val(activeAnnotation.type.toString())
  }

  /**
   * Reset boundary properties elements based on the current active boundary
   */
  private resetBoundaryProp(): void {
    const activeAnnotation = this.state.annotationManager!.getActiveBoundaryAnnotation()

    if (!activeAnnotation) return

    this.expandAccordion('#menu_boundary')

    const bpSelectType = $('#bp_select_type')

    bpSelectType.removeAttr('disabled')
    bpSelectType.val(activeAnnotation.type.toString())

    const bpSelectColor = $('#bp_select_color')

    bpSelectColor.removeAttr('disabled')
    bpSelectColor.val(activeAnnotation.color.toString())
  }

  /**
   * Reset connection properties elements based on the current active connection
   */
  private resetConnectionProp(): void {
    const activeAnnotation = this.state.annotationManager!.getActiveConnectionAnnotation()

    if (!activeAnnotation) return

    this.expandAccordion('#menu_connection')

    const cpSelectType = $('#cp_select_type')

    cpSelectType.removeAttr('disabled')
    cpSelectType.val(activeAnnotation.type.toString())

    const cpSelectLeft = $('#cp_select_left_type')
    cpSelectLeft.removeAttr('disabled')
    cpSelectLeft.val(activeAnnotation.leftLineType.toString())

    const cpSelectLeftColor = $('#cp_select_left_color')
    cpSelectLeftColor.removeAttr('disabled')
    cpSelectLeftColor.val(activeAnnotation.leftLineColor.toString())

    const cpSelectRight = $('#cp_select_right_type')
    cpSelectRight.removeAttr('disabled')
    cpSelectRight.val(activeAnnotation.rightLineType.toString())

    const cpSelectRightColor = $('#cp_select_right_color')
    cpSelectRightColor.removeAttr('disabled')
    cpSelectRightColor.val(activeAnnotation.rightLineColor.toString())
  }

  private deactivateAllAnnotationPropertiesMenus = (
    exceptFor: AnnotationType = AnnotationType.UNKNOWN
  ): void => {
    if (!this.props.uiMenuVisible) return
    if (exceptFor !== AnnotationType.BOUNDARY) this.deactivateBoundaryProp()
    if (exceptFor !== AnnotationType.LANE) this.deactivateLanePropUI()
    if (exceptFor !== AnnotationType.CONNECTION) this.deactivateConnectionProp()
    if (exceptFor !== AnnotationType.POLYGON) this.deactivatePolygonProp()
    if (exceptFor !== AnnotationType.TRAFFIC_DEVICE)
      this.deactivateTrafficDeviceProp()
  }

  /**
   * Deactivate lane properties menu panel
   */
  private deactivateLanePropUI(): void {
    this.collapseAccordion('#menu_lane')

    Annotator.deactivateLeftSideNeighbours()
    Annotator.deactivateRightSideNeighbours()
    Annotator.deactivateFrontSideNeighbours()

    const lpId = document.getElementById('lp_id_value')

    if (lpId) lpId.textContent = 'UNKNOWN'
    else log.warn('missing element lp_id_value')

    const lpWidth = document.getElementById('lp_width_value')

    if (lpWidth) lpWidth.textContent = 'UNKNOWN'
    else log.warn('missing element lp_width_value')

    const laneProp1 = document.getElementById('lane_prop_1')

    if (laneProp1) {
      const selects = laneProp1.getElementsByTagName('select')

      for (let i = 0; i < selects.length; ++i) {
        selects.item(i)!.selectedIndex = 0
        selects.item(i)!.setAttribute('disabled', 'disabled')
      }
    } else {
      log.warn('missing element lane_prop_1')
    }
  }

  // TODO JOE Annotator should ask for getLaneWidth() and update #lp_width_value for itself
  uiUpdateLaneWidth = (lane): void => {
    const laneWidth = $('#lp_width_value')

    laneWidth.text(lane.getLaneWidth().toFixed(3) + ' m')
  }

  /**
   * Deactivate boundary properties menu panel
   */
  private deactivateBoundaryProp(): void {
    this.collapseAccordion('#menu_boundary')

    const bpId = document.getElementById('bp_id_value')

    if (bpId) bpId.textContent = 'UNKNOWN'
    else log.warn('missing element bp_id_value')

    const bpType = document.getElementById('bp_select_type')

    if (bpType) bpType.setAttribute('disabled', 'disabled')
    else log.warn('missing element bp_select_type')

    const bpColor = document.getElementById('bp_select_color')

    if (bpColor) bpColor.setAttribute('disabled', 'disabled')
    else log.warn('missing element bp_select_color')

    const boundaryProp = document.getElementById('boundary_prop')

    if (boundaryProp) {
      const selects = boundaryProp.getElementsByTagName('select')

      for (let i = 0; i < selects.length; ++i) {
        selects.item(i)!.selectedIndex = 0
        selects.item(i)!.setAttribute('disabled', 'disabled')
      }
    } else {
      log.warn('missing element boundary_prop')
    }
  }

  /**
   * Deactivate connection properties menu panel
   */
  private deactivateConnectionProp(): void {
    this.collapseAccordion('#menu_connection')

    const cpId = document.getElementById('cp_id_value')

    if (cpId) cpId.textContent = 'UNKNOWN'
    else log.warn('missing element cp_id_value')

    const cpType = document.getElementById('cp_select_type')

    if (cpType) cpType.setAttribute('disabled', 'disabled')
    else log.warn('missing element cp_select_type')

    const connectionProp = document.getElementById('connection_prop')

    if (connectionProp) {
      const selects = connectionProp.getElementsByTagName('select')

      for (let i = 0; i < selects.length; ++i) {
        selects.item(i)!.selectedIndex = 0
        selects.item(i)!.setAttribute('disabled', 'disabled')
      }
    } else {
      log.warn('missing element boundary_prop')
    }
  }

  /**
   * Deactivate polygon properties menu panel
   */
  private deactivatePolygonProp(): void {
    this.collapseAccordion('#menu_polygon')
  }

  /**
   * Deactivate traffic device properties menu panel
   */
  private deactivateTrafficDeviceProp(): void {
    this.collapseAccordion('#menu_traffic_device')

    const tpId = document.getElementById('tp_id_value')

    if (tpId) tpId.textContent = 'UNKNOWN'
    else log.warn('missing element tp_id_value')

    const tpType = document.getElementById('tp_select_type')

    if (tpType) tpType.setAttribute('disabled', 'disabled')
    else log.warn('missing element tp_select_type')
  }

  /**
   * Deactivate/activate left side neighbours
   */
  private static deactivateLeftSideNeighbours(): void {
    const lpAddLeftOpposite = document.getElementById('lp_add_left_opposite')

    if (lpAddLeftOpposite)
      lpAddLeftOpposite.setAttribute('disabled', 'disabled')
    else log.warn('missing element lp_add_left_opposite')

    const lpAddLeftSame = document.getElementById('lp_add_left_same')

    if (lpAddLeftSame) lpAddLeftSame.setAttribute('disabled', 'disabled')
    else log.warn('missing element lp_add_left_same')
  }

  private static activateLeftSideNeighbours(): void {
    const lpAddLeftOpposite = document.getElementById('lp_add_left_opposite')

    if (lpAddLeftOpposite) lpAddLeftOpposite.removeAttribute('disabled')
    else log.warn('missing element lp_add_left_opposite')

    const lpAddLeftSame = document.getElementById('lp_add_left_same')

    if (lpAddLeftSame) lpAddLeftSame.removeAttribute('disabled')
    else log.warn('missing element lp_add_left_same')
  }

  /**
   * Deactivate right side neighbours
   */
  private static deactivateRightSideNeighbours(): void {
    const lpAddRightOpposite = document.getElementById('lp_add_right_opposite')

    if (lpAddRightOpposite)
      lpAddRightOpposite.setAttribute('disabled', 'disabled')
    else log.warn('missing element lp_add_right_opposite')

    const lpAddRightSame = document.getElementById('lp_add_right_same')

    if (lpAddRightSame) lpAddRightSame.setAttribute('disabled', 'disabled')
    else log.warn('missing element lp_add_right_same')
  }

  private static activateRightSideNeighbours(): void {
    const lpAddRightOpposite = document.getElementById('lp_add_right_opposite')

    if (lpAddRightOpposite) lpAddRightOpposite.removeAttribute('disabled')
    else log.warn('missing element lp_add_right_opposite')

    const lpAddRightSame = document.getElementById('lp_add_right_same')

    if (lpAddRightSame) lpAddRightSame.removeAttribute('disabled')
    else log.warn('missing element lp_add_right_same')
  }

  /**
   * Deactivate/activate front side neighbours
   */
  private static deactivateFrontSideNeighbours(): void {
    const lpAddFront = document.getElementById('lp_add_forward')

    if (lpAddFront) lpAddFront.setAttribute('disabled', 'disabled')
    else log.warn('missing element lp_add_forward')
  }

  private static activateFrontSideNeighbours(): void {
    const lpAddFront = document.getElementById('lp_add_forward')

    if (lpAddFront) lpAddFront.removeAttribute('disabled')
    else log.warn('missing element lp_add_forward')
  }

  // Toggle the visibility of data by cycling through the groups defined in layerGroups.
  private uiToggleLayerVisibility(): void {
    let { layerGroupIndex } = this.state

    layerGroupIndex++

    if (!layerGroups[layerGroupIndex]) layerGroupIndex = defaultLayerGroupIndex

    allLayers.forEach(layerId => {
      const status = layerGroups[layerGroupIndex].find(id => id === layerId)
        ? LayerStatus.Visible
        : LayerStatus.Hidden
      this.state.annotatedSceneController!.setLayerStatus(layerId, status)
    })

    this.setState({ layerGroupIndex })
  }

  private snapMarker = (transformedObjects: ReadonlyArray<THREE.Object3D>): void => {
    if (!(transformedObjects[0] instanceof Marker)) return

    // get active annotation
    const activeAnnotation = this.state.annotationManager!.getActiveAnnotation()

    if (!activeAnnotation) {
      throw new Error(`
        It should not be possible to snap a point if an annotation is not
        selected and therefore there are no markers visible to interact with.
      `)
    }

    // get the selected marker we just transformed
    // Here's we're relying on the fact that the first item in the array is the
    // marker we explicitly transformed (see the `neighbors` array in
    // AnnotationManager.checkForActiveMarker)
    const transformedMarkers = [...transformedObjects] as Marker[]
    const transformedMarker = transformedMarkers.shift()!

    // get all markers in view
    const frustum = new THREE.Frustum
    const projScreenMatrix = new THREE.Matrix4
    const {camera} = this.props
    projScreenMatrix.multiplyMatrices( camera!.projectionMatrix, camera!.matrixWorldInverse )
		frustum.setFromMatrix( projScreenMatrix )

    const markersInView = this.getMarkersInFrustum(frustum, activeAnnotation.markers)

    let closestMarker: Marker
    let smallestDistance: number = Infinity
    const snapThreshold = 0.5

    // See if any markers are within the snap threshold
    markersInView.forEach(marker => {
      const distance = transformedMarker.position.distanceTo(marker.position)

      if (distance < smallestDistance) {
        smallestDistance = distance
        closestMarker = marker
      }
    })

    const shouldSnap = smallestDistance <= snapThreshold

    // debugger

    if (shouldSnap) {
      const snapDirection = closestMarker!.position.clone()
        .sub(transformedMarker.position)

      // adjust position of selected marker to closest marker within threshold
      transformedMarker.position.copy(closestMarker!.position)

      // apply the same movement to other selected markers
      transformedMarkers.forEach(marker => {
        marker.position.add(snapDirection)
      })

      activeAnnotation.updateVisualization()

      this.state.annotatedSceneController!.updateTransformControls()

      this.state.annotatedSceneController!.shouldRender()
    }
  }

  getAnnotationsInFrustum(frustum: THREE.Frustum) {
    return this.state.annotationManager!.allAnnotations()
      .filter(annotation => {
        const object = annotation.renderingObject

        let hasMeshInView = false

        object.traverse(object => {
          if (hasMeshInView) return

          if (hasGeometry(object) && frustum.intersectsObject(object))
            hasMeshInView = true
        })

        return hasMeshInView
      })
  }

  getMarkersInFrustum(frustum: THREE.Frustum, markersToExclude: Marker[]) {
    const annotationsInView = this.getAnnotationsInFrustum(frustum)

    return flatten(
      annotationsInView.map(annotation =>
        annotation.markers.filter(marker =>
          frustum.intersectsObject(marker) && !markersToExclude.includes(marker)
        )
      )
    )
  }

  /**
   * Create scene config
   *
   * @returns Object
   */
  private makeAnnotatedSceneConfig = () => {
    return {
      'startup.camera_offset': [0, 200, 100],
      'tile_manager.maximum_points_to_load': 20000000,
      'tile_manager.road_points_intensity_scale': this.state.roadPointsIntensityScale,
      'tile_manager.maximum_point_density': this.state.maxPointDensity,
      'tile_manager.maximum_super_tiles_to_load': this.state.maxSuperTilesToLoad,
      'tile_manager.initial_super_tiles_to_load': 1,
      'tile_manager.super_tile_scale': [24, 24, 24],
      'annotator.area_of_interest.size': [60, 20, 60],
      'tile_manager.stats_display.enable': true,
      'status_window.external_location_links.enable': true,
      'annotator.draw_bounding_box': false,
      'annotator.area_of_interest.enable': true
    } as IAnnotatedSceneConfig
  }

  private onPublishClick = () => {
    this.state.annotationManager!.publish()
  }

  private onStatusWindowClick = () => {
    this.statusWindowActions.toggleEnabled()
  }

  private onMenuClick = () => {
    this.sceneActions.toggleUIMenuVisible()
  }

  componentDidMount(): void {
    document.addEventListener('mousemove', this.checkForImageScreenSelection)
    document.addEventListener('mouseup', this.clickImageScreenBox)

    this.setState({
      annotatedSceneConfig: this.makeAnnotatedSceneConfig()
    })
  }

  componentWillUnmount(): void {
    this.unbind()

    document.removeEventListener('mousemove', this.checkForImageScreenSelection)
    document.removeEventListener('mouseup', this.clickImageScreenBox)

    try {
      this.destroyControlsGui()
    } catch (err) {
      log.error('destroyControlsGui() failed', err)
    }

    try {
      this.state.annotatedSceneController &&
        this.state.annotatedSceneController.cleanup()
    } catch (err) {
      log.error('annotatedSceneController.cleanup() failed', err)
    }
    // TODO JOE  - remove event listeners  - clean up child windows
  }

  componentDidUpdate(
    _oldProps: AnnotatorProps,
    oldState: AnnotatorState
  ): void {
    if (!oldState.annotationManager && this.state.annotationManager) {

      if (this.state.annotationManager) {
        this.createControlsGui()
      } else {
        this.destroyControlsGui()
      }

    }

    if (oldState.isImageScreensVisible !== this.state.isImageScreensVisible) {
      if (this.state.isImageScreensVisible) this.imageManager.showImageScreens()
      else this.imageManager.hideImageScreens()
    }

    if (oldState.maxSuperTilesToLoad !== this.state.maxSuperTilesToLoad) {
      localStorage.setItem('maxSuperTilesToLoad', this.state.maxSuperTilesToLoad.toString())
    }

    if (oldState.maxPointDensity !== this.state.maxPointDensity) {
      localStorage.setItem('maxPointDensity', this.state.maxPointDensity.toString())
    }
  }

  private attachScene = () => {
    const annotatedSceneController = this.state.annotatedSceneController!
    const { utmCoordinateSystem, channel } = annotatedSceneController.state

    this.imageManager = new ImageManager(utmCoordinateSystem!, channel!)

    // events from ImageManager
    channel!.on(Events.KEYDOWN, annotatedSceneController.onKeyDown)
    channel!.on(Events.KEYUP, annotatedSceneController.onKeyUp)
    //channel!.on(Events.IMAGE_SCREEN_LOAD_UPDATE, this.onImageScreenLoad)
    channel!.on(Events.LIGHTBOX_CLOSE, this.clearLightboxImageRays)

    // IDEA JOE maybe we need a separate LightBoxRayManager? Or at least move to ImageManager
    //channel!.on(Events.LIGHT_BOX_IMAGE_RAY_UPDATE, this.onLightboxImageRay)
    channel!.on(Events.GET_LIGHTBOX_IMAGE_RAYS, this.getLightboxImageRays)
    channel!.on(Events.CLEAR_LIGHTBOX_IMAGE_RAYS, this.clearLightboxImageRays)

    channel!.on(Events.TRANSFORM_DONE, this.snapMarker)

    // UI updates
    // TODO JOE move UI logic to React/JSX, and get state from Redux

    channel!.on(
      Events.deactivateFrontSideNeighbours,
      Annotator.deactivateFrontSideNeighbours
    )

    channel!.on(
      Events.deactivateLeftSideNeighbours,
      Annotator.deactivateLeftSideNeighbours
    )

    channel!.on(
      Events.deactivateRightSideNeighbours,
      Annotator.deactivateRightSideNeighbours
    )

    channel!.on(
      Events.deactivateAllAnnotationPropertiesMenus,
      this.deactivateAllAnnotationPropertiesMenus
    )

    channel!.on(
      Events.resetAllAnnotationPropertiesMenuElements,
      this.resetAllAnnotationPropertiesMenuElements
    )

    channel!.on(Events.ANNOTATION_VISUAL_UPDATE, lane => {
      lane instanceof Lane && this.uiUpdateLaneWidth(lane)
    })

    channel!.once(Events.ANNOTATED_SCENE_READY, async () => {
      this.addImageScreenLayer()

      const annotationsPath = config['startup.annotations_path']

      if (annotationsPath) {
        await loadAnnotations.call(
          this,
          annotationsPath,
          this.state.annotatedSceneController
        )
      }
    })

    this.bind()
    this.setKeys()
  }

  /* eslint-disable typescript/no-explicit-any */
  private setAnnotatedSceneRef = (ref: any) => {
    this.setState(
      {
        annotatedSceneController: ref as AnnotatedSceneController
      },
      this.attachScene
    )
  }
  /* eslint-enable typescript/no-explicit-any */

  // TODO JOE don't get refs directly, proxy functionality through AnnotatedSceneController
  private setAnnotationManagerRef = (ref: AnnotationManager) => {
    ref && this.setState({ annotationManager: ref })
    this.props.getAnnotationManagerRef && this.props.getAnnotationManagerRef(ref)
  }

  render(): JSX.Element {
    const { annotatedSceneConfig } = this.state
    const { dataProviderFactory, classes } = this.props

    return !dataProviderFactory || !annotatedSceneConfig ? (
      <div />
    ) : (
      <React.Fragment>
        <div id="menu_control" className={classes!.menuControl}>
          <Button variant="contained" color="primary" onClick={this.onPublishClick} classes={{root: classes!.publishButton!}}>
            Publish
          </Button>
          <Button variant="contained" color="primary" onClick={this.onStatusWindowClick}>
            &#x2139;
          </Button>
          <Button variant="contained" color="primary" onClick={this.onMenuClick}>
            &#9776;
          </Button>
        </div>
        <AnnotatorMenuView
          uiMenuVisible={this.props.uiMenuVisible!}
          selectedAnnotation={ this.props.activeAnnotation }
          onSaveAnnotationsJson={this.saveAnnotationsJson}
          onSaveAnnotationsKML={this.saveAnnotationsKML}
        />
        <AnnotatedSceneController
          sceneRef={this.setAnnotatedSceneRef}
          backgroundColor={this.state.background}
          bezierScaleFactor={this.state.bezierScaleFactor}
          roadPointsIntensityScale={this.state.roadPointsIntensityScale}
          annotationManagerRef={this.setAnnotationManagerRef}
          dataProviderFactory={dataProviderFactory}
          config={annotatedSceneConfig}
          classes={{root: classes!.annotatedScene}}
        />
      </React.Fragment>
    )
  }
}

// TODO replace with the new helpers from the cleanup PRs
function hasGeometry(n: THREE.Object3D): boolean {
  return !!(n as any).geometry

  // FIXME The following doesn't work because the annotated-scene bundle uses
  // it's own version of Three.js, so we can not check objects made in
  // annotated-scene against Annotator's version of Three.js
  //
  // return (
  //   n instanceof THREE.Mesh ||
  //   n instanceof THREE.Line ||
  //   n instanceof THREE.Points ||
  //   n instanceof THREE.Sprite
  // )
}

const numberOfButtons = 3

function styles() {
  return mergeStyles({
    annotatedScene: {
      height: '100%',
      maxHeight: '100%',
      minHeight: '100%',
      border: 0,
      padding: 0,
      margin: 0,
      width: '100%',
      maxWidth: '100%',
      minWidth: '100%',
      fontFamily: 'Verdana, Geneva, sans-serif',
      overflowX: 'hidden',
      overflowY: 'hidden',

      '& canvas.annotated-scene-canvas': {
        width: '100%',
        height: '100%'
      },

      '& .hidden': {
        display: 'none'
      },

      '&, & *, & *::after, & *::before': {
        boxSizing: 'border-box'
      },
    },

    menuControl: {
      backgroundColor: 'transparent',
      position: 'absolute',
      zIndex: 1,
      top: menuSpacing,
      right: menuSpacing,
      visibility: 'hidden',
      height: '32px',
      display: 'flex',
      justifyContent: 'space-between',

      "& > *": {
        width: `calc(${100/numberOfButtons}% - ${menuSpacing/2}px)`,
        "& span": {
          fontSize: '1.5rem',
          lineHeight: '1.5rem',
        },
        "&$publishButton": {
          "& span": {
            fontSize: '1rem',
            lineHeight: '1rem',
          },
        },
      }
    },

    publishButton: {},

    '@global': {
      // this is inside of AnnotatedSceneController
      '#status_window': {
        position: 'absolute',
        left: menuSpacing,
        bottom: menuSpacing,
        backgroundColor: 'rgba(255, 255, 255, 0.5)',
        padding: '5px',
        zIndex: 3,
        borderRadius: panelBorderRadius,
      },

      '.performanceStats': {
        // FIXME, if the status_window height gets taller because of
        // annotated-scene, then it overlaps with the performance stats
        bottom: '76px!important',
      },
    },
  })
}