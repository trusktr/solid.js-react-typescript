/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as React from 'react'
import {sprintf} from 'sprintf-js'
import '!!css-loader!jquery-ui-dist/jquery-ui.css'
import '@/annotator-entry-ui/style.scss'
import {typedConnect} from "@/annotator-z-hydra-shared/src/styles/Themed";
import RoadEditorState from "annotator-z-hydra-shared/src/store/state/RoadNetworkEditorState"
import {createStructuredSelector} from "reselect"
import StatusWindowState from "@/annotator-z-hydra-shared/src/models/StatusWindowState"
import {getValue} from "typeguard";
import * as THREE from "three";
import {StatusKey} from "@/annotator-z-hydra-shared/src/models/StatusKey";
import StatusWindowActions from "@/annotator-z-hydra-shared/StatusWindowActions";
import {UtmCoordinateSystem} from "@/annotator-entry-ui/UtmCoordinateSystem";

interface StatusWindowProps {
	statusWindowState ?: StatusWindowState
	liveModeEnabled ?: boolean
	playModeEnabled ?: boolean
  utmCoordinateSystem: UtmCoordinateSystem
}

interface IStatusWindowState {}


@typedConnect(createStructuredSelector({
	statusWindowState: (state) => state.get(RoadEditorState.Key).statusWindowState,
}))
export default class StatusWindow extends React.Component<StatusWindowProps, IStatusWindowState> {

	constructor(props: StatusWindowProps) {
		super(props)
	}

	updateCurrentLocationStatusMessage(positionUtm: THREE.Vector3): void {
    // This is a hack to allow data with no coordinate reference system to pass through the UTM classes.
    // Data in local coordinate systems tend to have small values for X (and Y and Z) which are invalid in UTM.
    if (positionUtm.x > 100000) { // If it looks local, don't convert to LLA. TODO fix this.
      const positionLla = this.props.utmCoordinateSystem.utmVectorToLngLatAlt(positionUtm)
      const messageLla = sprintf('LLA: %.4fE %.4fN %.1falt', positionLla.x, positionLla.y, positionLla.z)

      // this.statusWindow.setMessage(statusKey.currentLocationLla, messageLla)
      new StatusWindowActions().setMessage(StatusKey.CURRENT_LOCATION_LLA, messageLla)
    }
    const messageUtm = sprintf('UTM %s: %dE %dN %.1falt', this.props.utmCoordinateSystem.utmZoneString(), positionUtm.x, positionUtm.y, positionUtm.z)
    // this.statusWindow.setMessage(statusKey.currentLocationUtm, messageUtm)
    new StatusWindowActions().setMessage(StatusKey.CURRENT_LOCATION_UTM, messageUtm)
  }


	render(): JSX.Element {
		const {statusWindowState} = this.props
		// const isEnabled = getValue(() => statusWindowState.enabled, false)
		const messages = getValue(() => statusWindowState && statusWindowState.messages, new Map<string, string>()) as Map<string, string>

		let out = ''
		messages.forEach(value => {
			if (value !== '')
				out += value + '<br>'
		})
		// this.statusElement.innerHTML = out
		// const laneWidth = $('#lp_width_value')

		// @TODO show/hide internal parts of the component based on the value of isEnabled
		return (
			<div id="status_window">
				STATUS WINDOW <br/>
				<span dangerouslySetInnerHTML={{__html: out}} />
			</div>
		)
	}
}
