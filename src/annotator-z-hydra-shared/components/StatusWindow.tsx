/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as React from 'react'
import '!!css-loader!jquery-ui-dist/jquery-ui.css'
import '@/annotator-entry-ui/style.scss'
import {typedConnect} from "@/annotator-z-hydra-shared/src/styles/Themed";
import RoadEditorState from "annotator-z-hydra-shared/src/store/state/RoadNetworkEditorState"
import {createStructuredSelector} from "reselect"
import RoadNetworkEditorActions from "@/annotator-z-hydra-shared/src/store/actions/RoadNetworkEditorActions";
import StatusWindowState from "@/annotator-z-hydra-shared/src/models/StatusWindowState"
import {getValue} from "typeguard";

interface StatusWindowProps {
	statusWindowState ?: StatusWindowState
	liveModeEnabled ?: boolean
	playModeEnabled ?: boolean
}

interface IStatusWindowState {}


@typedConnect(createStructuredSelector({
	statusWindowState: (state) => state.get(RoadEditorState.Key).statusWindowState,
}))
export default class StatusWindow extends React.Component<StatusWindowProps, IStatusWindowState> {

	constructor(props: StatusWindowProps) {
		super(props)
	}


	render(): JSX.Element {
		const {statusWindowState} = this.props
		const isEnabled = getValue(() => statusWindowState.enabled, false)
		const messages = getValue(() => statusWindowState.messages, new Map<string, string>())

		// @TODO show/hide internal parts of the component based on the value of isEnabled
		return (
			<div id="status_window">
				HELLO FROM THE STATUS WINDOW
			</div>
		)
	}
}
