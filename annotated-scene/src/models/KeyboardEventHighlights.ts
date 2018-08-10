/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

// Minimal subset of KeyboardEvent which is interesting to Annotator.
interface KeyboardEventHighlights {
	defaultPrevented: boolean
	key: string
	keyCode: number
	repeat: boolean
	altKey: boolean
	ctrlKey: boolean
	metaKey: boolean
}

export default KeyboardEventHighlights
