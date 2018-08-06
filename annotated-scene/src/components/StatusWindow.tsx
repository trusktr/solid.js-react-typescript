/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as React from 'react'
import {typedConnect} from '../styles/Themed'
import StatusWindowState from '../models/StatusWindowState'
import {getValue} from 'typeguard'
import toProps from '../util/toProps'

interface StatusWindowProps {
	statusWindowState?: StatusWindowState
}

interface IStatusWindowState {
}

@typedConnect(toProps(
	'statusWindowState',
))
export default class StatusWindow extends React.Component<StatusWindowProps, IStatusWindowState> {
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
}
