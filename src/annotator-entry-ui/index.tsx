/**
 *  Copyright 2017 Mapper Inc. Part of the mapper-annotator project.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import { configReady, getMeta } from '../config'
import * as $ from 'jquery'
import * as React from 'react'
import * as ReactDOM from 'react-dom'
import { AppContainer } from "react-hot-loader"
import App from './App'


Object.assign(global, {
	jQuery: $,
	$: $
})

import('jquery-ui-dist/jquery-ui')

// example of getMeta:
getMeta().then( ( { IN_SAFFRON } ) => {

	console.log( ' --- in Saffron:', !!IN_SAFFRON )

})

const root = $('#root')[0]

function main(): void {
	require( 'annotator-z-hydra-shared/src/services' ).loadStore()

	const
		{Provider} = require("react-redux")

	ReactDOM.render(
		<AppContainer>
			<Provider store={getRoadNetworkEditorReduxStore()}>
				<App />
			</Provider>
		</AppContainer>,
		root
	)
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
