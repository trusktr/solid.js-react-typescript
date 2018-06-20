import * as React from 'react'
import CarManager from "@/annotator-z-hydra-kiosk/CarManager";
import {SceneManager} from "@/annotator-z-hydra-shared/src/services/SceneManager";


export interface KioskProps {

}

export interface KioskState {
	sceneManager: SceneManager | null
	carManager: CarManager | null
}


export default
class Kiosk extends React.Component<KioskProps, KioskState> {

	constructor(props) {
		super(props)

		this.state = {
			sceneManager: null,
			carManager: null
		}
	}


	getCarManager = (carManager:CarManager) => {
		this.setState({carManager,})
	}

	getSceneManager = (sceneManager:SceneManager) => {
		this.setState({sceneManager,})
	}




	render() {
		return <div style={{width: "100%", height: "100%"}}>
			TODO
			<SceneManager ref={this.getSceneManager} width={100} height={100} />
			<CarManager ref={this.getCarManager} sceneManager={this.state.sceneManager}/>
		</div>
	}

}
