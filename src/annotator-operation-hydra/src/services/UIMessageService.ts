
import UIMessage from "annotator-operation-hydra/src/models/UIMessage"
import RoadNetworkEditorState from "annotator-operation-hydra/src/store/state/RoadNetworkEditorState"
import RoadNetworkEditorActions from "annotator-operation-hydra/src/store/actions/RoadNetworkEditorActions"


function expireMessages() {
  const
    msgs = getRoadNetworkEditorStoreState().get(RoadNetworkEditorState.Key).messages as Array<UIMessage>,
    now = Date.now()

  msgs.forEach(msg => {
    if (now > msg.expiresAt) {
      new RoadNetworkEditorActions().removeMessage(msg.id)
    }
  })
}

const expirationTimer = setInterval(expireMessages,1000)

if (module.hot) {
  module.hot.dispose(() => clearInterval(expirationTimer))
}
