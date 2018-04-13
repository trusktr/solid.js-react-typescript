/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import {channel} from "../electron-ipc/Channel"
import {AnnotatorWrapper} from "../electron-ipc/Wrapper"
import * as Electron from "electron"
import {BrowserWindow} from "electron"

// Listen for messages on Electron.ipcMain.
export function listen(win: BrowserWindow): void {
	// Broadcast wrapped messages from a renderer process to the Annotator renderer.
	const onAnnotatorWrapper = (_: Electron.EventEmitter, wrapper: AnnotatorWrapper): void =>
		win.webContents.send(wrapper.channel, wrapper.message)

	Electron.ipcMain.on(channel.annotatorWrapper, onAnnotatorWrapper)
}

export function stopListening(): void {
	Electron.ipcMain.removeAllListeners(channel.annotatorWrapper)
}
