import {ActionMessage, DefaultLeafReducer} from "typedux"

import RoadNetworkEditorState from "annotator-z-hydra-shared/src/store/state/RoadNetworkEditorState"

export class RoadNetworkEditorReducer extends DefaultLeafReducer<RoadNetworkEditorState, ActionMessage<RoadNetworkEditorState>> {

  constructor(){
    super(RoadNetworkEditorState.Key, RoadNetworkEditorState)
  }

  defaultState(o = {}):any {
    return RoadNetworkEditorState.fromJS(o)
  }
}
