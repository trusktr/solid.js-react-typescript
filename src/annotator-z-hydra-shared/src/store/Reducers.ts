import * as _ from "lodash"
import {DefaultLeafReducer, ILeafReducer} from "typedux"

/**
 * Load all the reducers from store/reducer
 * @returns {ILeafReducer<any, any>[]}
 */
export function loadReducers():ILeafReducer<any,any>[] {

  const ctxModule = require("./reducers/index")

  const modules:DefaultLeafReducer<any, any>[] = Object
    .keys(ctxModule)
    .filter(key => key.indexOf("Reducer") > 0 && _.isFunction(ctxModule[key]))
    .map(key => ctxModule[key])

  const reducers = filterReducers(modules)

  return reducers
}

function filterReducers(modules):DefaultLeafReducer<any, any>[] {
  let reducers = []
  for(const module of modules) {
    const
      reducerClass = module,
      reducer = new reducerClass()

    if(_.isFunction((reducer as any).leaf) && !reducers.find(it => (it as any).leaf() === reducer.leaf())){
      reducers.push(reducer as never) // FIXME, fix types
    }
  }
  return reducers
}

/**
 * Update the store with the new/updated reducers
 */
export function updateReducers() {
  getRoadNetworkEditorStore().replaceReducers(...loadReducers())
}
