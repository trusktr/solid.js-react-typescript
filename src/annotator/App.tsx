/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as React from 'react'
import config from '../config'
import getFileUrl from '../util/getFileUrl'
import StatusWindowActions from '../mapper-annotated-scene/StatusWindowActions'
import AnnotatedSceneActions from '../mapper-annotated-scene/src/store/actions/AnnotatedSceneActions'
import Kiosk from '../kiosk/Kiosk'
import Annotator from '../annotator/Annotator'

// TODO JOE
// if (webpack) {
// import * as logo from '../annotator-assets/images/signature_with_arrow_white.png'
// we can use `require()`, or otherwise ass a babel-register hook so import works in both cases
// } else {
const logo = getFileUrl('annotator-assets/images/signature_with_arrow_white.png')
// }

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

			{ config['startup.kiosk_mode']
				? <Kiosk />
				: <Annotator />
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
