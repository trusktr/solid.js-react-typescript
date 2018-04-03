/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

// Messages for communication with LightboxWindowManager
export interface LightboxImageDescription {
	uuid: string,
	path: string,
}

export interface LightboxState {
	images: LightboxImageDescription[]
}
