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
import {flatten, head, uniq} from 'lodash'
import $ = require('jquery')
import {withStyles, createStyles, Theme, WithStyles} from '@material-ui/core'
import {SimpleKML} from '../util/KmlUtils'
import {isNullOrUndefined} from 'util' // eslint-disable-line node/no-deprecated-api
import * as MapperProtos from '@mapperai/mapper-models'
import * as THREE from 'three'
import * as React from 'react'
import AnnotatorMenuView, {AnnotatorMenuViewInner} from './AnnotatorMenuView'
import {hexStringToHexadecimal} from '../util/Color'
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
  AnnotatedSceneControllerInner,
  THREEColorValue,
  toProps,
  Events,
  AnnotatedSceneActions,
  KeyboardEventHighlights,
  IAnnotatedSceneConfig,
  Marker,
  Annotation,
  DefaultConfig,
  SceneEmitter,
  typedConnect,
  OutputFormat,
  AnnotatedSceneConfig,
} from '@mapperai/mapper-annotated-scene'
import {DataProviderFactory} from '@mapperai/mapper-annotated-scene/dist/modules/tiles/DataProvider'
import {menuMargin, panelBorderRadius, statusWindowWidth} from './styleVars'
import {saveFileWithDialog} from '../util/file'
import {PreviousAnnotations} from './PreviousAnnotations'
import {ImageManager, ImageClick, LightboxImage, SequentialAnnotation} from '@mapperai/mapper-annotated-scene'
import {
  ImageContext,
  ContextState as ImageContextState,
  initialImageContextValue,
} from './annotator-image-lightbox/ImageContext'
import getLogger from '../util/Logger'
import {GuiState} from './components/DatGui'
import DatGuiContext, {ContextState as GuiContextState} from './components/DatGuiContext'
import {isUuid} from '../util/uuid'
import {parseLocationString} from '../util/coordinate'

// TODO FIXME JOE tell webpack not to do synthetic default exports
// eslint-disable-next-line typescript/no-explicit-any
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

interface Size {
  height: number
  width: number
}

/**
 * The Annotator class is in charge of rendering the 3d Scene that includes the point clouds
 * and the annotations. It also handles the mouse and keyboard events needed to select
 * and modify the annotations.
 */

interface AnnotatorState {
  background: THREEColorValue
  layerGroupIndex: number

  annotationManager: AnnotationManager | null
  annotatedSceneController: AnnotatedSceneControllerInner | null

  annotatedSceneConfig?: IAnnotatedSceneConfig
}

interface AnnotatorProps extends WithStyles<typeof styles> {
  statusWindowState?: StatusWindowState
  uiMenuVisible?: boolean
  carPose?: MapperProtos.mapper.models.PoseMessage
  rendererSize?: Size
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
  transformedObjects?: THREE.Object3D[]
}

@typedConnect(
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
    'isTransformControlsAttached',
    'transformedObjects'
  )
)
export class Annotator extends React.Component<AnnotatorProps, AnnotatorState> {
  private imageManagerRef = React.createRef<ImageManager>()
  private raycasterImageScreen = new THREE.Raycaster() // used to highlight ImageScreens for selection
  private highlightedImageScreenBox: THREE.Mesh | null = null // image screen which is currently active in the Annotator UI
  private highlightedLightboxImage: LightboxImage | null = null // image screen which is currently active in the Lightbox UI
  private lightboxImageRays: THREE.Line[] = [] // rays that have been formed in 3D by clicking images in the lightbox
  private sceneActions = new AnnotatedSceneActions()
  private previouslySelectedAnnotations: PreviousAnnotations = new PreviousAnnotations()
  private guiState: GuiState
  private menuRef = React.createRef<any>()

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

    const maxSuperTilesToLoad = parseInt(
      localStorage.getItem('maxSuperTilesToLoad') ||
        DefaultConfig['tile_manager.maximum_super_tiles_to_load'].toString()
    )
    const maxPointDensity = parseInt(
      localStorage.getItem('maxPointDensity') || DefaultConfig['tile_manager.maximum_point_density'].toString()
    )
    const roadPointsIntensityScale = parseInt(
      localStorage.getItem('roadPointsIntensityScale') ||
        DefaultConfig['tile_manager.road_points_intensity_scale'].toString()
    )

    // TODO, cleanup: we don't need to read DefaultConfig here, instead we should let scene handle default values.
    const showPerfStatsCached = localStorage.getItem(`annotated-scene-${this.constructor.name}-showPerfStats`)
    const showPerfStats =
      (showPerfStatsCached && (JSON.parse(showPerfStatsCached) as boolean)) ||
      DefaultConfig['startup.show_stats_module']

    this.state = {
      background: hexStringToHexadecimal(config['startup.background_color'] || '#1d232a'),
      layerGroupIndex: defaultLayerGroupIndex,

      annotationManager: null,
      annotatedSceneController: null,
    }

    this.guiState = {
      lockBoundaries: false,
      lockLaneSegments: false,
      lockPolygons: false,
      lockTrafficDevices: false,
      bezierScaleFactor: 6,
      maxSuperTilesToLoad,
      maxPointDensity,
      roadPointsIntensityScale,
      imageScreenOpacity: parseFloat(config['image_manager.image.opacity']) || 0.5,
      showPerfStats,
    }
  }

  private get menu() {
    if (!this.menuRef.current) return null
    return (this.menuRef.current as any).getWrappedInstance() as AnnotatorMenuViewInner
  }

  styleStats() {
    $('.annotated-scene-container .performanceStats').css({
      bottom: `${menuMargin}px`,
      left: `${statusWindowWidth + menuMargin * 2}px`,
    })
  }

  // When a lightbox ray is created, add it to the scene.
  // On null, remove all rays.
  private onLightboxImageRay = (ray: THREE.Line): void => {
    // Accumulate rays while shift is pressed, otherwise clear old ones.
    if (!this.props.isShiftKeyPressed) this.clearLightboxImageRays()

    this.lightboxImageRays.push(ray)
    new AnnotatedSceneActions().addObjectToScene(ray)
  }

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

    const imageManager = this.imageManager
    if (!(imageManager && imageManager.isVisible && imageManager.imageScreenMeshes.length))
      return this.unHighlightImageScreenBox()

    const mouse = mousePositionToGLSpace(this.props.mousePosition!, this.props.rendererSize!)

    this.raycasterImageScreen.setFromCamera(mouse, this.props.camera!)

    const intersects = this.raycasterImageScreen.intersectObjects(imageManager.imageScreenMeshes)

    // No screen intersected
    if (!intersects.length) {
      this.unHighlightImageScreenBox()
    } else {
      // Get intersected screen
      const first = intersects[0].object as THREE.Mesh
      const image = first.userData as LightboxImage

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
    const imageManager = this.imageManager
    if (!(imageManager && imageManager.isVisible)) return

    switch (event.button) {
      // Left click released
      case 0: {
        if (!this.highlightedImageScreenBox) return

        const mouse = mousePositionToGLSpace(this.props.mousePosition!, this.props.rendererSize!)

        this.raycasterImageScreen.setFromCamera(mouse, this.props.camera!)

        const intersects = this.raycasterImageScreen.intersectObject(this.highlightedImageScreenBox)

        if (intersects.length) {
          const image = this.highlightedImageScreenBox.userData as LightboxImage

          this.unHighlightImageScreenBox()
          imageManager.addImageToLightbox(image)
        }

        break
      }

      // Middle click released
      case 1: {
        // no actions
        break
      }

      // TODO Don't fire on mouse-move/mouse-up; that is if OrbitControls is running.
      // Right click released
      case 2: {
        if (this.props.isShiftKeyPressed) return

        const mouse = mousePositionToGLSpace(this.props.mousePosition!, this.props.rendererSize!)

        this.raycasterImageScreen.setFromCamera(mouse, this.props.camera!)

        const intersects = this.raycasterImageScreen.intersectObjects(imageManager.imageScreenMeshes)

        // Get intersected screen
        if (intersects.length) {
          const first = intersects[0].object as THREE.Mesh
          const material = first.material as THREE.MeshBasicMaterial

          material.opacity = this.guiState.imageScreenOpacity || 0.8

          const screen = imageManager.getImageScreen(first)

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

    const imageManager = this.imageManager
    if (!imageManager) return

    this.highlightedImageScreenBox = imageScreenBox

    const screen = imageManager.getImageScreen(imageScreenBox)

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

    const image = imageScreenBox.userData as LightboxImage

    // If it's already loaded in the lightbox, highlight it in the lightbox.
    // Don't allow it to be loaded a second time.
    if (imageManager.loadedImageDetails.has(image)) {
      if (imageManager.highlightImageInLightbox(image)) this.highlightedLightboxImage = image
      return
    }

    const material = imageScreenBox.material as THREE.MeshBasicMaterial

    material.opacity = 1.0
    this.state.annotatedSceneController!.shouldRender()
  }

  // Draw the box with default opacity like all the other boxes.
  private unHighlightImageScreenBox(): void {
    if (this.highlightedLightboxImage) {
      if (this.imageManager && this.imageManager.unhighlightImageInLightbox(this.highlightedLightboxImage))
        this.highlightedLightboxImage = null
    }

    if (!this.highlightedImageScreenBox) return

    const material = this.highlightedImageScreenBox.material as THREE.MeshBasicMaterial

    material.opacity = this.guiState.imageScreenOpacity || 0.8
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
    this.mapKey('b', () => this.uiAddAnnotation(AnnotationType.Boundary))
    this.mapKey('B', () => this.uiAddAnnotation(AnnotationType.Boundary))
    // this.mapKey('', () => this.state.annotatedSceneController!.focusOnPointCloud()) // TODO fix https://github.com/Signafy/mapper-annotator-issues/issues/108
    this.mapKey('d', () => this.state.annotationManager!.deleteLastMarker())
    this.mapKey('F', () => this.uiReverseLaneDirection())
    this.mapKey('h', () => this.uiToggleLayerVisibility())
    this.mapKey('n', () => this.uiAddAnnotation(AnnotationType.LaneSegment))
    this.mapKey('N', () => this.uiAddAnnotation(AnnotationType.LaneSegment))
    this.mapKey('R', () => this.state.annotatedSceneController!.resetTiltAndCompass())
    this.mapKey('p', () => this.uiAddAnnotation(AnnotationType.Polygon))
    this.mapKey('P', () => this.uiAddAnnotation(AnnotationType.Polygon))
    this.mapKey('t', () => this.uiAddAnnotation(AnnotationType.TrafficDevice))
    this.mapKey('T', () => this.uiAddAnnotation(AnnotationType.TrafficDevice))
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
      // switch to the properties tab when we've added a new annotation
      this.menu && this.menu.setTab('Properties')
    } else {
      throw new Error('unable to add annotation of type ' + AnnotationType[annotationType])
    }
  }

  private saveAnnotationsJson = () => this.saveAnnotations(OutputFormat.UTM)
  private saveAnnotationsGeoJSON = () => this.saveAnnotations(OutputFormat.LLA)

  private saveAnnotations(format: OutputFormat): void {
    const json = JSON.stringify(this.state.annotationManager!.annotationsToJSON(format))
    const sessionId = this.state.annotatedSceneController!.dataProvider.sessionId
    saveFileWithDialog(
      json,
      'application/json',
      `annotations${sessionId ? '-' + sessionId : ''}-${OutputFormat[format]}.json`
    )
  }

  // Low-fidelity export as KML.
  private saveAnnotationsKML = () => {
    const {utmCoordinateSystem} = this.state.annotatedSceneController!.state

    function isArrayArray(a: any): a is THREE.Vector3[][] {
      return Array.isArray(a) && a[0] && Array.isArray(a[0])
    }

    function annotationToGeoPoints(a: Annotation): Array<THREE.Vector3> {
      const contour = a.geojsonContour

      if (!Array.isArray(contour)) {
        return [utmCoordinateSystem!.threeJsToLngLatAlt(contour)]
      } else if (isArrayArray(contour)) {
        log.error('Vector3[][]: This case is not yet supported, and we have not used it in practice yet.')
        return [new THREE.Vector3()]
      } else {
        return contour.map(v => utmCoordinateSystem!.threeJsToLngLatAlt(v))
      }
    }

    // Get all the points and convert to lat lon
    const kml = new SimpleKML()

    this.state.annotationManager!.boundaryAnnotations.forEach(a => kml.addPath(annotationToGeoPoints(a)))
    this.state.annotationManager!.laneSegmentAnnotations.forEach(a => kml.addPolygon(annotationToGeoPoints(a)))
    this.state.annotationManager!.polygonAnnotations.forEach(a => kml.addPolygon(annotationToGeoPoints(a)))
    this.state.annotationManager!.trafficDeviceAnnotations.forEach(a => kml.addPoints(annotationToGeoPoints(a)))

    const sessionId = this.state.annotatedSceneController!.dataProvider.sessionId

    saveFileWithDialog(
      kml.toString(),
      'application/vnd.google-earth.kml+xml',
      `annotations${sessionId ? '-' + sessionId : ''}.kml`
    )
  }

  // Move the camera to the specified location, either an annotation or a global coordinate.
  jumpTo(location: string): boolean {
    if (isUuid(location)) return this.state.annotatedSceneController!.jumpToAnnotation(location)

    const locationVector = parseLocationString(location)
    if (locationVector) return this.state.annotatedSceneController!.jumpToLocation(locationVector)

    return false
  }

  private uiReverseLaneDirection(): void {
    const active = this.state.annotationManager!.activeAnnotation
    if (!(active && active instanceof SequentialAnnotation)) return

    log.info('Reverse lane direction.')

    active.reverseMarkers()
  }

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
  private snapMarker = (): void => {
    const transformedObjects = this.props.transformedObjects!

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
      'startup.show_stats_module': this.guiState.showPerfStats,
      'tile_manager.maximum_points_to_load': 20000000,
      'tile_manager.road_points_intensity_scale': this.guiState.roadPointsIntensityScale,
      'tile_manager.maximum_point_density': this.guiState.maxPointDensity,
      'tile_manager.maximum_super_tiles_to_load': this.guiState.maxSuperTilesToLoad,
      'tile_manager.initial_super_tiles_to_load': 1,
      'tile_manager.super_tile_scale': [24, 24, 24],
      'annotator.area_of_interest.size': [60, 20, 60],
      'tile_manager.stats_display.enable': true,
      'status_window.external_location_links.enable': true,
      'annotator.draw_bounding_box': false,
      'annotator.area_of_interest.enable': true,
    } as IAnnotatedSceneConfig
  }

  private attachScene = () => {
    const annotatedSceneController = this.state.annotatedSceneController!
    const {channel} = annotatedSceneController

    // events from ImageManager
    channel!.on(Events.KEYDOWN, annotatedSceneController.onKeyDown)
    channel!.on(Events.KEYUP, annotatedSceneController.onKeyUp)

    // IDEA JOE maybe we need a separate LightBoxRayManager? Or at least move to ImageManager
    channel!.on(Events.LIGHT_BOX_IMAGE_RAY_UPDATE, this.onLightboxImageRay)
    channel!.on(Events.GET_LIGHTBOX_IMAGE_RAYS, this.getLightboxImageRays)
    channel!.on(Events.CLEAR_LIGHTBOX_IMAGE_RAYS, this.clearLightboxImageRays)

    channel!.on(Events.TRANSFORM_UPDATE, this.snapMarker)

    // UI updates
    // TODO JOE move UI logic to React/JSX, and get state from Redux

    channel!.once(Events.ANNOTATED_SCENE_READY, async () => {
      const annotationsPath = config['startup.annotations_path']

      if (annotationsPath) {
        if (isElectron()) {
          // TODO ./loadAnnotations needs to be compiled as a separate bundle
          // called "loadAnnotations" placed next to the annotator-ui bundle for
          // this to work in Electron, if we want it.
          const loadAnnotations = require(['./loadAnnotations'][0])
          await loadAnnotations.call(this, annotationsPath, this.state.annotatedSceneController)
        } else {
          console.error('Loading annotations from a file only works in Electron')
        }
      }
    })

    this.setKeys()
  }

  /* eslint-disable typescript/no-explicit-any */
  private setAnnotatedSceneRef = (ref: AnnotatedSceneControllerInner) => {
    this.setState({annotatedSceneController: ref}, this.attachScene)
  }
  /* eslint-enable typescript/no-explicit-any */

  // TODO JOE don't get refs directly, proxy functionality through AnnotatedSceneController
  private setAnnotationManagerRef = (ref: AnnotationManager) => {
    ref && this.setState({annotationManager: ref})
    this.props.getAnnotationManagerRef && this.props.getAnnotationManagerRef(ref)
  }

  private onImageMouseEnter = (uuid: string) => {
    this.state.annotatedSceneController!.channel.emit(Events.IMAGE_EDIT_STATE, {
      uuid,
      active: true,
    })
  }

  private onImageMouseLeave = (uuid: string) => {
    this.state.annotatedSceneController!.channel.emit(Events.IMAGE_EDIT_STATE, {
      uuid,
      active: false,
    })
  }

  // Notify listeners of the coordinates of a click on an image.
  private onImageMouseUp = (click: ImageClick): void => {
    this.state.annotatedSceneController!.channel.emit(Events.IMAGE_CLICK, click)
  }

  private lockLaneSegments = () => {
    if (this.guiState.lockLaneSegments && this.state.annotationManager!.activeLaneSegmentAnnotation) {
      this.state.annotatedSceneController!.cleanTransformControls()
      this.uiEscapeSelection()
    }

    new AnnotatedSceneActions().setLockLaneSegments(this.guiState.lockLaneSegments)
  }

  private lockBoundaries = () => {
    if (this.guiState.lockBoundaries && this.state.annotationManager!.activeBoundaryAnnotation) {
      this.state.annotatedSceneController!.cleanTransformControls()
      this.uiEscapeSelection()
    }

    new AnnotatedSceneActions().setLockBoundaries(this.guiState.lockBoundaries)
  }

  private lockPolygons = () => {
    if (this.guiState.lockPolygons && this.state.annotationManager!.activePolygonAnnotation) {
      this.state.annotatedSceneController!.cleanTransformControls()
      this.uiEscapeSelection()
    }

    new AnnotatedSceneActions().setLockPolygons(this.guiState.lockPolygons)
  }

  private lockTrafficDevices = () => {
    if (this.guiState.lockTrafficDevices && this.state.annotationManager!.activeTrafficDeviceAnnotation) {
      this.state.annotatedSceneController!.cleanTransformControls()
      this.uiEscapeSelection()
    }

    new AnnotatedSceneActions().setLockTrafficDevices(this.guiState.lockTrafficDevices)
  }

  // TODO simplify: instead of storing individual properties in local storage,
  // just store the config object that we'll be passing into the scene.

  private updateMaxSuperTilesToLoad = () => {
    localStorage.setItem('maxSuperTilesToLoad', this.guiState.maxSuperTilesToLoad.toString())
    this.setState({annotatedSceneConfig: this.makeAnnotatedSceneConfig()})
  }

  private updateMaxPointDensity = () => {
    localStorage.setItem('maxPointDensity', this.guiState.maxPointDensity.toString())
    this.setState({annotatedSceneConfig: this.makeAnnotatedSceneConfig()})
  }

  private updateRoadPointsIntensityScale = () => {
    localStorage.setItem('roadPointsIntensityScale', this.guiState.roadPointsIntensityScale.toString())
    this.setState({annotatedSceneConfig: this.makeAnnotatedSceneConfig()})
  }

  private setImageScreenOpacity = () => {
    this.imageManager && this.imageManager.setOpacity(this.guiState.imageScreenOpacity)
    this.forceUpdate()
  }

  // TODO cleanup: we don't need to keep our own showPerfStats state var, just a
  // config object that we update and pass to the scene.
  private showPerfStats = () => {
    localStorage.setItem('showPerfStats', this.guiState.showPerfStats.toString())

    this.setState({annotatedSceneConfig: this.makeAnnotatedSceneConfig()}, () => {
      // FIXME temporary hack, because we don't know when in the future the
      // stats widget is ready.
      setTimeout(() => this.styleStats())
    })
  }

  private guiHandlers = new Map<keyof GuiState, () => void>([
    ['lockBoundaries', this.lockBoundaries],
    ['lockLaneSegments', this.lockLaneSegments],
    ['lockPolygons', this.lockPolygons],
    ['lockTrafficDevices', this.lockTrafficDevices],
    ['bezierScaleFactor', () => this.forceUpdate()], // TODO bezier factor will be moved to Inspector
    ['maxSuperTilesToLoad', this.updateMaxSuperTilesToLoad], // TODO update scene config
    ['maxPointDensity', this.updateMaxPointDensity], // TODO update scene config
    ['roadPointsIntensityScale', this.updateRoadPointsIntensityScale], // TODO update scene config
    ['imageScreenOpacity', this.setImageScreenOpacity],
    ['showPerfStats', this.showPerfStats],
  ])

  private onDatGuiUpdate = (prop: keyof GuiState, guiState: GuiState) => {
    this.guiState = guiState
    this.guiHandlers.get(prop)!()
  }

  private configWithDefaults(): AnnotatedSceneConfig {
    return {
      ...DefaultConfig,
      ...(this.state.annotatedSceneConfig || {}),
    }
  }

  componentDidMount(): void {
    document.addEventListener('mousemove', this.checkForImageScreenSelection)
    document.addEventListener('mouseup', this.clickImageScreenBox)

    this.setState({
      annotatedSceneConfig: this.makeAnnotatedSceneConfig(),
    })
  }

  componentWillUnmount(): void {
    document.removeEventListener('mousemove', this.checkForImageScreenSelection)
    document.removeEventListener('mouseup', this.clickImageScreenBox)

    try {
      this.state.annotatedSceneController && this.state.annotatedSceneController.cleanup()
    } catch (err) {
      log.error('annotatedSceneController.cleanup() failed', err)
    }
  }

  componentDidUpdate(oldProps: AnnotatorProps, oldState: AnnotatorState): void {
    if (!oldState.annotationManager && this.state.annotationManager && this.state.annotationManager) {
      this.styleStats()
    }

    if (this.props.activeAnnotation && oldProps.activeAnnotation !== this.props.activeAnnotation)
      this.previouslySelectedAnnotations.setByType(this.props.activeAnnotation)
  }

  private get imageManager() {
    let manager = this.imageManagerRef.current

    // in case it is wrapped by a decorator component.
    if (manager && (manager as any).getWrappedInstance) {
      manager = (manager as any).getWrappedInstance() as ImageManager
    }

    return manager
  }

  render(): JSX.Element {
    const {annotatedSceneConfig} = this.state
    const {dataProviderFactory, classes} = this.props
    const {onImageMouseEnter, onImageMouseLeave, onImageMouseUp} = this

    const manager = this.imageManager

    const imageContextValue: ImageContextState = {
      lightboxState: manager ? manager.lightboxState : initialImageContextValue.lightboxState,
      onImageMouseEnter,
      onImageMouseLeave,
      onImageMouseUp,
      // Note, the type cast here is relying on us guarding against
      // this.state.annotatedSceneController being null in the JSX below.
      channel: (this.state.annotatedSceneController && this.state.annotatedSceneController.channel) as SceneEmitter,
    }

    const guiProps: GuiContextState = {
      initialState: this.guiState,
      onUpdate: this.onDatGuiUpdate,
      config: this.configWithDefaults(),
    }

    return !dataProviderFactory ? (
      <div />
    ) : (
      <React.Fragment>
        <AnnotatedSceneController
          sceneRef={this.setAnnotatedSceneRef}
          backgroundColor={this.state.background}
          bezierScaleFactor={this.guiState.bezierScaleFactor}
          annotationManagerRef={this.setAnnotationManagerRef}
          dataProviderFactory={dataProviderFactory}
          config={annotatedSceneConfig}
          classes={{root: classes.annotatedScene}}
        />
        {this.state.annotatedSceneController && this.state.annotatedSceneController.state.utmCoordinateSystem && (
          <>
            <DatGuiContext.Provider value={guiProps}>
              <ImageContext.Provider value={imageContextValue}>
                {/*NOTE, The ImageLightbox is inside of the AnnotatorMenuView*/}
                <AnnotatorMenuView
                  innerRef={this.menuRef}
                  uiMenuVisible={!!this.props.uiMenuVisible}
                  selectedAnnotation={this.props.activeAnnotation}
                  onSaveAnnotationsJson={this.saveAnnotationsJson}
                  onSaveAnnotationsGeoJSON={this.saveAnnotationsGeoJSON}
                  onSaveAnnotationsKML={this.saveAnnotationsKML}
                  annotator={this}
                />
              </ImageContext.Provider>
            </DatGuiContext.Provider>
            <ImageManager
              ref={this.imageManagerRef}
              config={this.configWithDefaults()}
              utmCoordinateSystem={this.state.annotatedSceneController.state.utmCoordinateSystem!}
              dataProvider={this.state.annotatedSceneController.dataProvider}
              channel={this.state.annotatedSceneController.channel}
            />
          </>
        )}
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

      '&, & *, & *::after, & *::before': {
        boxSizing: 'border-box',
      },
    },

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

function isElectron(): boolean {
  return typeof process !== 'undefined' && process.versions && 'electron' in process.versions
}
