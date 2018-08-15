/**
 *  Copyright 2017 Mapper Inc. Part of the mapper-annotator project.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import './env'
import './disable-logger'
import 'jquery-ui-dist/jquery-ui.css' // eslint-disable-line import/no-webpack-loader-syntax
import './style.css'
import * as $ from 'jquery'
import * as React from 'react'
import * as ReactDOM from 'react-dom'
import App from './App'
import * as packageDotJson from '../../package.json'
import {getAnnotatedSceneReduxStore} from '@mapperai/annotated-scene/src/store/AppStore'
import {loadAnnotatedSceneStore} from '@mapperai/annotated-scene/src/services'
// import * as services from '@mapperai/annotated-scene/src/services'
import {Provider} from 'react-redux'
import {getMeta, configReady} from '@src/config'

// This is needed because jQuery-ui depends on the globals existing.
Object.assign(global, {
	jQuery: $,
	$: $,
})

require('jquery-ui-dist/jquery-ui')

// otherwise, Saffron will mount the exported App for us.
export async function start(): Promise<void> {
	// if we're not in Saffron, then we manually mount our component into the DOM
	const {IN_SAFFRON} = await getMeta()

	await configReady()

	if (
		// TODO JOE this will change, the webview will be loaded in a React app inside Saffron

		// if we're running Annotator standlone, outside of Saffron
		!IN_SAFFRON ||

		// or we're in saffron but we're running inside of a <webview>
		/* eslint-disable-next-line typescript/no-explicit-any */
		(IN_SAFFRON && typeof (packageDotJson as any).htmlEntry !== 'undefined')

	) {
		// services.loadStore()
		loadAnnotatedSceneStore()

		const root = $('#root')[0]

		const doRender = (): void => {
			ReactDOM.render(
				<Provider store={getAnnotatedSceneReduxStore()}>
					<App />
				</Provider>,
				root
			)
		}

		$(doRender)
	}

	// otherwise we're running in Saffron as a React component like how the
	// other existing Saffron apps do, so we don't need to do anything because
	// Saffron handles mounting the component.
}

export async function stop(): Promise<void> {}
export const component = App
