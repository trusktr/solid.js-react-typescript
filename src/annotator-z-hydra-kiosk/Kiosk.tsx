import * as React from 'react'
import CarManager from "@/annotator-z-hydra-kiosk/CarManager";
import {SceneManager} from "@/annotator-z-hydra-shared/src/services/SceneManager";
import RoadEditorState from "@/annotator-z-hydra-shared/src/store/state/RoadNetworkEditorState";
import {typedConnect} from "@/annotator-z-hydra-shared/src/styles/Themed";
import {createStructuredSelector} from "reselect";
import * as FlyThroughManager from "@/annotator-z-hydra-kiosk/FlyThroughManager";

export interface KioskProps {
  sceneInitialized ?: boolean
}

export interface KioskState {
	sceneManager: SceneManager | null
	carManager: CarManager | null
	flyThroughManager: FlyThroughManager | null
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
		}
	}

	componentWillReceiveProps(newProps) {
		if(newProps.sceneInitialized && !this.props.sceneInitialized && this.state.sceneManager) {
			// this is the transition from the Scene not being setup to when it is
			// Since it's setup now let's setup the fly through manager
      FlyThroughManager.init()
			const sceneManager = this.state.sceneManager
			sceneManager.addChildLoop(FlyThroughManager.getAnimationLoop())

      FlyThroughManager.startLoop()

		}
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




	render() {
		return <div style={{width: "100%", height: "100%"}}>
			TODO
			<SceneManager ref={this.getSceneManager} width={100} height={100} />
			<CarManager ref={this.getCarManager} sceneManager={this.state.sceneManager}/>

			<FlyThroughManager ref={this.getFlyThroughManager} />
		</div>
	}

}
