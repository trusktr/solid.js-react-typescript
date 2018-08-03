/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import UIMessage from '../models/UIMessage'
import AnnotatedSceneState from '../store/state/AnnotatedSceneState'
import AnnotatedSceneActions from '../store/actions/AnnotatedSceneActions'
import {getAnnotatedSceneStoreState} from '../store/AppStore'

function expireMessages(): void {
	const
		msgs = getAnnotatedSceneStoreState().get(AnnotatedSceneState.Key).messages as Array<UIMessage>
	const now = Date.now()

	msgs.forEach(msg => {
		if (now > msg.expiresAt)
			new AnnotatedSceneActions().removeMessage(msg.id)
	})
}

const expirationTimer = setInterval(expireMessages, 1000)

if (module.hot)
	module.hot.dispose(() => clearInterval(expirationTimer))
