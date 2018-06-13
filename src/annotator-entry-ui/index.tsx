/**
 *  Copyright 2017 Mapper Inc. Part of the mapper-annotator project.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import { configReady } from '../config'
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
console.log(' --- in Saffron:', inSaffron)

const root = $('#root')[0]

function main(): void {
	ReactDOM.render( <App />, root )
}

function cleanup(): void {
	ReactDOM.unmountComponentAtNode( root )
}

configReady().then( () => $( main ) )

// https://webpack.js.org/api/hot-module-replacement/
// TODO hot replacement isn't enabled or working at the moment
// tslint:disable-next-line:no-any
const hotReplacement = (module as any).hot
if (hotReplacement) {
	hotReplacement.accept()
	hotReplacement.dispose(cleanup)
}
