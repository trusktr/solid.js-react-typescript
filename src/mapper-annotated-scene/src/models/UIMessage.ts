/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

export enum UIMessageType {
	INFO,
	ERROR
}

/* eslint-disable-next-line no-use-before-define */
type Args = Partial<UIMessage>

export class UIMessage {
	id: string
	type: UIMessageType
	expiresAt: number
	message: string
	showProgress = false

	constructor(o: Args) {
		Object.assign(this, o)

		if (!this.id)
			this.id = require('uuid/v4')()
	}
}
export default UIMessage
