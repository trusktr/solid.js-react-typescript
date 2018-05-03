/**
 *  Copyright 2017 Mapper Inc. Part of the mapper-annotator project.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

const $ = require('jquery')
Object.assign(global, {
	jQuery: $,
	$: $
})
require('jquery-ui-dist/jquery-ui')
require('!!css-loader!jquery-ui-dist/jquery-ui.css')

import * as React from 'react'
import * as ReactDOM from 'react-dom'
import App from './App'
import * as TypeLogger from 'typelogger'
import {annotator} from 'annotator-entry-ui/Annotator'

// tslint:disable-next-line:no-any
TypeLogger.setLoggerOutput(console as any)
const log = TypeLogger.getLogger(__filename)

declare global {
	// required by mapper-models/protobufjs
	type Long = number
}

function onLoad(): void {
	ReactDOM.render( <App />, $('#root')[0] )
	require("annotator-control-ui/UIControl")
	annotator.initScene()
		.then(() => annotator.startAnimation())
}

$(onLoad)

function cleanup(): void {
	annotator.destroy()
	$("#root").empty()
}

// This is injected by webpack, so it has no type definition:
// https://webpack.js.org/api/hot-module-replacement/
// tslint:disable-next-line:no-any
const hotReplacement = (module as any).hot
if (hotReplacement) {
	hotReplacement.accept()
	hotReplacement.dispose(cleanup)
}
