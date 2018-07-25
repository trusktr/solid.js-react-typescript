/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import {ActionFactory, ActionMessage, ActionReducer} from "typedux";
import AnnotatedSceneState from "@/mapper-annotated-scene/src/store/state/AnnotatedSceneState";
import Logger from "@/util/log";
import StatusWindowState from "@/mapper-annotated-scene/src/models/StatusWindowState";

const log = Logger(__filename)

export default class StatusWindowActions extends ActionFactory<AnnotatedSceneState, ActionMessage<AnnotatedSceneState>> {

	constructor() {
		super(AnnotatedSceneState)
	}

	/**
	 * Leaf name
	 * @returns {string}
	 */
	leaf(): string {
		return AnnotatedSceneState.Key
	}

	@ActionReducer()
	setEnabled(isEnabled:boolean) {
		log.info("Setting isEnabled for StatusWindow", isEnabled)
		return (annotatedSceneState: AnnotatedSceneState) => {
			const statusWindowState = new StatusWindowState({...annotatedSceneState.statusWindowState})
			statusWindowState.enabled = isEnabled
			return new AnnotatedSceneState({
				...annotatedSceneState, statusWindowState: statusWindowState
			})
		}
	}

	@ActionReducer()
	toggleEnabled() {
		log.info("Toggling enabled for StatusWindow")
		return (annotatedSceneState: AnnotatedSceneState) => {
			const statusWindowState = new StatusWindowState({...annotatedSceneState.statusWindowState})
			statusWindowState.enabled = !annotatedSceneState.statusWindowState.enabled
			return new AnnotatedSceneState({
				...annotatedSceneState, statusWindowState: statusWindowState
			})
		}
	}

	@ActionReducer()
	setMessage(key:string, message:string) {
		// log.info("Setting new clients window message", {key:key, message:message})
		return (annotatedSceneState: AnnotatedSceneState) => {
			const statusWindowState = new StatusWindowState({...annotatedSceneState.statusWindowState})
			statusWindowState.messages.set(key, message)
			return new AnnotatedSceneState({
				...annotatedSceneState, statusWindowState: statusWindowState
			})
		}
	}

}
