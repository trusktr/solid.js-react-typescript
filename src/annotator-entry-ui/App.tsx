/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as React from 'react'
import '!!css-loader!jquery-ui-dist/jquery-ui.css'
import Annotator from 'annotator-entry-ui/Annotator'
import Menu from './components/Menu'
import './style.scss'
import Logger from '@/util/log'
import TrajectoryPicker from "./components/TrajectoryPicker"
import config from "@/config";
import AnnotatorMenuView from "annotator-entry-ui/AnnotatorMenuView";
import KioskMenuView from "annotator-z-hydra-kiosk/KioskMenuView";
import * as logo from '../annotator-assets/images/signature_with_arrow_white.png'
import RoadEditorState from "@/annotator-z-hydra-shared/src/store/state/RoadNetworkEditorState";
import {typedConnect} from "@/annotator-z-hydra-shared/src/styles/Themed";
import {createStructuredSelector} from "reselect";
import StatusWindow from "@/annotator-z-hydra-shared/components/StatusWindow";
import StatusWindowActions from "@/annotator-z-hydra-shared/StatusWindowActions";
import RoadNetworkEditorActions from "@/annotator-z-hydra-shared/src/store/actions/RoadNetworkEditorActions";


const log = Logger(__filename)

interface AppProps {
	liveModeEnabled ?: boolean
	playModeEnabled ?: boolean
	uiMenuVisible ?: boolean
}

interface AppState {}

@typedConnect(createStructuredSelector({
	liveModeEnabled: (state) => state.get(RoadEditorState.Key).liveModeEnabled,
	playModeEnabled: (state) => state.get(RoadEditorState.Key).playModeEnabled,

	uiMenuVisible: (state) => state.get(RoadEditorState.Key).uiMenuVisible,
}))
export default class App extends React.Component<AppProps, AppState> {
	// private sceneContainer: HTMLElement | null
	// private trajectoryPicker: JSX.Element
	// private trajectoryPickerRef: TrajectoryPicker
	//private annotator: Annotator

	constructor(props: AppProps) {
		super(props)
		// this.trajectoryPicker = (
		// 	<TrajectoryPicker
		// 		ref={(tp): TrajectoryPicker => this.trajectoryPickerRef = tp!}
		// 	/>
		// )
		//this.annotator = new Annotator(props)
	}

	MenuComponent() {
		if (config.get('startup.kiosk_mode')) {
			return <KioskMenuView />
		} else {
			return <AnnotatorMenuView />
		}
	}

	private makeOnStatusWindowClick = () => () => {
		console.log("Testing click to toggle Status Window")
		new StatusWindowActions().toggleEnabled()
	}

	private makeOnMenuClick = () => () => {
		console.log("Testing click to toggle UI Menu")
		new RoadNetworkEditorActions().toggleUIMenuVisible()
	}

	render(): JSX.Element {
		console.log("IN RENDER", config.get('startup.kiosk_mode'))
		const MenuComponent = this.MenuComponent()
		const {uiMenuVisible} = this.props

		return <React.Fragment>
			<Annotator />


			<div id="logo">
				<img
					src={logo}
					height="30px"
					width="auto"
				/>
			</div>

			{/* RYAN @TODO REPLACE WITH REACT COMP */}
			{/*<div id="status_window" />*/}
			<StatusWindow />


			<div id="menu_control">
				<button id="status_window_control_btn" className="menu_btn" onClick={this.makeOnStatusWindowClick()}> &#x2139; </button>
				<button id="menu_control_btn" className="menu_btn" onClick={this.makeOnMenuClick()}> &#9776; </button>
			</div>

			{/*<Menu />*/}
			{uiMenuVisible && MenuComponent}

			{/*{this.trajectoryPicker}*/}

		</React.Fragment>
	}

}
