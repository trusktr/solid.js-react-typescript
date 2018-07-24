/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import UIMessage from "mapper-annotated-scene/src/models/UIMessage"
import AnnotatedSceneState from "mapper-annotated-scene/src/store/state/AnnotatedSceneState"
import AnnotatedSceneActions from "@/mapper-annotated-scene/src/store/actions/AnnotatedSceneActions.ts"
import {getAnnotatedSceneStoreState} from '@/mapper-annotated-scene/src/store/AppStore'

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
