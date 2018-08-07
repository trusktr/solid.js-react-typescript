/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

/* eslint-disable-next-line no-use-before-define */
type Args = Partial<StatusWindowState>

export default class StatusWindowState {
	constructor(o: Args = {}) {
		Object.assign(this, o)
	}

	enabled: boolean
	messages: Map<string, string | JSX.Element>
}
