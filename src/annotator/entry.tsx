/**
 *  Copyright 2017 Mapper Inc. Part of the mapper-annotator project.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import './env'
import './disable-logger'
import 'jquery-ui-dist/jquery-ui.css' // eslint-disable-line import/no-webpack-loader-syntax
import './style.scss'
import * as $ from 'jquery'
import * as React from 'react'
import * as ReactDOM from 'react-dom'
import App from './App'
import {Deferred,loadAnnotatedSceneStore,getAnnotatedSceneReduxStore} from '@mapperai/mapper-annotated-scene'

import {Provider} from 'react-redux'
import {configReady} from 'annotator-config'

// This is needed because jQuery-ui depends on the globals existing.
Object.assign(global, {
	jQuery: $,
	$: $,
})

require('jquery-ui-dist/jquery-ui')

let deferred:Deferred<React.Component>

// otherwise, Saffron will mount the exported App for us.
async function start(isSaffron:boolean = false): Promise<React.Component> {
	if (deferred) {
		return deferred.promise
	}
	
	deferred = new Deferred<React.Component>()
	
	await configReady()

	// services.loadStore()
	loadAnnotatedSceneStore()

	const root = $('#root')[0]
	
	const doRender = () => {
		const component = <Provider store={getAnnotatedSceneReduxStore()}>
			<App />
		</Provider>
		
		if (!isSaffron) {
			ReactDOM.render(
				component,
				root
			)
		}
		
		deferred.resolve(component as any)
	}

	$(doRender)
	
	return await deferred.promise
}

async function stop(): Promise<void> {}

module.exports = {
	start,stop
}
