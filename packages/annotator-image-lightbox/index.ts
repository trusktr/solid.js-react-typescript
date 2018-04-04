/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

const $ = require('jquery')
Object.assign(global, {
	jQuery: $,
	$: $
})
require('jquery-ui-dist/jquery-ui')
require('!!css-loader!jquery-ui-dist/jquery-ui.css')

import {lightbox} from 'annotator-image-lightbox/LightboxWindowUI'

function onLoad(): void {
	console.info('loading annotator-image-lightbox')
	lightbox.bind()
}

$(onLoad)
