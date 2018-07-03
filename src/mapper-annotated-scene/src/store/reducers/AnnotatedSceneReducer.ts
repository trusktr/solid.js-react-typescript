import {ActionMessage, DefaultLeafReducer} from "typedux"

import AnnotatedSceneState from "mapper-annotated-scene/src/store/state/AnnotatedSceneState"

export class AnnotatedSceneReducer extends DefaultLeafReducer<AnnotatedSceneState, ActionMessage<AnnotatedSceneState>> {

  constructor(){
    super(AnnotatedSceneState.Key, AnnotatedSceneState)
  }

  defaultState(o = {}):any {
    return AnnotatedSceneState.fromJS(o)
  }
}
