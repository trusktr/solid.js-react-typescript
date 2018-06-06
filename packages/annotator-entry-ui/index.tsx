/**
 *  Copyright 2017 Mapper Inc. Part of the mapper-annotator project.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as $ from 'jquery'
import * as React from 'react'
import * as ReactDOM from 'react-dom'
import App from './App'

Object.assign(global, {
	jQuery: $,
	$: $
})

import('jquery-ui-dist/jquery-ui')

const inSaffron = typeof __SAFFRON__ !== 'undefined' ? __SAFFRON__ : false

if ( !inSaffron ) {
	$(main)

	// This is injected by webpack, so it has no type definition:
	// https://webpack.js.org/api/hot-module-replacement/
	// tslint:disable-next-line:no-any
	const hotReplacement = (module as any).hot
	if (hotReplacement) {
		hotReplacement.accept()
		hotReplacement.dispose(cleanup)
	}

	const root = $('#root')[0]

	function main(): void {
		ReactDOM.render( <App />, root )
	}

	function cleanup(): void {
		ReactDOM.unmountComponentAtNode( root )
	}
}

/// for Saffron {
async function start() {}
async function stop() {}

export {
	App as component,
	start,
	stop,
}
/// }
