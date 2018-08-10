/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as React from 'react'
import {typedConnect} from '../styles/Themed'
import StatusWindowState from '../models/StatusWindowState'
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
		const messages = (statusWindowState && statusWindowState.messages) || new Map<string, string | JSX.Element>()

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
