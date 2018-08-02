/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import Logger from '@/util/log'

const log = Logger(__filename)

/**
 * Load all the services
 */
export function loadServices(): void {
	log.info('Loading services')
	require('./UIMessageService')
}

/**
 * Load offline data for initial state
 */
function loadInitialState(): void {
	const AnnotatedSceneActions = require('mapper-annotated-scene/src/store/actions/AnnotatedSceneActions').default

	new AnnotatedSceneActions().loadAppState()
}

export async function loadStore(): Promise<void> {
	console.log('Starting to load store')

	/* eslint-disable-next-line typescript/no-var-requires */
	const annotatedSceneStore = require('mapper-annotated-scene/src/store/AppStore')

	try {
		annotatedSceneStore.loadAndInitStore()

		// Update state with data persisted offline
		loadInitialState()

		loadServices()
	} catch (err) {
		log.error('Failed to load store', err)
	}

	console.log('Finished loading store')
}
