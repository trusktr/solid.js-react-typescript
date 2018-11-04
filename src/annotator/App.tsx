/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import { S3tileServiceClientFactoryFactory } from '../annotator/SaffronTileServiceFactory'
import * as React from 'react'
import * as _ from 'lodash'
import { withStyles } from '@material-ui/core'
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

	sessionId: window.mapperSessionId || '58FCDB407765_20180802-171140434',
}

interface AppProps {}

interface AppState {
	tileServiceClientFactory: MapperTileServiceClientFactory | null
	sessionId: string
	env: string
	isSaffron: boolean
}

class App extends React.Component<AppProps, AppState> {
	constructor(props: AppProps) {
		super(props)

		// noinspection PointlessBooleanExpressionJS
		this.state = {
			tileServiceClientFactory: null,
			sessionId: defaultConfig.sessionId,
			env: 'prod',
			isSaffron: window.isSaffron === true,
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
				? S3tileServiceClientFactoryFactory(sessionId)
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
	private AnnotatorUI = (): JSX.Element => {
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

// TODO FIXME how do we use the material-ui types instead of the following `any` hack?
// Question on SO: https://stackoverflow.com/questions/53138167
// eslint-disable-next-line typescript/no-explicit-any
export default (withStyles(styles)(App) as any) as typeof App

function styles(): { [key: string]: React.CSSProperties } {
	return {
		'@global': {
			'.annotated-scene-container': {
				height: '100%',
				border: 0,
				padding: 0,
				margin: 0,
				width: '100%',
				fontFamily: 'Verdana, Geneva, sans-serif',
				overflowX: 'hidden',
				overflowY: 'hidden',

				'& canvas.annotated-scene-canvas': {
					width: '100%',
					height: '100%',
				},

				'& .hidden': {
					display: 'none',
				},

				'&, & *, & *::after, & *::before': {
					boxSizing: 'border-box',
				},
			},

			'#logo': {
				position: 'absolute',
				zIndex: 2,
				bottom: 0,
				left: 0,
				backgroundColor: 'transparent',
				paddingBottom: 0,
				paddingLeft: '12px',
			},

			'#menu': {
				position: 'absolute',
				right: 0,
				height: '100%',
				width: '250px',
				zIndex: 1,
				top: '50px',
				backgroundColor: 'transparent',
				overflowX: 'hidden',
				paddingTop: 0,
				paddingRight: '5px',
				pointerEvents: 'none',

				'& *': {
					pointerEvents: 'auto',
				},

				'&, & *, & *::after, & *::before': {
					boxSizing: 'border-box',
				},

				'& .statusOk': {
					color: '#0a0',
				},
				'& .statusWarning': {
					color: '#ffd260',
				},
				'& .statusError': {
					color: '#a00',
				},
				'& button': {
					width: '100%',
					textDecoration: 'none',
					outline: 0,
					color: '#fff',
					backgroundColor: '#4caf50',
					border: 0,
					borderRadius: '15px',
					'&.laneBtn': {
						width: '30px',
					},
					'&:active': {
						backgroundColor: '#3e8e41',
						transform: 'translateY(4px)',
					},
					'&:hover': {
						backgroundColor: '#3e8e41',
					},
				},
				'& .fieldset_content_style': {
					width: '100%',
					height: '100%',
					marginTop: '2px',
					textAlign: 'center',
				},
				'& .div_buttons_group': {
					marginTop: '2px',
					textAlign: 'center',
				},
				'& .div_properties': {
					marginTop: '2px',
					textAlign: 'center',
				},
				'& .div_glue, & .div_help': {
					marginTop: '2px',
					textAlign: 'left',
					fontSize: 'x-small',
				},
				'& .div_help': {
					marginTop: 0,
				},
				'& .ui-btn': {
					fontSize: '12px',
				},
				'& .label_style, & .select_style': {
					textAlign: 'left',
					padding: 0,
					margin: 0,
					float: 'left',
					fontSize: 'x-small',
				},
				'& .label_style': {
					border: 0,
					backgroundColor: 'transparent',
					width: '60%',
				},
				'& .select_style': {
					width: '40%',
				},
				'& .accordion': {
					outline: 0,
					borderRadius: '10px',
					marginBottom: '2px',
					backgroundColor: '#f4511e',
					border: 0,
					color: '#fff',
					textAlign: 'left',
					fontSize: '15px',
					padding: 0,
					width: 'auto',
					cursor: 'pointer',
				},
				'& .dropdown_head': {
					margin: '3px',
					padding: '2px',
					fontSize: '12px',
					'&:after': {
						content: "'\\02795'", // TODO? it was '\02795' in the CSS
						fontSize: '10px',
						paddingRight: '5px',
						paddingTop: '2px',
						float: 'right',
					},
					'&:active': {
						'&:after': {
							content: "'-'",
						},
					},
				},
				'& .dropdown_body': {
					height: 'auto',
					padding: '5px',
					borderRadius: '5px',
					backgroundColor: '#faebd7',
					color: '#000',
					display: 'none',
					overflow: 'auto',
				},
			},

			'#status_window': {
				position: 'absolute',
				right: 0,
				bottom: 0,
				backgroundColor: 'rgba(255, 255, 255, 0.5)',
				padding: '5px',
				zIndex: 3,
			},

			'#menu_control': {
				backgroundColor: 'transparent',
				position: 'absolute',
				zIndex: 1,
				top: 0,
				right: 0,
				paddingRight: '5px',
				textAlign: 'right',
				visibility: 'hidden',
				height: '50px',
				width: '150px',
			},

			'button.menu_btn': {
				backgroundColor: 'transparent',
				height: '40px',
				width: '40px',
				fontSize: 'x-large',
				border: 0,

				'&:hover': {
					fontSize: 'xx-large',
					backgroundColor: 'transparent',
				},
				'&:active': {
					fontSize: 'xx-large',
				},
			},
		},
	}
}
