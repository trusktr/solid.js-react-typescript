/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import {channel} from "./Channel"
import * as Electron from "electron"

// Electron (and Chromium in general) only allows IPC between Renderer
// processes and the Main process. Wrap a Renderer message in this wrapper,
// and the Main process will rebroadcast it to the Annotator window.
export interface AnnotatorWrapper {
	channel: string,
	// tslint:disable-next-line:no-any
	message: any,
}

// tslint:disable-next-line:no-any
function wrap(wrappedChannel: string, message: any): AnnotatorWrapper {
	return {
		channel: wrappedChannel,
		message: message,
	}
}

// tslint:disable-next-line:no-any
export function sendToAnnotator(wrappedChannel: string, message: any): void {
	Electron.ipcRenderer.send(channel.annotatorWrapper, wrap(wrappedChannel, message))
}
