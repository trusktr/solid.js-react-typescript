/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as React from 'react'
import {typedConnect} from '@mapperai/mapper-annotated-scene/src/styles/Themed'
import AnnotatedSceneActions from '@mapperai/mapper-annotated-scene/src/store/actions/AnnotatedSceneActions'
import FlyThroughManager from '../../kiosk/components/FlyThroughManager'
import toProps from '@mapperai/mapper-annotated-scene/src/util/toProps'

interface KioskViewProps {
	isLiveMode?: boolean
	isPlayMode?: boolean
	flyThroughManager: FlyThroughManager
	openTrajectoryPickerFunction(): void
	uiMenuVisible?: boolean
}

interface KioskViewState {}

@typedConnect(toProps(
	'isLiveMode',
	'isPlayMode',
	'uiMenuVisible',
))
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
