/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

export enum UIMessageType {
	INFO,
	ERROR
}
export class UIMessage {
	id:string
	type:UIMessageType
	expiresAt:number
	message:string
	showProgress:boolean = false

	constructor(o:any) {
		Object.assign(this, o)

		if (!this.id)
			this.id = require('uuid/v4')()
	}
}
export default UIMessage
