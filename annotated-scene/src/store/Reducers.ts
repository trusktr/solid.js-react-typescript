/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

/* eslint-disable typescript/no-explicit-any */

import * as _ from 'lodash'
import {DefaultLeafReducer, ILeafReducer} from 'typedux'
import * as reducers from './reducers/index'

/**
 * Load all the reducers from store/reducer
 * @returns {ILeafReducer<any, any>[]}
 */
export function loadReducers(): ILeafReducer<any, any>[] {
	const modules: DefaultLeafReducer<any, any>[] = Object.keys(reducers)
		.filter(key => key.indexOf('Reducer') > 0 && _.isFunction(reducers[key]))
		.map(key => reducers[key])

	return filterReducers(modules)
}

function filterReducers(modules): DefaultLeafReducer<any, any>[] {
	const result = []

	for (const module of modules) {
		const ReducerClass = module
		const reducer = new ReducerClass()

		if (_.isFunction((reducer as any).leaf) && !result.find(it => (it as any).leaf() === reducer.leaf()))
			result.push(reducer as never)
	}

	return result
}
