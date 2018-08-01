/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

export default class StatusWindowState {
	constructor(o: any = {}) {
		Object.assign(this, o)
	}

	enabled: boolean
	messages: Map<string, string | JSX.Element>
}
