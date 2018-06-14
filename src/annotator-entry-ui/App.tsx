/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as React from 'react'
import '!!css-loader!jquery-ui-dist/jquery-ui.css'
import initUIControl from '@/annotator-control-ui/UIControl'
import Annotator from 'annotator-entry-ui/Annotator'
import Annotator from 'annotator-entry-ui/Annotator'
import Menu from './components/Menu'
import './style.scss'
import Logger from '@/util/log'
import TrajectoryPicker from "./components/TrajectoryPicker"
import config from "@/config";
import AnnotatorMenuView from "annotator-entry-ui/AnnotatorMenuView";
import KioskMenuView from "annotator-entry-ui/KioskMenuView";
import * as logo from '../annotator-assets/images/signature_with_arrow_white.png'


const log = Logger(__filename)

interface AppProps {}

interface AppState {}

export default
class App extends React.Component<AppProps, AppState> {
	private sceneContainer: HTMLElement | null
	private trajectoryPicker: JSX.Element
	private trajectoryPickerRef: TrajectoryPicker
	private annotator: Annotator

	constructor(props: AppProps) {
		super(props)
		this.trajectoryPicker = (
			<TrajectoryPicker
				ref={(tp): TrajectoryPicker => this.trajectoryPickerRef = tp!}
			/>
		)
		this.annotator = new Annotator()
	}

	MenuComponent() {
		if (config.get('startup.kiosk_mode')) {
			return <KioskMenuView />
		} else {
			return <AnnotatorMenuView />
		}
	}

	render(): JSX.Element {
		console.log("HELLO", config.get('startup.kiosk_mode'))
		const MenuComponent = this.MenuComponent()


		return <React.Fragment>

			<div className="scene-container" ref={(el): HTMLDivElement => this.sceneContainer = el!}/>

			<div id="logo">
				<img
					src={logo}
					height="30px"
					width="auto"
				/>
			</div>

			<div id="status_window" />

			<div id="menu_control">
				<button id="status_window_control_btn" className="menu_btn"> &#x2139; </button>
				<button id="menu_control_btn" className="menu_btn"> &#9776; </button>
			</div>

			{/*<Menu />*/}
			{MenuComponent}

			{this.trajectoryPicker}

		</React.Fragment>
	}

	componentDidMount(): void {
		initUIControl()
		if (this.sceneContainer)
			this.annotator
				.mount(this.sceneContainer)
				.then(() => this.annotator.setOpenTrajectoryPickerFunction(this.trajectoryPickerRef.openModal))
		else
			log.warn('No scene container!')
	}

	componentWillUnmount(): void {
		this.annotator.unmount()
	}

}
