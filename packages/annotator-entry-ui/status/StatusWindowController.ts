/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import {OrderedMap} from "immutable"
import {isNullOrUndefined} from "util"

// Records some status message text and displays it within an HTML element.
export class StatusWindowController {
	private enabled: boolean
	private statusElement: HTMLElement | null
	private messages: OrderedMap<string, string>

	constructor() {
		this.enabled = true
		this.statusElement = null
		this.messages = OrderedMap()
	}

	setContainer(statusElement: HTMLElement): StatusWindowController {
		this.statusElement = statusElement
		return this
	}

	setEnabled(enabled: boolean): StatusWindowController {
		if (this.enabled !== enabled) {
			if (this.statusElement)
				if (enabled)
					this.statusElement.style.visibility = 'visible'
				else
					this.statusElement.style.visibility = 'hidden'
			this.enabled = enabled
		}
		return this
	}

	setMessage(key: string, message: string): StatusWindowController {
		const oldMessage = this.messages.get(key)
		if (isNullOrUndefined(oldMessage) || oldMessage !== message) {
			this.messages = this.messages.set(key, message)
			this.render()
		}
		return this
	}

	private render(): void {
		if (!(this.enabled && this.statusElement))
			return

		let out = ''
		this.messages.forEach(value => {
			if (value !== '')
				out += value + '<br>'
		})
		this.statusElement.innerHTML = out
	}
}
