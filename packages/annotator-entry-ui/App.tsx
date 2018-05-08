/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as React from 'react'
import initUIControl from '@/annotator-control-ui/UIControl'
import {annotator} from 'annotator-entry-ui/Annotator'
import Menu from './components/Menu'
import './style.scss'
import Logger from '@/util/log'
import TrajectoryPicker from "./components/TrajectoryPicker"

const log = Logger(__filename)

interface AppProps {}

interface AppState {}

export default
class App extends React.Component<AppProps, AppState> {
	private sceneContainer: HTMLElement | null
	private trajectoryPicker: JSX.Element
	private trajectoryPickerRef: TrajectoryPicker

	constructor(props: AppProps) {
		super(props)
		this.trajectoryPicker = (
			<TrajectoryPicker
				ref={(tp): TrajectoryPicker => this.trajectoryPickerRef = tp!}
			/>
		)
	}

	render(): JSX.Element {
		return <React.Fragment>

			<div className="scene-container" ref={(el): HTMLDivElement => this.sceneContainer = el!}/>

			<div id="logo">
				<img
					src={process.cwd() + "/packages/annotator-assets/images/signature_with_arrow_white.png"}
					height="30px"
					width="auto"
				/>
			</div>

			<div id="status_window" />

			<div id="menu_control">
				<button id="status_window_control_btn" className="menu_btn"> &#x2139; </button>
				<button id="live_location_control_btn" className="menu_btn"> &#x2388; </button>
				<button id="menu_control_btn" className="menu_btn"> &#9776; </button>
			</div>

			<Menu />

			{this.trajectoryPicker}

		</React.Fragment>
	}

	componentDidMount(): void {
		initUIControl()
		if (this.sceneContainer)
			annotator
				.mount(this.sceneContainer)
				.then(() => annotator.setOpenTrajectoryPickerFunction(this.trajectoryPickerRef.openModal))
		else
			log.warn('No scene container!')
	}

	componentWillUnmount(): void {
		annotator.unmount()
	}

}
