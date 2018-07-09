import * as React from "react"
import {getValue} from "typeguard";
import * as THREE from "three";
import {sprintf} from 'sprintf-js'
import {AnimationLoop, ChildAnimationLoop} from 'animation-loop'
import {createStructuredSelector} from "reselect";
import {typedConnect} from "@/mapper-annotated-scene/src/styles/Themed";
import AnnotatedSceneState from "@/mapper-annotated-scene/src/store/state/AnnotatedSceneState";
import StatusWindowState from "@/mapper-annotated-scene/src/models/StatusWindowState";
import StatusWindow from "@/mapper-annotated-scene/components/StatusWindow";
import Logger from "@/util/log";
import PointCloudManager from "@/mapper-annotated-scene/src/services/PointCloudManager";
import GroundPlaneManager from "@/mapper-annotated-scene/src/services/GroundPlaneManager"
import {SceneManager} from "@/mapper-annotated-scene/src/services/SceneManager";
import {Layer, default as LayerManager} from "@/mapper-annotated-scene/src/services/LayerManager";
import {UtmCoordinateSystem} from "@/mapper-annotated-scene/UtmCoordinateSystem";
import {EventEmitter} from "events"
import {PointCloudTileManager} from "@/mapper-annotated-scene/tile/PointCloudTileManager";
import {TileServiceClient} from "@/mapper-annotated-scene/tile/TileServiceClient"
import {ScaleProvider} from "@/mapper-annotated-scene/tile/ScaleProvider"
import * as OBJLoader from 'three-obj-loader'
import {isTupleOfNumbers} from "@/util/Validation";
import config from "@/config";
import {AnnotationTileManager} from "@/mapper-annotated-scene/tile/AnnotationTileManager";
import StatusWindowActions from "@/mapper-annotated-scene/StatusWindowActions";
import {StatusKey} from "@/mapper-annotated-scene/src/models/StatusKey";
import {AnnotationManager} from "@/mapper-annotated-scene/AnnotationManager";
import AnnotatedSceneActions from "@/mapper-annotated-scene/src/store/actions/AnnotatedSceneActions";
import AreaOfInterestManager from "@/mapper-annotated-scene/src/services/AreaOfInterestManager";
import {Vector3} from "three";
import {BusyError} from "@/mapper-annotated-scene/tile/TileManager"

const log = Logger(__filename)

OBJLoader(THREE)

const dialog = Electron.remote.dialog

export interface CameraState {
  lastCameraCenterPoint: THREE.Vector3 | null // point in three.js coordinates where camera center line has recently intersected ground plane
}

// TODO JOE WEDNESDAY moved from Annotator.tsx
interface AnnotatorSettings {
	background: THREE.Color
	cameraOffset: THREE.Vector3
	orthoCameraHeight: number // ortho camera uses world units (which we treat as meters) to define its frustum
	defaultAnimationFrameIntervalMs: number | false
	animationFrameIntervalSecs: number | false // how long we have to update the animation before the next frame fires
	enableTileManagerStats: boolean
	timeToDisplayHealthyStatusMs: number
	maxDistanceToDecorations: number // meters
	skyRadius: number
	cameraToSkyMaxDistance: number
}

export interface IAnnotatedSceneControllerProps {
  onPointOfInterestCall ?: () => THREE.Vector3
  onCurrentRotation ?: () => THREE.Quaternion
  enableAnnotationTileManager: boolean // this should be true for Kiosk and false for Annotator
	statusWindowState ?: StatusWindowState
	pointOfInterest?: THREE.Vector3
	getAnnotationManagerRef?: (ref: AnnotationManager) => void

	lockBoundaries?: boolean
	lockTerritories?: boolean
	lockLanes?: boolean
	lockTrafficDevices?: boolean
}

export interface IAnnotatedSceneControllerState {
  cameraState: CameraState // isolating camera state incase we decide to migrate it to a Camera Manager down the road
  statusWindow: StatusWindow | null
  pointCloudManager: PointCloudManager | null
  areaOfInterestManager: AreaOfInterestManager | null
  groundPlaneManager: GroundPlaneManager | null
  sceneManager: SceneManager | null
  layerManager: LayerManager | null
  registeredKeyDownEvents: Map<number, any> // mapping between KeyboardEvent.keycode and function to execute
  registeredKeyUpEvents: Map<number, any> // mapping between KeyboardEvent.keycode and function to execute
}


@typedConnect(createStructuredSelector({
  statusWindowState: (state) => state.get(AnnotatedSceneState.Key).statusWindowState,
  pointOfInterest: (state) => state.get(AnnotatedSceneState.Key).pointOfInterest,
}))
export default class AnnotatedSceneController extends React.Component<IAnnotatedSceneControllerProps, IAnnotatedSceneControllerState> {
  public utmCoordinateSystem: UtmCoordinateSystem

  private scaleProvider: ScaleProvider
  private pointCloudTileManager: PointCloudTileManager
  private annotationTileManager: AnnotationTileManager | null
  annotationManager: AnnotationManager // public because apps like Kiosk need access to it (e.g., to load user data and trajectories)
  private channel: EventEmitter

  constructor(props) {
    super(props)

	// TODO not used currently
	// enableTileManagerStats: !!config['tile_manager.stats_display.enable'],

    this.state = {
      cameraState: {
        lastCameraCenterPoint: null,
      },
      statusWindow: null,
      pointCloudManager: null,
      sceneManager: null,
      layerManager: null,
      groundPlaneManager: null,
      registeredKeyDownEvents: new Map<number, any>(),
      registeredKeyUpEvents: new Map<number, any>(),
      areaOfInterestManager: null,
    }

    // These don't need to be state, because these references don't change
    this.channel = new EventEmitter()
    this.utmCoordinateSystem = new UtmCoordinateSystem(this.channel)
    // ^ utmCoordinateSystem doesn't need to be a React component because it
    // isn't hooked to Redux.
    this.annotationTileManager = null // this will be set if props.enableAnnotationTileManager is true

    // TODO JOE THURSDAY if not creating it here, pass pointCloudTileManager as a prop
    this.scaleProvider = new ScaleProvider()
    const tileServiceClient = new TileServiceClient(this.scaleProvider, this.channel)
    this.pointCloudTileManager = new PointCloudTileManager(
      this.scaleProvider,
      this.utmCoordinateSystem,
      tileServiceClient,
    )

    if (this.props.enableAnnotationTileManager) {
      this.annotationTileManager = new AnnotationTileManager(
        this.scaleProvider,
        this.utmCoordinateSystem,
        tileServiceClient,

        // TODO FIXME JOE AnnotationManager is passed into
        // AnnotationTileManager, so I think we're thinking of two
        // AnnotationManager classes: the one Clyde made, and the one we
        // imagine as effectively the thing controling the annotation
        // tile layer which is similar to PointCloudManager. So we
        // should split AnnotationManager into two, and name one of them
        // something like AnnotationLayer or something.
        this.annotationManager,
      )
      new AnnotatedSceneActions().setIsAnnotationTileManagerEnabled(true)
    }

    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
  }

  updateCurrentLocationStatusMessage(positionUtm: THREE.Vector3): void {
    // This is a hack to allow data with no coordinate reference system to pass through the UTM classes.
    // Data in local coordinate systems tend to have small values for X (and Y and Z) which are invalid in UTM.
    if (positionUtm.x > 100000) { // If it looks local, don't convert to LLA. TODO fix this.
      const positionLla = this.utmCoordinateSystem.utmVectorToLngLatAlt(positionUtm)
      const messageLla = sprintf('LLA: %.4fE %.4fN %.1falt', positionLla.x, positionLla.y, positionLla.z)

      // this.statusWindow.setMessage(statusKey.currentLocationLla, messageLla)
      new StatusWindowActions().setMessage(StatusKey.CURRENT_LOCATION_LLA, messageLla)
    }
    const messageUtm = sprintf('UTM %s: %dE %dN %.1falt', this.utmCoordinateSystem.utmZoneString(), positionUtm.x, positionUtm.y, positionUtm.z)
    // this.statusWindow.setMessage(statusKey.currentLocationUtm, messageUtm)
    new StatusWindowActions().setMessage(StatusKey.CURRENT_LOCATION_UTM, messageUtm)
  }

  componentDidMount() {
    if(!this.state.sceneManager) {
      log.error("[Migration Error] SceneManager is not setup")
      return
    }

    // TODO JOE FRIDAY
    // if ( interaction is enabled ) {

    this.state.sceneManager.state.renderer.domElement.addEventListener('mousemove', this.annotationManager.checkForActiveMarker)

    // TODO REORG JOE, shared, move to AnnotationManager, but Kiosk won't enable interaction stuff
    this.state.sceneManager.state.renderer.domElement.addEventListener('mouseup', this.annotationManager.checkForConflictOrDeviceSelection)
    this.state.sceneManager.state.renderer.domElement.addEventListener('mouseup', this.annotationManager.checkForAnnotationSelection)
    this.state.sceneManager.state.renderer.domElement.addEventListener('mouseup', this.annotationManager.addAnnotationMarker)
    this.state.sceneManager.state.renderer.domElement.addEventListener('mouseup', this.annotationManager.addLaneConnection)   // RYAN Annotator-specific
    this.state.sceneManager.state.renderer.domElement.addEventListener('mouseup', this.annotationManager.connectNeighbor)  // RYAN Annotator-specific
    this.state.sceneManager.state.renderer.domElement.addEventListener('mouseup', this.annotationManager.joinAnnotationsEventHandler)

    // }

    if (config['startup.camera_offset']) {
      const cameraOffset: [number, number, number] = config['startup.camera_offset']

      if (isTupleOfNumbers(cameraOffset, 3)) {
        this.state.sceneManager.setCameraOffset(cameraOffset)
      } else if (cameraOffset) {
        log.warn(`invalid startup.camera_offset config: ${cameraOffset}`)
      }
    }
  }

  componentDidUpdate() {
	  this.displayCameraInfo()
  }

  /**
   * Set the point cloud as the center of the visible world.
   */
  // Currently this function is only used on keyboard shortcuts
  // @TODO long term move orbit controls to Camera Manger
  focusOnPointCloud(): void {
    this.state.pointCloudManager!.focusOnPointCloud()
    this.displayCameraInfo()
  }

  // @TODO long term move orbit controls to Camera Manger
  // Display some info in the UI about where the camera is pointed.
  private displayCameraInfo = (): void => {

    if (!getValue(() => this.props.statusWindowState && this.props.statusWindowState.enabled, false)) return

    // const currentPoint = this.currentPointOfInterest()
	const currentPoint = this.props.pointOfInterest

    if (currentPoint) {
      const oldPoint = this.state.cameraState.lastCameraCenterPoint
      const newPoint = currentPoint.clone().round()
      const samePoint = oldPoint && oldPoint.x === newPoint.x && oldPoint.y === newPoint.y && oldPoint.z === newPoint.z
      if (!samePoint) {
        const cameraState = this.state.cameraState
        cameraState.lastCameraCenterPoint = newPoint
        this.setState({cameraState})

        const utm = this.utmCoordinateSystem.threeJsToUtm(newPoint)
        this.updateCurrentLocationStatusMessage(utm)
      }
    }
  }

  activateReadOnlyViewingMode() {
    this.state.layerManager!.setLayerVisibility([Layer.POINT_CLOUD.toString(), Layer.ANNOTATIONS.toString()], true)

    // @TODO originally this function all called 'this.gui.close()' -- look into adding this funtionality
    this.state.sceneManager!.removeAxisFromScene()
    this.state.sceneManager!.removeCompassFromScene()
    this.state.sceneManager!.hideGridVisibility()

    // @TODO annotatorOrbitControls.enabled = false
    // @TODO flyThroughOrbitControls.enabled = true

    this.state.pointCloudManager!.hidePointCloudBoundingBox()
  }

  /**
   *  Set the camera directly above the current target, looking down.
   */
  // @TODO long term move orbit controls to Camera Manger
  resetTiltAndCompass(): void {
    if (this.state.sceneManager) {
      this.state.sceneManager.resetTiltAndCompass()
    } else {
      log.error("Unable to reset tilt and compass - sceneManager not instantiated")
    }
  }

  setCameraOffsetVector(offset: THREE.Vector3): void {
    this.state.sceneManager!.setCameraOffsetVector(offset)
  }

  addObjectToScene(object: THREE.Object3D) {
    new AnnotatedSceneActions().addObjectToScene(object)
  }

  removeObjectFromScene(object: THREE.Object3D) {
    new AnnotatedSceneActions().removeObjectFromScene(object)
  }

  renderScene() {
    return this.state.sceneManager!.renderScene()
  }

  adjustCameraXOffset(value: number) {
    this.state.sceneManager!.adjustCameraXOffset(value)
  }

  adjustCameraYOffset(value: number) {
    this.state.sceneManager!.adjustCameraYOffset(value)
  }

  addChildLoop(childLoop: ChildAnimationLoop) {
    this.state.sceneManager!.addChildLoop(childLoop)
  }


  registerKeyboardDownEvent(eventKeyCode: number, fn: any) {
    const registeredKeyboardEvents = this.state.registeredKeyDownEvents

    registeredKeyboardEvents.set(eventKeyCode, fn)
    this.setState({
      registeredKeyDownEvents: registeredKeyboardEvents
    })
  }

  registerKeyboardUpEvent(eventKeyCode: number, fn: any) {
    const registeredKeyboardEvents = this.state.registeredKeyUpEvents

    registeredKeyboardEvents.set(eventKeyCode, fn)
    this.setState({
      registeredKeyUpEvents: registeredKeyboardEvents
    })
  }

  /**
   * Handle keyboard events
   */
  private onKeyDown = (event: KeyboardEvent): void => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return

    const fn = getValue(() => this.state.registeredKeyDownEvents.get(event.keyCode), () => {
    })
    fn()

    // OLD CODE FOR REFERENCE
    // if (document.activeElement.tagName === 'INPUT')
    // 	this.onKeyDownInputElement(event)
  }

  private onKeyUp = (event: KeyboardEvent): void => {
    if (event.defaultPrevented) return

    const fn = getValue(() => this.state.registeredKeyUpEvents.get(event.keyCode), () => {
    })
    fn()
  }

  // just unfocuses the active input element on escape key
  private onKeyDownInputElement = (event: KeyboardEvent): void => {
    switch (event.key) {
      case 'Escape': {
        (event.target as HTMLInputElement).blur()
        break
      }
      default:
      // nothing to do here
    }
  }

  private handleTileManagerLoadError = (dataType: string, err: Error): void => {
	  if (err instanceof BusyError) {
		  log.info(err.message)

	  // TODO TMP this was checking isKioskMode
	  } else if (this.props.enableAnnotationTileManager) {
		  log.warn(err.message)

	  } else {
		  console.error(dataType, err)
		  // TODO TMP
		  // const now = new Date().getTime()
		  // if (now - this.uiState.lastPointCloudLoadedErrorModalMs < this.settings.timeBetweenErrorDialogsMs) {
			//   log.warn(err.message)
		  // } else {
			//   log.error(err.message)
			//   dialog.showErrorBox(`${dataType} Load Error`, err.message)
			//   this.uiState.lastPointCloudLoadedErrorModalMs = now
		  // }
	  }
  }

  getAnnotationManagerRef = (ref: AnnotationManager): void => {
    this.annotationManager = ref
	this.props.getAnnotationManagerRef && this.props.getAnnotationManagerRef( ref )
  }

  getSceneManagerRef = (sceneManager: SceneManager): void => {
    this.setState({sceneManager})
  }

  getStatusWindowRef = (statusWindow: StatusWindow) => {
    this.setState({statusWindow})
  }

  getPointCloudManagerRef = (pointCloudManager: PointCloudManager) => {
    this.setState({pointCloudManager})
  }

  getLayerManagerRef = (layerManager: LayerManager): void => {
    this.setState({layerManager})
  }

  getAreaOfInterestManagerRef = (areaOfInterestManager:AreaOfInterestManager): void => {
    this.setState({areaOfInterestManager})
  }

  getGroundPlaneManagerRef = (groundPlaneManager: GroundPlaneManager): void => {
    this.setState({groundPlaneManager})
  }

  render() {

    const {
      scaleProvider,
      utmCoordinateSystem,
	  annotationTileManager,
	  handleTileManagerLoadError,
    } = this

	const {layerManager, pointCloudManager, groundPlaneManager, sceneManager} = this.state
	const {lockBoundaries, lockTerritories, lockTrafficDevices, lockLanes} = this.props

    // TODO JOE THURSDAY see onRenender below
    // const onRenderCallBack = this.state.sceneManager ? this.state.sceneManager.renderScene : () => {}

    return (
      <React.Fragment>

        {/* TODO JOE THURSDAY StatusWindow doesn't need UtmCoordinateSystem, it is only concerned with messages */}
        <StatusWindow
			ref={this.getStatusWindowRef}
			utmCoordinateSystem={this.utmCoordinateSystem}
			eventEmitter={this.channel}
		/>

        <SceneManager
          ref={this.getSceneManagerRef}

		  // TODO JOE this will resize based on container size using window.ResizeObserver.
          width={1000}
          height={1000}

          utmCoordinateSystem={this.utmCoordinateSystem}
          eventEmitter={this.channel}
          areaOfInterestManager={this.state.areaOfInterestManager}
        />

        <AreaOfInterestManager
          ref={this.getAreaOfInterestManagerRef}
          getPointOfInterest={this.props.onPointOfInterestCall}
          getCurrentRotation={this.props.onCurrentRotation}
          utmCoordinateSystem={this.utmCoordinateSystem}
          groundPlaneManager={this.state.groundPlaneManager}
          sceneManager={this.state.sceneManager}
		/>

        <LayerManager ref={this.getLayerManagerRef} />

        <PointCloudManager
          ref={this.getPointCloudManagerRef}
          utmCoordinateSystem={this.utmCoordinateSystem}
          sceneManager={this.state.sceneManager!}
          pointCloudTileManager={this.pointCloudTileManager}
          layerManager={this.state.layerManager!}
          handleTileManagerLoadError={this.handleTileManagerLoadError}
        />

        <AnnotationManager
          ref={this.getAnnotationManagerRef}

          {...{
            scaleProvider,
            utmCoordinateSystem,
			handleTileManagerLoadError,

			layerManager,
			pointCloudManager,
			groundPlaneManager,
			annotationTileManager,
			sceneManager,

			// TODO we can handle this better, revisit with Ryan. Currently we
			// forward props from the app through her to AnnotationManager
			lockBoundaries,
			lockTerritories,
			lockLanes,
			lockTrafficDevices,

          }}

        />

		<GroundPlaneManager
			ref={this.getGroundPlaneManagerRef}
			utmCoordinateSystem={this.utmCoordinateSystem}
			sceneManager={this.state.sceneManager!}
		/>

      </React.Fragment>
    )
  }
}
