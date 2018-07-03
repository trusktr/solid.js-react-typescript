/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as React from 'react'
import '!!css-loader!jquery-ui-dist/jquery-ui.css'
import './style.scss'
import Logger from '@/util/log'
import config from "@/config";
// import KioskMenuView from "mapper-annotated-scene/KioskMenuView";
import * as logo from '../annotator-assets/images/signature_with_arrow_white.png'
import AnnotatedSceneState from "@/mapper-annotated-scene/src/store/state/AnnotatedSceneState";
import {typedConnect} from "@/mapper-annotated-scene/src/styles/Themed";
import {createStructuredSelector} from "reselect";
import StatusWindow from "@/mapper-annotated-scene/components/StatusWindow";
import StatusWindowActions from "@/mapper-annotated-scene/StatusWindowActions";
import AnnotatedSceneActions from "@/mapper-annotated-scene/src/store/actions/AnnotatedSceneActions.ts";
import Kiosk from "@/kiosk/Kiosk";
import Annotator from "@/annotator/Annotator";


const log = Logger(__filename)

interface AppProps {
	liveModeEnabled ?: boolean
	playModeEnabled ?: boolean
	uiMenuVisible ?: boolean
}

interface AppState {}

@typedConnect(createStructuredSelector({
	liveModeEnabled: (state) => state.get(AnnotatedSceneState.Key).liveModeEnabled,
	playModeEnabled: (state) => state.get(AnnotatedSceneState.Key).playModeEnabled,

	uiMenuVisible: (state) => state.get(AnnotatedSceneState.Key).uiMenuVisible,
}))
export default class App extends React.Component<AppProps, AppState> {
	// private sceneContainer: HTMLElement | null
	// private trajectoryPicker: JSX.Element
	//private annotator: Annotator

	constructor(props: AppProps) {
		super(props)
	}

	private makeOnStatusWindowClick = () => () => {
		log.info("Testing click to toggle Status Window")
		new StatusWindowActions().toggleEnabled()
	}

	private makeOnMenuClick = () => () => {
		log.info("Testing click to toggle UI Menu")
		new AnnotatedSceneActions().toggleUIMenuVisible()
	}

	render(): JSX.Element {
		log.info("IN RENDER", config['startup.kiosk_mode'])
		// const {uiMenuVisible} = this.props

		return <React.Fragment>

			{ config['startup.kiosk_mode'] ?
				<Kiosk />
			:
				<Annotator />
			}


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

		</React.Fragment>
	}

}
