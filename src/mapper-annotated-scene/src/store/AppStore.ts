import {Map as IMMap} from "immutable"
import {compose, Store as ReduxStore, StoreEnhancer} from "redux"
import {ILeafReducer, ObservableStore, setStoreProvider} from "typedux"

import { loadReducers } from "mapper-annotated-scene/src/store/Reducers"
import { loadActions } from "mapper-annotated-scene/src/store/Actions"
import * as _ from "lodash"
import {getHot} from "mapper-annotated-scene/src/util/HotUtil"
import Logger from "@/util/log";


const log = Logger(__filename)// Create the global store as an ObservableStore (from typedux) which implements Redux store under the hood
let store:ObservableStore<any> = getHot(module, "store") as any

/**
 * Get the ObservableStore
 * @returns {ObservableStore<any>}
 */
export function getAnnotatedSceneStore():ObservableStore<any> {
  return store
}

/**
 * Retrieve redux store from the regular ObservableStore
 * @returns {Store<Map<string, any>>}
 */
export function getAnnotatedSceneReduxStore():ReduxStore<Map<string, any>> {
  return getAnnotatedSceneStore() && getAnnotatedSceneStore().getReduxStore()
}

/**
 * Get the current state
 *
 * @returns {Map<string,any>}
 */
export function getAnnotatedSceneStoreState():IMMap<string,any> {
  return getAnnotatedSceneStore() ? getAnnotatedSceneStore().getState() : IMMap()
}


function initStore():ObservableStore<any> {
  if(store != null) {
    log.error("Tried to init store multiple times")
    return store
  }

  loadActions()
  const reducers = loadReducers()

  const newObservableStore:ObservableStore<any> = ObservableStore.createObservableStore(
    reducers,
    compose.call(null) as StoreEnhancer<any>,
    undefined,
    null,
  )

  newObservableStore.rootReducer.onError = onError

  // Set the global store defined above
  store = newObservableStore
  //(Typedux) so that components are able to access state from connectors
  setStoreProvider(newObservableStore)
  return store
}

/**
 * Load the store from disk and setup
 * @returns {ObservableStore<any>}
 */
export function loadAndInitStore():ObservableStore<any>{
  return initStore()
}


/**
 * Log an error when it occurs in the reducer
 * @param {Error} err
 * @param {ILeafReducer<any, any>} reducer
 */
function onError(err:Error, reducer?:ILeafReducer<any, any>) {
  log.error("Reducer error occurred", reducer, err, err.stack)
}

_.assign( global, {
    getAnnotatedSceneStore,
} )

declare global {
    function getAnnotatedSceneStore():ObservableStore<any>
}
