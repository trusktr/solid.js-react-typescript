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
import {getAnnotatedSceneReduxStore} from '@mapperai/annotated-scene/src/store/AppStore'
import {loadAnnotatedSceneStore} from '@mapperai/annotated-scene/src/services'
// import * as services from '@mapperai/annotated-scene/src/services'
import {Provider} from 'react-redux'
import {configReady} from '@src/config'

// This is needed because jQuery-ui depends on the globals existing.
Object.assign(global, {
	jQuery: $,
	$: $,
})

require('jquery-ui-dist/jquery-ui')

// otherwise, Saffron will mount the exported App for us.
export async function start(): Promise<void> {

	await configReady()

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

export async function stop(): Promise<void> {}
