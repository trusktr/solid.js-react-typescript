/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import {v4 as UUID} from 'uuid'

// Channel names for communication between Electron renderer processes
export const channel = {
	annotatorWrapper: UUID(),
	imageClick: UUID(),
	imageEditState: UUID(),
	keyDownEvent: UUID(),
	keyUpEvent: UUID(),
	lightboxState: UUID(),
}
