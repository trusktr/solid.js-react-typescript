import {ActionMessage, DefaultLeafReducer} from "typedux"

import AnnotatedSceneState from "annotator-z-hydra-shared/src/store/state/AnnotatedSceneState"

export class AnnotatedSceneReducer extends DefaultLeafReducer<AnnotatedSceneState, ActionMessage<AnnotatedSceneState>> {

  constructor(){
    super(AnnotatedSceneState.Key, AnnotatedSceneState)
  }

  defaultState(o = {}):any {
    return AnnotatedSceneState.fromJS(o)
  }
}
