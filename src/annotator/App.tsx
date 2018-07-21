/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as React from 'react'
import '!!css-loader!jquery-ui-dist/jquery-ui.css'
import './style.scss'
import config from "@/config";
import * as logo from '../annotator-assets/images/signature_with_arrow_white.png'
import StatusWindowActions from "@/mapper-annotated-scene/StatusWindowActions";
import AnnotatedSceneActions from "@/mapper-annotated-scene/src/store/actions/AnnotatedSceneActions.ts";
import Kiosk from "@/kiosk/Kiosk";
import Annotator from "@/annotator/Annotator";

interface AppProps {}

interface AppState {}

export default class App extends React.Component<AppProps, AppState> {
	constructor(props: AppProps) {
		super(props)
	}

	private makeOnStatusWindowClick = () => () => {
		new StatusWindowActions().toggleEnabled()
	}

	private makeOnMenuClick = () => () => {
		new AnnotatedSceneActions().toggleUIMenuVisible()
	}

	render(): JSX.Element {
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

			<div id="menu_control">
				<button id="status_window_control_btn" className="menu_btn" onClick={this.makeOnStatusWindowClick()}> &#x2139; </button>
				<button id="menu_control_btn" className="menu_btn" onClick={this.makeOnMenuClick()}> &#9776; </button>
			</div>

		</React.Fragment>
	}

}
