/**
 *  Copyright 2017 Mapper Inc. Part of the mapper-annotator project.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as $ from 'jquery'
import '!!css-loader!jquery-ui-dist/jquery-ui.css'
import * as React from 'react'
import * as ReactDOM from 'react-dom'
import initUIControl from 'annotator-control-ui/UIControl'
import App from './App'
import {annotator} from 'annotator-entry-ui/Annotator'

declare global {
	// required by mapper-models/protobufjs
	type Long = number
}

Object.assign(global, {
	jQuery: $,
	$: $
})

require('jquery-ui-dist/jquery-ui')

$(main)

// This is injected by webpack, so it has no type definition:
// https://webpack.js.org/api/hot-module-replacement/
// tslint:disable-next-line:no-any
const hotReplacement = (module as any).hot
if (hotReplacement) {
	hotReplacement.accept()
	hotReplacement.dispose(cleanup)
}

function main(): void {
	ReactDOM.render( <App />, $('#root')[0] )
	initUIControl()
	annotator.initScene()
		.then(() => annotator.startAnimation())
}

function cleanup(): void {
	annotator.destroy()
	$("#root").empty()
}
