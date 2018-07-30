/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import {KeyboardEventHighlights} from './Messages'

// Strip down a KeyboardEvent to pass the essentials through IPC.
export function toKeyboardEventHighlights(event: KeyboardEvent): KeyboardEventHighlights {
	return {
		defaultPrevented: event.defaultPrevented,
		key: event.key,
		keyCode: event.keyCode,
		repeat: event.repeat,
	}
}
