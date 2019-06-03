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
import {flatten, head, uniq} from 'lodash'
import Button from '@material-ui/core/Button'
import {withStyles, createStyles, Theme, WithStyles} from '@material-ui/core'
import {SimpleKML} from '../util/KmlUtils'
import * as Dat from 'dat.gui'
import {isNullOrUndefined} from 'util' // eslint-disable-line node/no-deprecated-api
import * as MapperProtos from '@mapperai/mapper-models'
import * as THREE from 'three'
import {ImageManager} from './image/ImageManager'
import {CalibratedImage} from './image/CalibratedImage'
import * as React from 'react'
import AnnotatorMenuView from './AnnotatorMenuView'
import {hexStringToHexadecimal} from '../util/Color'
import loadAnnotations from '../util/loadAnnotations'
import {
  AnnotatedSceneState,
  MousePosition,
  mousePositionToGLSpace,
  AnnotationType,
  AnnotationManager,
  Key,
  LayerId,
  LayerStatus,
  Layer,
  StatusWindowState,
  AnnotatedSceneController,
  THREEColorValue,
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
import {ReactUtil} from '@mapperai/mapper-saffron-sdk'
import {menuMargin, panelBorderRadius, statusWindowWidth} from './styleVars'
import {saveFileWithDialog} from '../util/file'
import {PreviousAnnotations} from './PreviousAnnotations'
import getLogger from 'util/Logger'

// TODO FIXME JOE tell webpack not to do synthetic default exports
// eslint-disable-next-line typescript/no-explicit-any
const dat: typeof Dat = (Dat as any).default as typeof Dat
import $ = require('jquery')
const log = getLogger(__filename)

const allLayers: LayerId[] = ['base1', 'base1hi', 'anot1']

// Groups of layers which are visible together. They are toggled on/off with the 'show/hide' command.
// - all visible
// - annotations hidden
// - everything but annotations hidden
const layerGroups: LayerId[][] = [
  allLayers,
  ['base1', 'base1hi'], // todo IMAGE_SCREENS layer
  ['anot1'],
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

  showPerfStats: boolean
}

interface AnnotatorProps extends WithStyles<typeof styles> {
  statusWindowState?: StatusWindowState
  uiMenuVisible?: boolean
  carPose?: MapperProtos.mapper.models.PoseMessage
  rendererSize?: Electron.Size
  camera?: THREE.Camera
  dataProviderFactory: DataProviderFactory
  isControlKeyPressed?: boolean
  isAltKeyPressed?: boolean
  isMetaKeyPressed?: boolean
  isShiftKeyPressed?: boolean
  isAddMarkerMode?: boolean
  isAddConnectionMode?: boolean
  isConnectLeftNeighborMode?: boolean
  isConnectRightNeighborMode?: boolean
  isConnectFrontNeighborMode?: boolean
  isJoinAnnotationMode?: boolean
  isCutAnnotationMode?: boolean
  isAddDeviceMode?: boolean
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
    'rendererSize',
    'camera',
    'isControlKeyPressed',
    'isAltKeyPressed',
    'isMetaKeyPressed',
    'isShiftKeyPressed',
    'isAddMarkerMode',
    'isAddConnectionMode',
    'isConnectLeftNeighborMode',
    'isConnectRightNeighborMode',
    'isConnectFrontNeighborMode',
    'isJoinAnnotationMode',
    'isCutAnnotationMode',
    'isAddDeviceMode',
    'isMouseDown',
    'isMouseDragging',
    'mousePosition',
    'activeAnnotation',
    'isTransformControlsAttached'
  )
)
export class Annotator extends React.Component<AnnotatorProps, AnnotatorState> {
  private raycasterImageScreen: THREE.Raycaster // used to highlight ImageScreens for selection
  imageManager: ImageManager
  private highlightedImageScreenBox: THREE.Mesh | null // image screen which is currently active in the Annotator UI
  private highlightedLightboxImage: CalibratedImage | null // image screen which is currently active in the Lightbox UI
  private lightboxImageRays: THREE.Line[] // rays that have been formed in 3D by clicking images in the lightbox
  private gui?: dat.GUI
  private statusWindowActions = new StatusWindowActions()
  private sceneActions = new AnnotatedSceneActions()
  private previouslySelectedAnnotations: PreviousAnnotations = new PreviousAnnotations()

  constructor(props: AnnotatorProps) {
    super(props)

    if (!isNullOrUndefined(config['output.trajectory.csv.path']))
      log.warn('Config option output.trajectory.csv.path has been removed.')

    if (!isNullOrUndefined(config['annotator.generate_voxels_on_point_load'])) {
      log.warn('Config option annotator.generate_voxels_on_point_load has been removed.')
    }

    if (config['startup.animation.fps']) {
      log.warn('Config option startup.animation.fps has been removed. Use startup.render.fps.')
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
      localStorage.getItem('maxPointDensity') || DefaultConfig['tile_manager.maximum_point_density'].toString()
    )
    const roadPointsIntensityScale = parseInt(DefaultConfig['tile_manager.road_points_intensity_scale'].toString())

    // TODO, cleanup: we don't need to read DefaultConfig here, instead we should let scene handle default values.
    const showPerfStatsCached = localStorage.getItem(`annotated-scene-${this.constructor.name}-showPerfStats`)
    const showPerfStats =
      (showPerfStatsCached && (JSON.parse(showPerfStatsCached) as boolean)) ||
      DefaultConfig['startup.show_stats_module']

    this.state = {
      background: hexStringToHexadecimal(config['startup.background_color'] || '#1d232a'),
      layerGroupIndex: defaultLayerGroupIndex,
      bezierScaleFactor: 6,

      imageScreenOpacity: parseFloat(config['image_manager.image.opacity']) || 0.5,

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

      showPerfStats,
    }
  }

  styleStats() {
    $('.annotated-scene-container .performanceStats').css({
      bottom: `${menuMargin}px`,
      left: `${statusWindowWidth + menuMargin * 2}px`,
    })
  }

  private datContainer: JQuery

  // Create a UI widget to adjust application settings on the fly.
  createControlsGui(): void {
    if (!isNullOrUndefined(config['startup.show_color_picker'])) {
      log.warn('config option startup.show_color_picker has been renamed to startup.show_control_panel')
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
      left: 0,
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

    /*
    gui
      .addColor(this.state, 'background')
      .name('Background')
      .onChange(() => {
        this.forceUpdate()
      })
      */

    /*
    gui
      .add(this.state, 'imageScreenOpacity', 0, 1)
      .name('Image Opacity')
      .onChange((value: number) => {
        this.imageManager.setOpacity(value)
      })
      */

    new AnnotatedSceneActions().setLockBoundaries(this.state.lockBoundaries)
    new AnnotatedSceneActions().setLockLanes(this.state.lockLanes)
    new AnnotatedSceneActions().setLockPolygons(this.state.lockPolygons)

    new AnnotatedSceneActions().setLockTrafficDevices(this.state.lockTrafficDevices)

    const folderLock = gui.addFolder('Lock Annotations')

    folderLock
      .add(this.state, 'lockBoundaries')
      .name('Boundaries')
      .onChange((value: boolean) => {
        if (value && this.state.annotationManager!.activeBoundaryAnnotation) {
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
          (this.state.annotationManager!.activeLaneAnnotation ||
            this.state.annotationManager!.activeConnectionAnnotation)
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
        if (value && this.state.annotationManager!.activePolygonAnnotation) {
          this.state.annotatedSceneController!.cleanTransformControls()
          this.uiEscapeSelection()
        }

        new AnnotatedSceneActions().setLockPolygons(value)
      })

    folderLock
      .add(this.state, 'lockTrafficDevices')
      .name('Traffic Devices')
      .onChange((value: boolean) => {
        if (value && this.state.annotationManager!.activeTrafficDeviceAnnotation) {
          this.state.annotatedSceneController!.cleanTransformControls()
          this.uiEscapeSelection()
        }

        new AnnotatedSceneActions().setLockTrafficDevices(value)
      })

    folderLock.open()

    const folderConnection = gui.addFolder('Connections')

    const bezierScaleFactor = this.state.bezierScaleFactor

    folderConnection
      .add({bezierScaleFactor}, 'bezierScaleFactor', 1, 50)
      .step(1)
      .name('Curvature')
      .onChange(bezierScaleFactor => {
        this.setState({bezierScaleFactor})
      })

    folderConnection.open()

    const tileFolder = gui.addFolder('Point Cloud')

    tileFolder
      .add({maxSuperTilesToLoad: this.state.maxSuperTilesToLoad}, 'maxSuperTilesToLoad', 1, 3000)
      .step(1)
      .name('Max tiles')
      .onChange(maxSuperTilesToLoad => this.setState({maxSuperTilesToLoad}))

    tileFolder
      .add({maxPointDensity: this.state.maxPointDensity}, 'maxPointDensity', 1, 1000)
      .step(1)
      .name('Max density')
      .onChange(maxPointDensity => this.setState({maxPointDensity}))

    tileFolder
      .add({roadPointsIntensityScale: this.state.roadPointsIntensityScale}, 'roadPointsIntensityScale', 1, 50)
      .step(1)
      .name('Road contrast')
      .onChange(roadPointsIntensityScale => this.setState({roadPointsIntensityScale}))

    tileFolder.open()

    const sceneOptions = gui.addFolder('Scene')

    sceneOptions
      .add({showPerfStats: this.state.showPerfStats}, 'showPerfStats')
      .name('Show stats')
      .onChange(showPerfStats => {
        // TODO cleanup: we don't need to keep our own state vars, just a config
        // object that we pass to the scene.
        this.setState({showPerfStats}, () => {
          this.setState({annotatedSceneConfig: this.makeAnnotatedSceneConfig()})
        })
      })

    sceneOptions.open()
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

    this.lightboxImageRays.forEach(r => new AnnotatedSceneActions().removeObjectFromScene(r))

    this.lightboxImageRays = []
  }

  private getLightboxImageRays = (callback: (lightboxImageRays: THREE.Line[]) => void): void => {
    callback(this.lightboxImageRays)
  }

  private checkForImageScreenSelection = (): void => {
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
    if (this.props.isCutAnnotationMode) return
    if (!this.state.isImageScreensVisible) return

    if (!this.imageManager.imageScreenMeshes.length) return this.unHighlightImageScreenBox()

    const mouse = mousePositionToGLSpace(this.props.mousePosition!, this.props.rendererSize!)

    this.raycasterImageScreen.setFromCamera(mouse, this.props.camera!)

    const intersects = this.raycasterImageScreen.intersectObjects(this.imageManager.imageScreenMeshes)

    // No screen intersected
    if (!intersects.length) {
      this.unHighlightImageScreenBox()
    } else {
      // Get intersected screen
      const first = intersects[0].object as THREE.Mesh
      const image = first.userData as CalibratedImage

      // Unhighlight previous screen
      if (
        (this.highlightedImageScreenBox && this.highlightedImageScreenBox.id !== first.id) ||
        (this.highlightedLightboxImage && this.highlightedLightboxImage !== image)
      )
        this.unHighlightImageScreenBox()

      // Highlight new screen
      this.highlightImageScreenBox(first)
    }
  }

  private clickImageScreenBox = (event: MouseEvent): void => {
    if (this.props.isMouseDragging) return
    if (!this.state.isImageScreensVisible) return

    switch (event.button) {
      // Left click released
      case 0: {
        if (!this.highlightedImageScreenBox) return

        const mouse = mousePositionToGLSpace(this.props.mousePosition!, this.props.rendererSize!)

        this.raycasterImageScreen.setFromCamera(mouse, this.props.camera!)

        const intersects = this.raycasterImageScreen.intersectObject(this.highlightedImageScreenBox)

        if (intersects.length) {
          const image = this.highlightedImageScreenBox.userData as CalibratedImage

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

        const mouse = mousePositionToGLSpace(this.props.mousePosition!, this.props.rendererSize!)

        this.raycasterImageScreen.setFromCamera(mouse, this.props.camera!)

        const intersects = this.raycasterImageScreen.intersectObjects(this.imageManager.imageScreenMeshes)

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
      if (this.imageManager.highlightImageInLightbox(image)) this.highlightedLightboxImage = image
      return
    }

    const material = imageScreenBox.material as THREE.MeshBasicMaterial

    material.opacity = 1.0
    this.state.annotatedSceneController!.shouldRender()
  }

  // Draw the box with default opacity like all the other boxes.
  private unHighlightImageScreenBox(): void {
    if (this.highlightedLightboxImage) {
      if (this.imageManager.unhighlightImageInLightbox(this.highlightedLightboxImage))
        this.highlightedLightboxImage = null
    }

    if (!this.highlightedImageScreenBox) return

    const material = this.highlightedImageScreenBox.material as THREE.MeshBasicMaterial

    material.opacity = this.state.imageScreenOpacity
    this.highlightedImageScreenBox = null
    this.state.annotatedSceneController!.shouldRender()
  }

  mapKey(key: Key, fn: (e?: KeyboardEvent | KeyboardEventHighlights) => void): void {
    this.state.annotatedSceneController!.mapKey(key, fn)
  }

  mapKeyDown(key: Key, fn: (e?: KeyboardEvent | KeyboardEventHighlights) => void): void {
    this.state.annotatedSceneController!.mapKeyDown(key, fn)
  }

  mapKeyUp(key: Key, fn: (e?: KeyboardEvent | KeyboardEventHighlights) => void): void {
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
    this.mapKey('b', () => this.uiAddAnnotation(AnnotationType.BOUNDARY))
    this.mapKey('B', () => this.uiAddAnnotation(AnnotationType.BOUNDARY))
    // this.mapKey('', () => this.state.annotatedSceneController!.focusOnPointCloud()) // TODO fix https://github.com/Signafy/mapper-annotator-issues/issues/108
    this.mapKey('d', () => this.state.annotationManager!.deleteLastMarker())
    this.mapKey('F', () => this.uiReverseLaneDirection())
    this.mapKey('h', () => this.uiToggleLayerVisibility())
    this.mapKey('n', () => this.uiAddAnnotation(AnnotationType.LANE))
    this.mapKey('N', () => this.uiAddAnnotation(AnnotationType.LANE))
    this.mapKey('R', () => this.state.annotatedSceneController!.resetTiltAndCompass())
    this.mapKey('p', () => this.uiAddAnnotation(AnnotationType.POLYGON))
    this.mapKey('P', () => this.uiAddAnnotation(AnnotationType.POLYGON))
    this.mapKey('t', () => this.uiAddAnnotation(AnnotationType.TRAFFIC_DEVICE))
    this.mapKey('T', () => this.uiAddAnnotation(AnnotationType.TRAFFIC_DEVICE))
    this.mapKey('V', () => this.state.annotatedSceneController!.toggleCameraType())
    this.mapKey('X', () => this.state.annotationManager!.cycleTransformControlModes())
    this.keyHeld('a', held => actions.setAddMarkerMode(held))
    this.keyHeld('A', held => actions.setAddMarkerMode(held)) // shift-a
    this.keyHeld('å', held => actions.setAddMarkerMode(held)) // alt-a
    this.keyHeld('c', held => actions.setAddConnectionMode(held))
    this.keyHeld('f', held => actions.setConnectFrontNeighborMode(held))
    this.keyHeld('j', held => actions.setJoinAnnotationMode(held))
    this.keyHeld('x', held => actions.setCutAnnotationMode(held))
    this.keyHeld('l', held => actions.setConnectLeftNeighborMode(held))
    this.keyHeld('q', held => actions.setAddDeviceMode(held))
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
    } else if (this.state.annotationManager!.activeAnnotation) {
      this.state.annotationManager!.unsetActiveAnnotation()
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

  uiDeleteActiveAnnotation(): void {
    const activeAnnotation = this.state.annotationManager!.activeAnnotation
    if (activeAnnotation === null) return

    // Delete annotation from scene
    if (this.state.annotationManager!.deleteAnnotation(activeAnnotation)) {
      log.info('Deleted selected annotation')
      this.state.annotationManager!.hideTransform()
    }
  }

  // Create an annotation, add it to the scene, and activate (highlight) it.
  uiAddAnnotation(annotationType: AnnotationType): void {
    if (
      this.state.annotationManager!.createAndAddAnnotation(
        annotationType,
        this.props.isShiftKeyPressed ? this.previouslySelectedAnnotations.getByType(annotationType) : null,
        true
      )[0]
    ) {
      this.sceneActions.setLayerStatus(Layer.anot1, LayerStatus.Visible)
      log.info(`Added new ${AnnotationType[annotationType]} annotation`)
      this.state.annotationManager!.hideTransform()
    } else {
      throw new Error('unable to add annotation of type ' + AnnotationType[annotationType])
    }
  }

  private saveAnnotationsJson = () => {
    const json = JSON.stringify(this.state.annotationManager!.annotationsToJSON())
    const sessionId = this.state.annotatedSceneController!.dataProvider.sessionId

    saveFileWithDialog(json, 'application/json', `annotations${sessionId ? '-' + sessionId : ''}.json`)
  }

  /**
   * 	Save lane waypoints (only) to KML.
   */
  private saveAnnotationsKML = () => {
    const {utmCoordinateSystem} = this.state.annotatedSceneController!.state

    function annotationToGeoPoints(a: Annotation): Array<THREE.Vector3> {
      return a.outline.map(m => utmCoordinateSystem!.threeJsToLngLatAlt(m.position))
    }

    // Get all the points and convert to lat lon
    const kml = new SimpleKML()

    this.state.annotationManager!.boundaryAnnotations.forEach(a => kml.addPath(annotationToGeoPoints(a)))
    this.state.annotationManager!.laneAnnotations.forEach(a => kml.addPolygon(annotationToGeoPoints(a)))
    this.state.annotationManager!.connectionAnnotations.forEach(a => kml.addPolygon(annotationToGeoPoints(a)))
    this.state.annotationManager!.polygonAnnotations.forEach(a => kml.addPolygon(annotationToGeoPoints(a)))
    this.state.annotationManager!.trafficDeviceAnnotations.forEach(a => kml.addPoints(annotationToGeoPoints(a)))

    const sessionId = this.state.annotatedSceneController!.dataProvider.sessionId

    saveFileWithDialog(
      kml.toString(),
      'application/vnd.google-earth.kml+xml',
      `annotations${sessionId ? '-' + sessionId : ''}.kml`
    )
  }

  private uiReverseLaneDirection(): void {
    const active = this.state.annotationManager!.activeAnnotation
    if (!active) return

    log.info('Reverse lane direction.')

    active.reverseMarkers()
  }

  // TODO JOE handle DOM events the React way {{

  private bind(): void {
    const menuControlElement = $('#menu_control')

    if (menuControlElement.length) menuControlElement[0].style.visibility = 'visible'
    else log.warn('missing element menu_control')
  }

  unbind() {
    $('#menu_control').off()
  }

  // }}

  // TODO JOE this all will be controlled by React state + markup  at some point {{

  // Toggle the visibility of data by cycling through the groups defined in layerGroups.
  private uiToggleLayerVisibility(): void {
    if (this.props.isMetaKeyPressed) return

    let {layerGroupIndex} = this.state

    layerGroupIndex++

    if (!layerGroups[layerGroupIndex]) layerGroupIndex = defaultLayerGroupIndex

    allLayers.forEach(layerId => {
      const status = layerGroups[layerGroupIndex].find(id => id === layerId) ? LayerStatus.Visible : LayerStatus.Hidden
      this.state.annotatedSceneController!.setLayerStatus(layerId, status)
    })

    this.setState({layerGroupIndex})
  }

  // After a marker (or set of markers) has been moved in the UI, see if it is near another
  // marker and decide whether it should snap to the same position.
  private snapMarker = (transformedObjects: ReadonlyArray<THREE.Object3D>): void => {
    if (this.props.isControlKeyPressed) return // Control disables the feature

    if (!(transformedObjects.length && transformedObjects[0] instanceof Marker)) return

    // Get the selected marker we just transformed.
    // Here we're relying on the fact that the first item in the array is the
    // marker we explicitly transformed (see the `moveableMarkers` array in
    // AnnotationManager.checkForActiveMarker()), while the others will move along with it.
    const transformedMarkers = [...transformedObjects] as Marker[]
    const primaryMarker = head(transformedMarkers)!

    const transformedAnnotations = uniq(transformedMarkers.map(m => m.annotation))

    // Get all markers in view which are not part of the annotations being manipulated.
    const frustum = new THREE.Frustum()
    const projScreenMatrix = new THREE.Matrix4()
    const {camera} = this.props
    projScreenMatrix.multiplyMatrices(camera!.projectionMatrix, camera!.matrixWorldInverse)
    frustum.setFromMatrix(projScreenMatrix)
    const markersInView = this.getMarkersInFrustum(frustum, flatten(transformedAnnotations.map(a => a.markers)))

    let closestMarker: Marker | null = null
    let smallestDistance: number = Infinity
    const snapThreshold = 0.5

    // See if any markers are within the snap threshold
    markersInView.forEach(marker => {
      const distance = primaryMarker.position.distanceTo(marker.position)

      if (distance < smallestDistance) {
        smallestDistance = distance
        closestMarker = marker
      }
    })

    const shouldSnap = smallestDistance <= snapThreshold
    if (shouldSnap && closestMarker) {
      const snapDirection = closestMarker!.position.clone().sub(primaryMarker.position)

      // Apply the same offset to all selected markers.
      transformedMarkers.forEach(m => m.position.add(snapDirection))

      transformedAnnotations.forEach(a => a.updateVisualization())
      this.state.annotatedSceneController!.updateTransformControls()
      this.state.annotatedSceneController!.shouldRender()
    }
  }

  getAnnotationsInFrustum(frustum: THREE.Frustum) {
    return this.state.annotationManager!.allAnnotations.filter(annotation => {
      const object = annotation.renderingObject

      let hasMeshInView = false

      object.traverse(object => {
        if (hasMeshInView) return

        if (hasGeometry(object) && frustum.intersectsObject(object)) hasMeshInView = true
      })

      return hasMeshInView
    })
  }

  getMarkersInFrustum(frustum: THREE.Frustum, markersToExclude: Marker[]) {
    const annotationsInView = this.getAnnotationsInFrustum(frustum)

    return flatten(
      annotationsInView.map(annotation =>
        annotation.markers.filter(marker => frustum.intersectsObject(marker) && !markersToExclude.includes(marker))
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
      'startup.show_stats_module': this.state.showPerfStats,
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
      'annotator.area_of_interest.enable': true,
    } as IAnnotatedSceneConfig
  }

  private onPublishClick = () => {
    this.state.annotationManager!.publish().then()
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
      annotatedSceneConfig: this.makeAnnotatedSceneConfig(),
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
      this.state.annotatedSceneController && this.state.annotatedSceneController.cleanup()
    } catch (err) {
      log.error('annotatedSceneController.cleanup() failed', err)
    }
    // TODO JOE  - remove event listeners  - clean up child windows
  }

  componentDidUpdate(oldProps: AnnotatorProps, oldState: AnnotatorState): void {
    if (!oldState.annotationManager && this.state.annotationManager) {
      if (this.state.annotationManager) {
        this.createControlsGui()
        this.styleStats()
      } else {
        this.destroyControlsGui()
      }
    }

    if (this.props.activeAnnotation && oldProps.activeAnnotation !== this.props.activeAnnotation)
      this.previouslySelectedAnnotations.setByType(this.props.activeAnnotation)

    if (oldState.isImageScreensVisible !== this.state.isImageScreensVisible) {
      if (this.state.isImageScreensVisible) this.imageManager.showImageScreens()
      else this.imageManager.hideImageScreens()
    }

    // TODO simplify: instead of storing individual properties in local storage,
    // just store the config object that we'll be passing into the scene.

    if (oldState.maxSuperTilesToLoad !== this.state.maxSuperTilesToLoad) {
      localStorage.setItem('maxSuperTilesToLoad', this.state.maxSuperTilesToLoad.toString())
    }

    if (oldState.maxPointDensity !== this.state.maxPointDensity) {
      localStorage.setItem('maxPointDensity', this.state.maxPointDensity.toString())
    }

    if (oldState.showPerfStats !== this.state.showPerfStats) {
      localStorage.setItem('showPerfStats', this.state.showPerfStats.toString())

      // FIXME temporary hack, because we don't know when in the future the stats widget is ready.
      setTimeout(() => this.styleStats())
    }
  }

  private attachScene = () => {
    const annotatedSceneController = this.state.annotatedSceneController!
    const {utmCoordinateSystem} = annotatedSceneController.state
    const {channel} = annotatedSceneController

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

    channel!.on(Events.TRANSFORM_UPDATE, this.snapMarker)

    // UI updates
    // TODO JOE move UI logic to React/JSX, and get state from Redux

    channel!.once(Events.ANNOTATED_SCENE_READY, async () => {
      this.addImageScreenLayer()

      const annotationsPath = config['startup.annotations_path']

      if (annotationsPath) {
        await loadAnnotations.call(this, annotationsPath, this.state.annotatedSceneController)
      }
    })

    this.bind()
    this.setKeys()
  }

  /* eslint-disable typescript/no-explicit-any */
  private setAnnotatedSceneRef = (ref: any) => {
    this.setState(
      {
        annotatedSceneController: ref as AnnotatedSceneController,
      },
      this.attachScene
    )
  }
  /* eslint-enable typescript/no-explicit-any */

  // TODO JOE don't get refs directly, proxy functionality through AnnotatedSceneController
  private setAnnotationManagerRef = (ref: AnnotationManager) => {
    ref && this.setState({annotationManager: ref})
    this.props.getAnnotationManagerRef && this.props.getAnnotationManagerRef(ref)
  }

  render(): JSX.Element {
    const {annotatedSceneConfig} = this.state
    const {dataProviderFactory, classes} = this.props

    return !dataProviderFactory || !annotatedSceneConfig ? (
      <div />
    ) : (
      <React.Fragment>
        <div id="menu_control" className={classes.menuControl}>
          <Button
            variant="contained"
            color="primary"
            onClick={this.onPublishClick}
            classes={{root: classes.publishButton!}}
          >
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
          selectedAnnotation={this.props.activeAnnotation}
          onSaveAnnotationsJson={this.saveAnnotationsJson}
          onSaveAnnotationsKML={this.saveAnnotationsKML}
          annotator={this}
        />
        <AnnotatedSceneController
          sceneRef={this.setAnnotatedSceneRef}
          backgroundColor={this.state.background}
          bezierScaleFactor={this.state.bezierScaleFactor}
          roadPointsIntensityScale={this.state.roadPointsIntensityScale}
          annotationManagerRef={this.setAnnotationManagerRef}
          dataProviderFactory={dataProviderFactory}
          config={annotatedSceneConfig}
          classes={{root: classes.annotatedScene}}
        />
      </React.Fragment>
    )
  }
}

export default withStyles(styles)(Annotator)

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

// eslint-disable-next-line typescript/explicit-function-return-type
function styles(_theme: Theme) {
  return createStyles({
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
        height: '100%',
      },

      '& .hidden': {
        display: 'none',
      },

      '&, & *, & *::after, & *::before': {
        boxSizing: 'border-box',
      },
    },

    menuControl: {
      backgroundColor: 'transparent',
      position: 'absolute',
      zIndex: 1,
      top: menuMargin,
      right: menuMargin,
      visibility: 'hidden',
      height: '32px',
      display: 'flex',
      justifyContent: 'space-between',

      '& > *': {
        width: `calc(${100 / numberOfButtons}% - ${menuMargin / 2}px)`,
        '& span': {
          fontSize: '1.5rem',
          lineHeight: '1.5rem',
        },
        '&$publishButton': {
          '& span': {
            fontSize: '1rem',
            lineHeight: '1rem',
          },
        },
      },
    },

    publishButton: {},

    '@global': {
      // this is inside of AnnotatedSceneController
      '#status_window': {
        position: 'absolute',
        left: menuMargin,
        bottom: menuMargin,
        backgroundColor: 'rgba(255, 255, 255, 0.5)',
        padding: '5px',
        zIndex: 3,
        borderRadius: panelBorderRadius,
        width: statusWindowWidth,
      },
    },
  })
}
