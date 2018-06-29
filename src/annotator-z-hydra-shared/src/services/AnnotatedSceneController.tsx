import * as React from "react"
import {getValue} from "typeguard";
import * as THREE from "three";
import {sprintf} from 'sprintf-js'
import {createStructuredSelector} from "reselect";
import {typedConnect} from "@/annotator-z-hydra-shared/src/styles/Themed";
import RoadEditorState from "@/annotator-z-hydra-shared/src/store/state/RoadNetworkEditorState";
import StatusWindowState from "@/annotator-z-hydra-shared/src/models/StatusWindowState";
import StatusWindow from "@/annotator-z-hydra-shared/components/StatusWindow";
import Logger from "@/util/log";
import PointCloudManager from "@/annotator-z-hydra-shared/src/services/PointCloudManager";
import {SceneManager} from "@/annotator-z-hydra-shared/src/services/SceneManager";
import {Layer, default as LayerManager} from "@/annotator-z-hydra-shared/src/services/LayerManager";
import {UtmCoordinateSystem} from "@/annotator-entry-ui/UtmCoordinateSystem";
import {EventEmitter} from "events"
import {ImageManager} from "@/annotator-entry-ui/image/ImageManager";
import {PointCloudTileManager} from "@/annotator-entry-ui/tile/PointCloudTileManager";
import {TileServiceClient} from "@annotator-entry-ui/tile/TileServiceClient"
import {ScaleProvider} from "@annotator-entry-ui/tile/ScaleProvider"
import {EventName} from "@/annotator-z-hydra-shared/src/models/EventName";
import {AnnotationTileManager} from "@/annotator-entry-ui/tile/AnnotationTileManager";
import StatusWindowActions from "@/annotator-z-hydra-shared/StatusWindowActions";
import {StatusKey} from "@/annotator-z-hydra-shared/src/models/StatusKey";
import {SuperTile} from "@/annotator-entry-ui/tile/SuperTile";
import {PointCloudSuperTile} from "@/annotator-entry-ui/tile/PointCloudSuperTile";
import {OrderedMap} from "immutable";
import {AnnotationManager} from "@/annotator-entry-ui/AnnotationManager";

const log = Logger(__filename)

export interface CameraState {
  lastCameraCenterPoint: THREE.Vector3 | null // point in three.js coordinates where camera center line has recently intersected ground plane
}

export interface IAnnotatedSceneControllerProps {
  onPointOfInterestCall: any
	statusWindowState ?: StatusWindowState
}

export interface IAnnotatedSceneControllerState {
  cameraState: CameraState // isolating camera state incase we decide to migrate it to a Camera Manager down the road
  statusWindow: StatusWindow | null
  pointCloudManager: PointCloudManager | null
  sceneManager: SceneManager | null
  layerManager: LayerManager | null
  registeredKeyDownEvents: Map<number, any>
}


@typedConnect(createStructuredSelector({
  statusWindowState: (state) => state.get(RoadEditorState.Key).statusWindowState,
}))
export default class AnnotatedSceneController extends React.Component<IAnnotatedSceneControllerProps, IAnnotatedSceneControllerState> {
	public utmCoordinateSystem: UtmCoordinateSystem

	private scaleProvider: ScaleProvider
	private pointCloudTileManager: PointCloudManager
	private annotationManager: AnnotationManager
	private channel: EventEmitter

	constructor(props) {
		super(props)

		this.state = {
			cameraState: {
				lastCameraCenterPoint: null,
			},
			statusWindow: null,
			pointCloudManager: null,
			sceneManager: null,
			layerManager: null,
			registeredKeyDownEvents: new Map<number, any>()
		}

		// These don't need to be state, because these references don't change
		this.channel = new EventEmitter()
		this.utmCoordinateSystem = new UtmCoordinateSystem( this.channel )
		// ^ utmCoordinateSystem doesn't need to be a React component because it
		// isn't hooked to Redux.

		// TODO JOE THURSDAY if not creating it here, pass pointCloudTileManager as a prop
		this.scaleProvider = new ScaleProvider()
		const tileServiceClient = new TileServiceClient(this.scaleProvider, this.channel)
		this.pointCloudTileManager = new PointCloudTileManager(
			this.scaleProvider,
			this.utmCoordinateSystem,
			tileServiceClient,
		)

		if (this.settings.enableAnnotationTileManager) {
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
		}
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
		this.makeStats()
	}

	componentWillUnmount() {
		this.destroyStats()
	}

	private makeStats(): void {

		if (!config.get('startup.show_stats_module')) return

		// Create stats widget to display frequency of rendering
		this.stats = new Stats()
		this.stats.dom.style.top = 'initial' // disable existing setting
		this.stats.dom.style.bottom = '50px' // above Mapper logo
		this.stats.dom.style.left = '13px'
		this.root.appendChild(this.stats.dom)

	}

	private destroyStats(): void {
		if (!config.get('startup.show_stats_module')) return
		this.stats.dom.remove()
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

    if( !getValue( () => this.props.statusWindowState && this.props.statusWindowState.enabled, false ) ) return

    const currentPoint = this.currentPointOfInterest()
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


  // Find the point in the scene that is most interesting to a human user.
  currentPointOfInterest(): THREE.Vector3 | null {
    // @TODO JOE/RYAN - apps must pass a function as a prop to AnnotatedSceneController
    return this.props.onPointOfInterestCall()
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
	 * 	Set the camera directly above the current target, looking down.
	 */
	// @TODO long term move orbit controls to Camera Manger
	resetTiltAndCompass(): void {
		if(this.state.sceneManager) {
      this.state.sceneManager.resetTiltAndCompass()
		} else {
			log.error("Unable to reset tilt and compass - sceneManager not instantiated")
		}
  }




	registerKeyboardEvent(eventKeyCode:number, fn:any) {
		const registeredKeyboardEvents = this.state.registeredKeyDownEvents

		registeredKeyboardEvents.set(eventKeyCode, fn)
		this.setState({
			registeredKeyDownEvents: registeredKeyboardEvents
		})
	}

	/**
	 * Handle keyboard events
	 */
	private onKeyDown = (event: KeyboardEvent): void => {
		if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return

		const fn = getValue(() => this.state.registeredKeyDownEvents.get(event.keyCode), () => {})
		fn()

		// OLD CODE FOR REFERENCE
		// if (document.activeElement.tagName === 'INPUT')
		// 	this.onKeyDownInputElement(event)
	}

	private onKeyUp = (event: KeyboardEvent): void => {
		if (event.defaultPrevented) return

		const fn = getValue(() => this.state.registeredKeyUpEvents.get(event.keyCode), () => {})
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

	getAnnotationManagerRef = (ref: AnnotationManager): void => {
		this.annotationManager = ref
	}

	getSceneManagerRef = (sceneManager: SceneManager): void => {
		this.setState({ sceneManager })
	}

	getStatusWindowRef = (statusWindow:StatusWindow) => {
		this.setState({statusWindow})
	}

	getPointCloudManagerRef = (pointCloudManager:PointCloudManager) => {
		this.setState({pointCloudManager})
	}

	getLayerManagerRef = (layerManager: LayerManager): void => {
		this.setState({ layerManager })
	}

	render() {

		const {
			scaleProvider,
			utmCoordinateSystem,
		} = this

		// TODO JOE THURSDAY see onRenender below
		// const onRenderCallBack = this.state.sceneManager ? this.state.sceneManager.renderScene : () => {}

		return (
		  <React.Fragment>

		  	{/* NOTE JOE THURSDAY StatusWindow doesn't need UtmCoordinateSystem at all, it is only concerned with messages */}
 	        <StatusWindow ref={this.getStatusWindowRef} />

	        <PointCloudManager
				ref={this.getPointCloudManagerRef}
				utmCoordinateSystem={this.utmCoordinateSystem}
				sceneManager={}
				pointCloudTileManager={}
				layerManager={}
				handleTileManagerLoadError={}
				getCurrentPointOfInterest={this.currentPointOfInterest}
			/>

	        <SceneManager
				ref={this.getSceneManagerRef}
				width={1000}
				height={1000}
				utmCoordinateSystem={this.utmCoordinateSystem}
				eventEmitter={this.channel}
			/>

	        <LayerManager
				ref={this.getLayerManagerRef}
				eventEmitter={this.channel}

				// TODO JOE THURSDAY Looks like we can replace this with a message on a channel (eventEmitter) that
				// makes SceneManager re-render, so we can avoid stringing callbacks.
				onRenender={onRenderCallBack}
			/>

            <AnnotationManager
                ref={this.getAnnotationManagerRef}
    			isInteractiveMode={ !this.uiState.isKioskMode }
                layerManager={ this.state.layerManager }

                { ...{
        			scaleProvider,
        			utmCoordinateSystem,

					// TODO JOE THURSDAY replace with events
        			onAddAnnotation,
        			onRemoveAnnotation,
        			onChangeActiveAnnotation

                } }

            />

	      </React.Fragment>
	    )
	}

	render() {

		return (
		  <React.Fragment>
	      </React.Fragment>
	    )

}
