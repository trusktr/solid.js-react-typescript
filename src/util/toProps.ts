/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import AnnotatedSceneState from '../mapper-annotated-scene/src/store/state/AnnotatedSceneState'
import {createStructuredSelector} from 'reselect'

/* eslint-disable typescript/explicit-function-return-type */
export default
function toProps(...args) {
	const stateMap = {}

	for (const arg of args) stateMap[arg] = (state) => state.get(AnnotatedSceneState.Key)[arg]

	return createStructuredSelector(stateMap)
}
