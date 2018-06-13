/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as React from 'react'
import '!!css-loader!jquery-ui-dist/jquery-ui.css'
import './style.scss'

interface KioskViewProps {}

interface KioskViewState {}



export default class KioskMenuView extends React.Component<KioskViewProps, KioskViewState> {

	constructor(props: KioskViewProps) {
		super(props)
	}



	private makeOnPlayModeClick = () => () => {
		console.log("Clicked onPlayMode")
	}

	private makeOnLiveModeClick = () => () => {
		console.log("Clicked onLiveMode")
	}

	private makeOnSelectDataSetClick = () => () => {
		console.log("Clicked onDataSet")
	}



	render(): JSX.Element {
		return (<div id="menu">
			<menu id="liveModeMenu" className="menu hidden">
				<button id="live_mode_pause" className="mdc-button mdc-button--raised" onClick={this.makeOnPlayModeClick()}>
					<span>Play123</span>
					<i className="material-icons mdc-button__icon" aria-hidden="true">play_arrow</i>
				</button>
				<button id="live_recorded_playback_toggle" className="mdc-button mdc-button--raised" onClick={this.makeOnLiveModeClick()}>
					<span>Live123</span>
					<i className="material-icons mdc-button__icon" aria-hidden="true">my_location</i>
				</button>
				<button id="select_trajectory_playback_file" className="mdc-button mdc-button--raised" onClick={this.makeOnSelectDataSetClick()}>
					<span>Select data set123</span>
					<i className="material-icons mdc-button__icon" aria-hidden="true">playlist_play</i>
				</button>
			</menu>
		</div>)
	}
}
