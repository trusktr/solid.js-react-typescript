/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

// Assorted messages for communication between Electron renderer processes

export interface LightboxImageDescription {
	uuid: string,
	path: string,
}
// List images to display in the lightbox.
export interface LightboxState {
	images: LightboxImageDescription[]
}
// Indicates when an image is being edited in the lightbox.
export interface ImageEditState {
	uuid: string,
	active: boolean,
}
// The location of a click on a 2D image, expressed as proportions of the image dimensions.
// This uses computer screen coordinates, with the XY origin in the upper left of the image.
export interface ImageClick {
	uuid: string,
	ratioX: number,
	ratioY: number,
}
// Minimal subset of KeyboardEvent which is interesting to Annotator.
export interface KeyboardEventHighlights {
	defaultPrevented: boolean,
	key: string,
	keyCode: number,
	repeat: boolean,
	altKey: boolean,
	ctrlKey: boolean,
	metaKey: boolean
}
