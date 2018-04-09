/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

// Assorted messages for communication between Electron renderer processes

export interface LightboxImageDescription {
	uuid: string,
	path: string,
}

export interface LightboxState {
	images: LightboxImageDescription[]
}

export interface ImageEditState {
	uuid: string,
	active: boolean,
}
