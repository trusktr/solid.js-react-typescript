/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as React from 'react'
// TODO JOE don't use webpack-specific syntax in the import statements
import '!!css-loader!jquery-ui-dist/jquery-ui.css' // eslint-disable-line import/no-webpack-loader-syntax
import '@/annotator/style.scss'
import {typedConnect} from '@/mapper-annotated-scene/src/styles/Themed'
import AnnotatedSceneState from 'mapper-annotated-scene/src/store/state/AnnotatedSceneState'
import {createStructuredSelector} from 'reselect'
import AnnotatedSceneActions from 'mapper-annotated-scene/src/store/actions/AnnotatedSceneActions.ts'
import FlyThroughManager from '@/kiosk/components/FlyThroughManager'

interface KioskViewProps {
	isLiveMode?: boolean
	isPlayMode?: boolean
	flyThroughManager: FlyThroughManager
	openTrajectoryPickerFunction(): void
	uiMenuVisible?: boolean
}

interface KioskViewState {}

@typedConnect(createStructuredSelector({
	isLiveMode: (state) => state.get(AnnotatedSceneState.Key).isLiveMode,
	isPlayMode: (state) => state.get(AnnotatedSceneState.Key).isPlayMode,
	uiMenuVisible: (state) => state.get(AnnotatedSceneState.Key).uiMenuVisible,
	}))
export default class KioskMenuView extends React.Component<KioskViewProps, KioskViewState> {
	constructor(props: KioskViewProps) {
		super(props)
	}

	private makeOnPlayModeClick = () => () => {
		new AnnotatedSceneActions().togglePlayMode()

		const flyThroughManager = this.props.flyThroughManager

		flyThroughManager.toggleLiveModePlay()
	}

	private makeOnLiveModeClick = () => () => {
		new AnnotatedSceneActions().toggleLiveMode()

		const flyThroughManager = this.props.flyThroughManager

		flyThroughManager.toggleLiveAndRecordedPlay()
	}

	private makeOnSelectDataSetClick = () => () => {
		this.props.openTrajectoryPickerFunction()
	}

	render(): JSX.Element {
		const {isLiveMode, isPlayMode, uiMenuVisible} = this.props
		const liveModeLabel = isLiveMode ? 'Go to Recorded' : 'Go to Live'
		const playModelLabel = isPlayMode ? 'Pause' : 'Play'
		const playModeIcon = isPlayMode ? 'pause' : 'play_arrow'
		const liveModeIcon = isLiveMode ? 'videocam' : 'my_location'

		return (<div id="menu">

			{uiMenuVisible &&
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
						<span>Select data set</span>
						<i className="material-icons mdc-button__icon" aria-hidden="true">playlist_play</i>
					</button>
				</menu>
			}

		</div>)
	}
}
