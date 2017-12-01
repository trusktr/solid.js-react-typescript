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

import * as TypeLogger from 'typelogger'
import {annotator} from 'annotator-entry-ui/Annotator'

// tslint:disable-next-line:no-any
TypeLogger.setLoggerOutput(console as any)
const log = TypeLogger.getLogger(__filename)

declare global {
	type Long = number
}

const root = $("#root")

export function onLoad(): void {
	require("annotator-control-ui/UIControl")
	log.info('loading ')
	annotator.initScene()
	annotator.animate()
}

$(onLoad)

if (module.hot) {
	module.hot.dispose(() => root.empty())
	module.hot.accept()
}
