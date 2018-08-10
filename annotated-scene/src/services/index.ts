/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import Logger from '../util/log'
import * as annotatedSceneStore from '../store/AppStore'
import AnnotatedSceneActions from '../store/actions/AnnotatedSceneActions'

const log = Logger(__filename)

function loadInitialState(): void {
	new AnnotatedSceneActions().loadAppState()
}

export function loadStore(): void {
	log.debug('Starting to load store')

	try {
		annotatedSceneStore.loadAndInitStore()
		loadInitialState()
	} catch (err) {
		log.error('Failed to load store', err)
	}

	log.debug('Finished loading store')
}
