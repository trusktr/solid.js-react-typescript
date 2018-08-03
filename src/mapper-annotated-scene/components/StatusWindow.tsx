/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as React from 'react'
import {typedConnect} from '../../mapper-annotated-scene/src/styles/Themed'
import AnnotatedSceneState from '../../mapper-annotated-scene/src/store/state/AnnotatedSceneState'
import {createStructuredSelector} from 'reselect'
import StatusWindowState from '../../mapper-annotated-scene/src/models/StatusWindowState'
import {getValue} from 'typeguard'
import {StatusKey} from '../../mapper-annotated-scene/src/models/StatusKey'
import StatusWindowActions from '../../mapper-annotated-scene/StatusWindowActions'
import {
	LocationServerStatusClient,
	LocationServerStatusLevel,
} from '../../kiosk/clients/LocationServerStatusClient'
import Logger from '../../util/log'
import {EventEmitter} from 'events'
import {Events} from '../../mapper-annotated-scene/src/models/Events'

const log = Logger(__filename)

interface StatusWindowProps {
	statusWindowState?: StatusWindowState
	eventEmitter: EventEmitter
}

interface IStatusWindowState {
	locationServerStatusDisplayTimer: number
	serverStatusDisplayTimer: number
	timeToDisplayHealthyStatusMs: number
	locationServerStatusClient: LocationServerStatusClient
}

@typedConnect(createStructuredSelector({
	statusWindowState: (state) => state.get(AnnotatedSceneState.Key).statusWindowState,
	}))
export default class StatusWindow extends React.Component<StatusWindowProps, IStatusWindowState> {
	constructor(props: StatusWindowProps) {
		super(props)

		const locationServerStatusClient = new LocationServerStatusClient(this.onLocationServerStatusUpdate)

		this.props.eventEmitter.on(Events.TILE_SERVICE_STATUS_UPDATE, (status) => {
			this.onTileServiceStatusUpdate(status)
		})

		this.state = {
			locationServerStatusDisplayTimer: 0,
			serverStatusDisplayTimer: 0,
			timeToDisplayHealthyStatusMs: 10000,
			locationServerStatusClient: locationServerStatusClient,
		}

		locationServerStatusClient.connect()
	}

	render(): JSX.Element {
		const {statusWindowState} = this.props
		const messages = getValue(() => statusWindowState && statusWindowState.messages, new Map<string, string>()) as Map<string, string>

		return (
			<div>
				{statusWindowState && statusWindowState.enabled &&
					<div id="status_window">

						{Array.from(messages).map(([name, message]) =>
							<div key={name}>
								{message}
							</div>
						)}

					</div>
				}

			</div>)
	}

	// TODO JOE To make things more re-usable, the following methods relating to specific types of messages should live outside of StatusWindow

	// Display a UI element to tell the user what is happening with the location server.
	// Error messages persist, and success messages disappear after a time-out.
	onLocationServerStatusUpdate: (level: LocationServerStatusLevel, serverStatus: string) => void =
		(level: LocationServerStatusLevel, serverStatus: string) => {
			let className = ''

			switch (level) {
				case LocationServerStatusLevel.INFO:
					className = 'statusOk'
					this.delayLocationServerStatus()
					break
				case LocationServerStatusLevel.WARNING:
					className = 'statusWarning'
					this.cancelHideLocationServerStatus()
					break
				case LocationServerStatusLevel.ERROR:
					className = 'statusError'
					this.cancelHideLocationServerStatus()
					break
				default:
					log.error('unknown LocationServerStatusLevel ' + LocationServerStatusLevel.ERROR)
			}

			const message = <div> Location status: <span className={className}> {serverStatus} </span> </div>

			new StatusWindowActions().setMessage(StatusKey.LOCATION_SERVER, message)
		}

	private delayLocationServerStatus = (): void => {
		this.cancelHideLocationServerStatus()
		this.hideLocationServerStatus()
	}

	private cancelHideLocationServerStatus = (): void => {
		if (this.state.locationServerStatusDisplayTimer) window.clearTimeout(this.state.locationServerStatusDisplayTimer)
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
		let className = ''
		let msg = ''

		if (tileServiceStatus) {
			className = 'statusOk'
			msg = 'Available'
			this.delayHideTileServiceStatus()
		} else {
			className = 'statusOk'
			msg = 'Unavailable'
			this.cancelHideTileServiceStatus()
		}

		const message = <div> Tile server status: <span className={className}> {msg} </span></div>

		new StatusWindowActions().setMessage(StatusKey.TILE_SERVER, message)
	}

	private delayHideTileServiceStatus = (): void => {
		this.cancelHideTileServiceStatus()
		this.hideTileServiceStatus()
	}

	private cancelHideTileServiceStatus = (): void => {
		if (this.state.serverStatusDisplayTimer) window.clearTimeout(this.state.serverStatusDisplayTimer)
	}

	private hideTileServiceStatus = (): void => {
		const serverStatusDisplayTimer = window.setTimeout(() => {
			new StatusWindowActions().setMessage(StatusKey.TILE_SERVER, '')
		}, this.state.timeToDisplayHealthyStatusMs)

		this.setState({serverStatusDisplayTimer})
	}
}
