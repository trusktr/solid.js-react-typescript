/**
 *  Copyright 2017 Mapper Inc. Part of the mapper-annotator project.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */
//
// import config, { configReady } from '../config'
//
// async function main() {
// 	await configReady()
// 	console.log( 'got config ?????', config )
// }
//
// main()

import { configReady, getMeta } from '../config'
import * as $ from 'jquery'
import * as React from 'react'
import * as ReactDOM from 'react-dom'
import { AppContainer } from "react-hot-loader"
import App from './App'
import * as packageDotJson from '../../package.json'
import {getAnnotatedSceneReduxStore} from '@/mapper-annotated-scene/src/store/AppStore'

// This is needed because jQuery-ui depends on the globals existing.
Object.assign(global, {
	jQuery: $,
	$: $
})

import('jquery-ui-dist/jquery-ui')

// otherwise, Saffron will mount the exported App for us.
export async function start() {

	// if we're not in Saffron, then we manually mount our component into the DOM
	const { IN_SAFFRON } = await getMeta()

	await configReady()

	if (

		// if we're running Annotator standlone, outside of Saffron
		!IN_SAFFRON ||

		// or we're in saffron but we're running inside of a <webview>
		IN_SAFFRON && typeof ( packageDotJson as any ).htmlEntry !== 'undefined'

	) {

		await require( 'mapper-annotated-scene/src/services' ).loadStore()
		// await require('@/mapper-annotated-scene/FlyThroughManager').init()

		const root = $('#root')[0]

		const doRender = () => {
			const {Provider} = require("react-redux")

			ReactDOM.render(
				<AppContainer>
					<Provider store={getAnnotatedSceneReduxStore()}>
						<App />
					</Provider>
				</AppContainer>,
				root
			)
		}

		$( doRender )

	}

	// otherwise we're running in Saffron as a React component like how the
	// other existing Saffron apps do, so we don't need to do anything because
	// Saffron handles mounting the component.

}
export async function stop() {}
export const component = App
