/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as React from 'react'
import {StatusWindowActions,AnnotatedSceneActions} from '@mapperai/mapper-annotated-scene'

import Annotator from '../annotator/Annotator'
// TODO JOE eventually move this into the shared lib
import logo from '../annotator-assets/images/signature_with_arrow_white.png'

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

			{/* config['startup.kiosk_mode']
				? <Kiosk />
				: <Annotator />
			*/}
			<Annotator />

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
