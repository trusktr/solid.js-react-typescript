import * as React from 'react'
import CarManager from "@/annotator-z-hydra-kiosk/CarManager";
import {SceneManager} from "@/annotator-z-hydra-shared/src/services/SceneManager";
import RoadEditorState from "@/annotator-z-hydra-shared/src/store/state/RoadNetworkEditorState";
import {typedConnect} from "@/annotator-z-hydra-shared/src/styles/Themed";
import {createStructuredSelector} from "reselect";
import FlyThroughManager from "@/annotator-z-hydra-kiosk/FlyThroughManager";
import KioskMenuView from "@/annotator-z-hydra-kiosk/KioskMenuView";
import Logger from "@/util/log";
import LayerManager from "@/annotator-z-hydra-shared/src/services/LayerManager";
import {
  LocationServerStatusClient,
  LocationServerStatusLevel
} from "@/annotator-entry-ui/status/LocationServerStatusClient";
import {StatusKey} from "@/annotator-z-hydra-shared/src/models/StatusKey";
import StatusWindowActions from "@/annotator-z-hydra-shared/StatusWindowActions";

const log = Logger(__filename)

export interface KioskProps {
  sceneInitialized ?: boolean
  isCarInitialized ?: boolean
}

export interface KioskState {
	sceneManager: SceneManager | null
	carManager: CarManager | null
	flyThroughManager: FlyThroughManager | null
	layerManager: LayerManager | null
	hasCalledSetup: boolean

}


@typedConnect(createStructuredSelector({
  sceneInitialized: (state) => state.get(RoadEditorState.Key).sceneInitialized,
  isCarInitialized: (state) => state.get(RoadEditorState.Key).isCarInitialized,
}))
export default class Kiosk extends React.Component<KioskProps, KioskState> {

	constructor(props) {
		super(props)

    this.state = {
			sceneManager: null,
			carManager: null,
			flyThroughManager: null,
			layerManager: null,
			hasCalledSetup: false,
    }
	}

	componentWillReceiveProps(newProps) {
		if(newProps.sceneInitialized && !this.props.sceneInitialized && this.state.sceneManager && this.state.flyThroughManager) {
			// this is the transition from the Scene not being setup to when it is
			// Since it's setup now let's setup the fly through manager
      const flyThroughManager = this.state.flyThroughManager
      // flyThroughManager.init() -- called on componentDidMount within FlyThroughManager
			const sceneManager = this.state.sceneManager
			sceneManager.addChildLoop(flyThroughManager.getAnimationLoop())

      flyThroughManager.startLoop()

			// Register key events
			this.registerKeyDownEvents()

			this.setState({flyThroughManager})
		}


		if(newProps.isCarInitialized && !this.props.isCarInitialized && !this.state.hasCalledSetup &&
			this.state.sceneManager && this.state.layerManager && this.state.carManager && this.state.flyThroughManager
		) {
			// Once the car is setup, we need to call this.listen()
			this.listen()
		}

	}

	private registerKeyDownEvents() {
		const LEFT_ARROW_KEY_CODE = 37
		const UP_ARROW_KEY_CODE = 38
		const RIGHT_ARROW_KEY_CODE = 39
		const DOWN_ARROW_KEY_CODE = 40
		const cameraOffsetDelta = 1

    this.state.sceneManager!.registerKeyboardEvent(LEFT_ARROW_KEY_CODE, () => {this.state.sceneManager!.adjustCameraXOffset(cameraOffsetDelta)})
		this.state.sceneManager!.registerKeyboardEvent(UP_ARROW_KEY_CODE, () => {this.state.sceneManager!.adjustCameraYOffset(cameraOffsetDelta)})
		this.state.sceneManager!.registerKeyboardEvent(RIGHT_ARROW_KEY_CODE, () => {this.state.sceneManager!.adjustCameraXOffset(-1 * cameraOffsetDelta)})
		this.state.sceneManager!.registerKeyboardEvent(DOWN_ARROW_KEY_CODE, () => {this.state.sceneManager!.adjustCameraYOffset(-1 * cameraOffsetDelta)})
	}

	componentDidMount() {
		// this.listen()

	}

	getCarManager = (carManager:CarManager) => {
		this.setState({carManager,})
	}

	getSceneManager = (sceneManager:SceneManager) => {
		this.setState({sceneManager,})
	}

  getFlyThroughManager = (flyThroughManager:FlyThroughManager) => {
    this.setState({flyThroughManager,})
  }

  // this gets called after the CarManager is instantiated
  private listen() {
    if (this.state.hasCalledSetup) return

		if(!this.state.carManager || !this.state.sceneManager) {
			log.warn("Unable to finish calling listen() -- managers not initialized")
    	return
		}

    log.info('Listening for messages...')
		this.setState({
      hasCalledSetup: true
		})

		this.state.sceneManager.activateReadOnlyViewingMode()

    // The camera and the point cloud AOI track the car object, so add it to the scene
    // regardless of whether it is visible in the scene.
		// @TODO confirm this works as expected
		this.state.carManager.addObjectToCar(this.state.sceneManager.getCamera()) // follow/orbit around the car
		this.state.carManager.makeCarVisible()


		if(this.state.flyThroughManager) {
      // Start both types of playback, just in case. If fly-through is enabled it will preempt the live location client.
      this.state.flyThroughManager.startFlyThrough()

      //this.resumeLiveMode()
      this.state.flyThroughManager.initClient()
		} else {
    	log.error("Error in listen() - flyThroughManager expected, but not found")
		}

    this.state.sceneManager.renderScene()
  }




	render() {
		console.log("RENDERING WITH STORE", this.props.sceneInitialized)
        return <div style={{width: "100%", height: "100%"}}>
            <SceneManager ref={this.getSceneManager} width={1000} height={1000} />
						<LayerManager ref={this.getLayerManager} sceneManager={} annotationManager={} pointCloudTileManager={} pointCloudManager={} imageManager={} onRerender={}/>
            <CarManager ref={this.getCarManager} sceneManager={this.state.sceneManager}/>

            <FlyThroughManager ref={this.getFlyThroughManager} />

            <KioskMenuView flyThroughManager={this.state.flyThroughManager}/>
        </div>
	}

}
