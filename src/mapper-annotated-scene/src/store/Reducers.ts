/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as _ from 'lodash'
import {DefaultLeafReducer, ILeafReducer} from 'typedux'

/**
 * Load all the reducers from store/reducer
 * @returns {ILeafReducer<any, any>[]}
 */
export function loadReducers():ILeafReducer<any, any>[] {
	const ctxModule = require('./reducers/index')
	const modules:DefaultLeafReducer<any, any>[] = Object
		.keys(ctxModule)
		.filter(key => key.indexOf('Reducer') > 0 && _.isFunction(ctxModule[key]))
		.map(key => ctxModule[key])
	const reducers = filterReducers(modules)

	return reducers
}

function filterReducers(modules):DefaultLeafReducer<any, any>[] {
	const reducers = []

	for (const module of modules) {
		const
			ReducerClass = module
		const reducer = new ReducerClass()

		if (_.isFunction((reducer as any).leaf) && !reducers.find(it => (it as any).leaf() === reducer.leaf()))
			reducers.push(reducer as never)
	}

	return reducers
}
