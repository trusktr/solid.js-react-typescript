/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

/* eslint-disable typescript/no-explicit-any */

import {ActionMessage, DefaultLeafReducer} from 'typedux'
import AnnotatedSceneState from '../state/AnnotatedSceneState'

export class AnnotatedSceneReducer extends DefaultLeafReducer<AnnotatedSceneState, ActionMessage<AnnotatedSceneState>> {
	constructor() {
		super(AnnotatedSceneState.Key, AnnotatedSceneState)
	}

	defaultState(o = {}): any {
		return AnnotatedSceneState.fromJS(o)
	}
}
