import * as React from 'react'
import CarManager from "@/annotator-z-hydra-kiosk/CarManager";
import {SceneManager} from "@/annotator-z-hydra-shared/src/services/SceneManager";
import RoadEditorState from "@/annotator-z-hydra-shared/src/store/state/RoadNetworkEditorState";
import {typedConnect} from "@/annotator-z-hydra-shared/src/styles/Themed";
import {createStructuredSelector} from "reselect";
import FlyThroughManager from "@/annotator-z-hydra-kiosk/FlyThroughManager";
import KioskMenuView from "@/annotator-z-hydra-kiosk/KioskMenuView";
import Logger from "@/util/log";

const log = Logger(__filename)

export interface KioskProps {
  sceneInitialized ?: boolean
}

export interface KioskState {
	sceneManager: SceneManager | null
	carManager: CarManager | null
	flyThroughManager: FlyThroughManager | null
	hasCalledSetup: boolean
}


@typedConnect(createStructuredSelector({
  sceneInitialized: (state) => state.get(RoadEditorState.Key).sceneInitialized,
}))
export default class Kiosk extends React.Component<KioskProps, KioskState> {

	constructor(props) {
		super(props)

		this.state = {
			sceneManager: null,
			carManager: null,
			flyThroughManager: null,
			hasCalledSetup: false
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

			this.setState({flyThroughManager})
		}
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

    	return
		}

    log.info('Listening for messages...')
		this.setState({
      hasCalledSetup: true
		})

    this.setLayerVisibility([Layer.POINT_CLOUD, Layer.ANNOTATIONS], true)

		this.state.sceneManager.removeAxisFromScene()
		this.state.sceneManager.removeCompassFromScene()
		this.state.sceneManager.hideGridVisibility()

		this.state.sceneManager.enableOrbitControls()



    // The camera and the point cloud AOI track the car object, so add it to the scene
    // regardless of whether it is visible in the scene.
		// @TODO confirm this works as expected
		this.state.carManager.addObjectToCar(this.state.sceneManager.getCamera()) // follow/orbit around the car



    if (this.pointCloudBoundingBox)
      this.pointCloudBoundingBox.material.visible = false

    // Start both types of playback, just in case. If fly-through is enabled it will preempt the live location client.
    FlyThroughManager.startFlyThrough()
    // this.startFlyThrough()
    this.locationServerStatusClient.connect()
    //this.resumeLiveMode()
    this.initClient()

    this.state.sceneManager.renderScene()
  }




	render() {
		console.log("RENDERING WITH STORE", this.props.sceneInitialized)
		return <div style={{width: "100%", height: "100%"}}>
			<SceneManager ref={this.getSceneManager} width={1000} height={1000} />
			<CarManager ref={this.getCarManager} sceneManager={this.state.sceneManager}/>

			<FlyThroughManager ref={this.getFlyThroughManager} />

      <KioskMenuView flyThroughManager={this.state.flyThroughManager}/>
		</div>
	}

}
