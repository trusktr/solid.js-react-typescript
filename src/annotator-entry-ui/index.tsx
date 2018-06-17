/**
 *  Copyright 2017 Mapper Inc. Part of the mapper-annotator project.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import { configReady, getMeta } from '../config'
import * as $ from 'jquery'
import * as React from 'react'
import * as ReactDOM from 'react-dom'
import App from './App'

Object.assign(global, {
	jQuery: $,
	$: $
})

import('jquery-ui-dist/jquery-ui')

// otherwise, Saffron will mount the exported App for us.
export async function start() {

	// if we're not in Saffron, then we manually mount our component into the DOM
	const { IN_SAFFRON } = await getMeta()

	if ( !IN_SAFFRON ) {

		const root = $('#root')[0]
		await configReady()
		$( () => ReactDOM.render( <App />, root ) )

	}
	else {

		await configReady()

	}

}
export async function stop() {}
export const component = App

// https://webpack.js.org/api/hot-module-replacement/
// TODO hot replacement isn't enabled or working at the moment
// tslint:disable-next-line:no-any
// const hotReplacement = (module as any).hot
// if (hotReplacement) {
// 	hotReplacement.accept()
// 	hotReplacement.dispose(cleanup)
// }
// function cleanup(): void {
// 	ReactDOM.unmountComponentAtNode( root )
// }
