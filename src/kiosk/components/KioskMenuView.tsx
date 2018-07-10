/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as React from 'react'
import '!!css-loader!jquery-ui-dist/jquery-ui.css'
import '@/annotator/style.scss'
import {typedConnect} from "@/mapper-annotated-scene/src/styles/Themed";
import AnnotatedSceneState from "mapper-annotated-scene/src/store/state/AnnotatedSceneState"
import {createStructuredSelector} from "reselect"
import AnnotatedSceneActions from "mapper-annotated-scene/src/store/actions/AnnotatedSceneActions.ts";
import FlyThroughManager from "@/kiosk/components/FlyThroughManager";


interface KioskViewProps {
	liveModeEnabled ?: boolean
	playModeEnabled ?: boolean
	flyThroughManager: FlyThroughManager
}

interface KioskViewState {}


@typedConnect(createStructuredSelector({
	liveModeEnabled: (state) => state.get(AnnotatedSceneState.Key).liveModeEnabled,
	playModeEnabled: (state) => state.get(AnnotatedSceneState.Key).playModeEnabled,
}))
export default class KioskMenuView extends React.Component<KioskViewProps, KioskViewState> {

	constructor(props: KioskViewProps) {
		super(props)
		console.log("INSIDE KioskMenuView constructor")
	}


	private makeOnPlayModeClick = () => () => {
		console.log("Clicked onPlayMode")
		new AnnotatedSceneActions().togglePlayMode()
		const flyThroughManager = this.props.flyThroughManager
    flyThroughManager.toggleLiveModePlay()


	}

	private makeOnLiveModeClick = () => () => {
		console.log("Clicked onLiveMode")
		new AnnotatedSceneActions().toggleLiveMode()
    const flyThroughManager = this.props.flyThroughManager
    flyThroughManager.toggleLiveAndRecordedPlay()
	}

	private makeOnSelectDataSetClick = () => () => {
		console.log("Clicked onDataSet")
	}



	render(): JSX.Element {
		console.log("Inside render of KioskMenuView")
		const {liveModeEnabled, playModeEnabled} = this.props
		const liveModeLabel = liveModeEnabled ? 'Recorded2' : 'Live2'
		const playModelLabel = playModeEnabled ? 'Pause2' : 'Play2'

		const playModeIcon = playModeEnabled ? 'pause' : 'play_arrow'
		const liveModeIcon = liveModeEnabled ? 'videocam' : 'my_location'

		console.log("CURRENT VALUE OF liveModeEnabled", liveModeEnabled)
		console.log("CURRENT VALUE OF playModeEnabled", playModeEnabled)

		// @TODO remove <div id="menu"> -- shouldn't be needed anymore, visibility is controlled by Redux
		return (<div id="menu">
				<menu id="liveModeMenu" className="menu">
					<button id="live_mode_pause" className="mdc-button mdc-button--raised" onClick={this.makeOnPlayModeClick()}>
						<span>{playModelLabel}</span>
						<i className="material-icons mdc-button__icon" aria-hidden="true">{playModeIcon}</i>
					</button>
					<button id="live_recorded_playback_toggle" className="mdc-button mdc-button--raised" onClick={this.makeOnLiveModeClick()}>
						<span>{liveModeLabel}</span>
						<i className="material-icons mdc-button__icon" aria-hidden="true">{liveModeIcon}</i>
					</button>
					<button id="select_trajectory_playback_file" className="mdc-button mdc-button--raised" onClick={this.makeOnSelectDataSetClick()}>
						<span>Select data set123</span>
						<i className="material-icons mdc-button__icon" aria-hidden="true">playlist_play</i>
					</button>
				</menu>
			</div>)
	}
}
