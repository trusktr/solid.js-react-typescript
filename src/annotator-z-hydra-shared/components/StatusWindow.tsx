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
import {
    LocationServerStatusClient,
    LocationServerStatusLevel
} from "@/annotator-entry-ui/status/LocationServerStatusClient";
import Logger from "@/util/log";

const log = Logger(__filename)

interface StatusWindowProps {
    statusWindowState ?: StatusWindowState
    liveModeEnabled ?: boolean
    playModeEnabled ?: boolean
    utmCoordinateSystem: UtmCoordinateSystem
}

interface IStatusWindowState {
    locationServerStatusDisplayTimer: number
	  serverStatusDisplayTimer: number
    timeToDisplayHealthyStatusMs: number
    locationServerStatusClient: LocationServerStatusClient
}


@typedConnect(createStructuredSelector({
    statusWindowState: (state) => state.get(RoadEditorState.Key).statusWindowState,
}))
export default class StatusWindow extends React.Component<StatusWindowProps, IStatusWindowState> {

    constructor(props: StatusWindowProps) {
        super(props)

        const locationServerStatusClient = new LocationServerStatusClient(this.onLocationServerStatusUpdate)

        this.state = {
            locationServerStatusDisplayTimer: 0,
			serverStatusDisplayTimer: 0,
            timeToDisplayHealthyStatusMs: 10000,
            locationServerStatusClient: locationServerStatusClient
        }

        locationServerStatusClient.connect()

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



	// TODO (Joe): To make things more re-usable, It would be nice if the
	// following methods relating to specific types of messages would live
	// outside of StatusWindow inside of the app code using the StatusWindow,
	// and each app would tell StatusWindow when to show/hide messages. It'd be
	// similar to a Toast widget (or SnackBar in material-ui), where it is not
	// aware of what messages you give it from the outside, it only displays
	// them.


    // Display a UI element to tell the user what is happening with the location server.
    // Error messages persist, and success messages disappear after a time-out.
    onLocationServerStatusUpdate: (level: LocationServerStatusLevel, serverStatus: string) => void =
        (level: LocationServerStatusLevel, serverStatus: string) => {

        let message = 'Location status: '
        switch (level) {
            case LocationServerStatusLevel.INFO:
            message += '<span class="statusOk">' + serverStatus + '</span>'
            this.delayLocationServerStatus()
            break
            case LocationServerStatusLevel.WARNING:
            message += '<span class="statusWarning">' + serverStatus + '</span>'
            this.cancelHideLocationServerStatus()
            break
            case LocationServerStatusLevel.ERROR:
            message += '<span class="statusError">' + serverStatus + '</span>'
            this.cancelHideLocationServerStatus()
            break
            default:
            log.error('unknown LocationServerStatusLevel ' + LocationServerStatusLevel.ERROR)
        }
        new StatusWindowActions().setMessage(StatusKey.LOCATION_SERVER, message)
    }


    private delayLocationServerStatus = (): void => {
        this.cancelHideLocationServerStatus()
        this.hideLocationServerStatus()
    }

    private cancelHideLocationServerStatus = (): void => {
        if (this.state.locationServerStatusDisplayTimer)
        window.clearTimeout(this.state.locationServerStatusDisplayTimer)
    }

    private hideLocationServerStatus = (): void => {
        const locationServerStatusDisplayTimer = window.setTimeout(() => {
            new StatusWindowActions().setMessage(StatusKey.LOCATION_SERVER, '')
        }, this.state.timeToDisplayHealthyStatusMs)

        this.setState({locationServerStatusDisplayTimer})
    }

	// Display a UI element to tell the user what is happening with tile server. Error messages persist,
	// and success messages disappear after a time-out.
	onTileServiceStatusUpdate: (tileServiceStatus: boolean) => void = (tileServiceStatus: boolean) => {
		let message = 'Tile server status: '
		if (tileServiceStatus) {
			message += '<span class="statusOk">Available</span>'
			this.delayHideTileServiceStatus()
		} else {
			message += '<span class="statusError">Unavailable</span>'
			this.cancelHideTileServiceStatus()
		}

		new StatusWindowActions().setMessage(StatusKey.TILE_SERVER, message)
	}

	private delayHideTileServiceStatus = (): void => {
		this.cancelHideTileServiceStatus()
		this.hideTileServiceStatus()
	}

	private cancelHideTileServiceStatus = (): void => {
		if (this.state.serverStatusDisplayTimer)
		window.clearTimeout(this.state.serverStatusDisplayTimer)
	}

	private hideTileServiceStatus = (): void => {
		const serverStatusDisplayTimer = window.setTimeout(() => {
			new StatusWindowActions().setMessage(StatusKey.TILE_SERVER, '')
		}, this.state.timeToDisplayHealthyStatusMs)

		this.setState({serverStatusDisplayTimer})
	}

}
