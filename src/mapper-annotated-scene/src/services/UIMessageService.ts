
import UIMessage from "annotator-z-hydra-shared/src/models/UIMessage"
import AnnotatedSceneState from "annotator-z-hydra-shared/src/store/state/AnnotatedSceneState"
import AnnotatedSceneActions from "AnnotatedSceneActions.ts"


function expireMessages() {
  const
    msgs = getAnnotatedSceneStoreState().get(AnnotatedSceneState.Key).messages as Array<UIMessage>,
    now = Date.now()

  msgs.forEach(msg => {
    if (now > msg.expiresAt) {
      new AnnotatedSceneActions().removeMessage(msg.id)
    }
  })
}

const expirationTimer = setInterval(expireMessages,1000)

if (module.hot) {
  module.hot.dispose(() => clearInterval(expirationTimer))
}
