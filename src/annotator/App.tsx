/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import { S3TileServiceClientFactory } from '../annotator/SaffronTileServiceFactory'
import * as React from 'react'
import * as _ from 'lodash'
import {
	makeS3TileServiceClientFactory,
	StatusWindowActions,
	AnnotatedSceneActions,
	MapperTileServiceClientFactory,
} from '@mapperai/mapper-annotated-scene'

import Annotator from '../annotator/Annotator'
// TODO JOE eventually move this into the shared lib
import logo from '../annotator-assets/images/signature_with_arrow_white.png'

// readonly credentials for map tiles
const defaultConfig = {
	credentialProvider: async () => ({
		accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'AKIAJST3KIWMFTLEL6WA',
		secretAccessKey:
			process.env.AWS_SECRET_ACCESS_KEY ||
			'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',
	}),

	//bucketProvider: () => 'mapper-jglanz-tiles',
	makeBucketProvider: env => () => `mapper-${env || 'prod'}-device-sessions`,

	sessionId:
		(window as any).mapperSessionId || '58FCDB407765_20180802-171140434',
}

interface AppProps {}

interface AppState {
	tileServiceClientFactory: MapperTileServiceClientFactory | null
	sessionId: string
	env: string
	isSaffron: boolean
}

export default class App extends React.Component<AppProps, AppState> {
	constructor(props: AppProps) {
		super(props)

		// noinspection PointlessBooleanExpressionJS
		this.state = {
			tileServiceClientFactory: null,
			sessionId: defaultConfig.sessionId,
			env: 'prod',
			isSaffron: (window as any).isSaffron === true,
		}
	}

	private makeOnStatusWindowClick = () => () => {
		new StatusWindowActions().toggleEnabled()
	}

	private makeOnMenuClick = () => () => {
		new AnnotatedSceneActions().toggleUIMenuVisible()
	}

	/**
	 * Update sessionId
	 */
	private onSessionIdChange = event =>
		this.setState({
			sessionId: event.target.value,
		})

	/**
	 * On env change
	 *
	 * @param event
	 */
	private onEnvChange = event =>
		this.setState({
			env: event.target.value,
		})

	/**
	 * Start annotator
	 */
	private startAnnotator = () => {
		const { isSaffron, sessionId, env } = this.state
		if (_.isEmpty(sessionId) || (isSaffron && _.isEmpty(env))) {
			alert('You must provide all fields')
			return
		}

		this.setState({
			tileServiceClientFactory: isSaffron
				? S3TileServiceClientFactory(sessionId)
				: makeS3TileServiceClientFactory(
						defaultConfig.credentialProvider,
						defaultConfig.makeBucketProvider(env),
						sessionId,
				  ),
		})
	}

	/**
	 * Render annotator
	 *
	 * @returns {any}
	 */
	private AnnotatorUI = () => {
		const { tileServiceClientFactory } = this.state
		return (
			<React.Fragment>
				<Annotator tileServiceClientFactory={tileServiceClientFactory!} />
				<div id="logo">
					<img src={logo} height="30px" width="auto" />
				</div>
				<div id="menu_control">
					<button
						id="status_window_control_btn"
						className="menu_btn"
						onClick={this.makeOnStatusWindowClick()}
					>
						{' '}
						&#x2139;{' '}
					</button>
					<button
						id="menu_control_btn"
						className="menu_btn"
						onClick={this.makeOnMenuClick()}
					>
						{' '}
						&#9776;{' '}
					</button>
				</div>
			</React.Fragment>
		)
	}

	private SetupForm = () => {
		const { isSaffron, sessionId, env } = this.state
		return (
			<form onSubmit={this.startAnnotator}>
				{/* ENV ONLY NON SAFFRON */}
				{!isSaffron && (
					<React.Fragment>
						<div>ENV</div>
						<div>
							<input
								type="text"
								onChange={this.onEnvChange}
								value={env}
								defaultValue="dev"
							/>
						</div>
					</React.Fragment>
				)}

				<div>Session ID</div>
				<div>
					<input
						id="sessionId"
						value={sessionId}
						onChange={this.onSessionIdChange}
						defaultValue={'58FCDB407765_20180802-171140434'}
					/>
				</div>
				<button type="submit">Annotate</button>
			</form>
		)
	}

	render(): JSX.Element {
		const { tileServiceClientFactory } = this.state
		return (
			<React.Fragment>
				{!tileServiceClientFactory ? <this.SetupForm /> : <this.AnnotatorUI />}
			</React.Fragment>
		)
	}
}
