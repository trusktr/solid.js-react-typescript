import {ActionFactory, ActionMessage, ActionReducer} from "typedux";
import RoadNetworkEditorState from "@/annotator-z-hydra-shared/src/store/state/RoadNetworkEditorState";



import Logger from "@/util/log";
import StatusWindowState from "@/annotator-z-hydra-shared/src/models/StatusWindowState";

const log = Logger(__filename)


export default class StatusWindowActions extends ActionFactory<RoadNetworkEditorState, ActionMessage<RoadNetworkEditorState>> {

	constructor() {
		super(RoadNetworkEditorState)
	}

	/**
	 * Leaf name
	 * @returns {string}
	 */
	leaf(): string {
		return RoadNetworkEditorState.Key
	}

	@ActionReducer()
	setEnabled(isEnabled:boolean) {
		log.info("Setting isEnabled for StatusWindow", isEnabled)
		return (roadEditorState: RoadNetworkEditorState) => {
			const statusWindowState = new StatusWindowState({...roadEditorState.statusWindowState})
			statusWindowState.enabled = isEnabled
			return new RoadNetworkEditorState({
				...roadEditorState, statusWindowState: statusWindowState
			})
		}
	}

	@ActionReducer()
	toggleEnabled() {
		log.info("Toggling enabled for StatusWindow")
		return (roadEditorState: RoadNetworkEditorState) => {
			const statusWindowState = new StatusWindowState({...roadEditorState.statusWindowState})
			statusWindowState.enabled = !roadEditorState.statusWindowState
			return new RoadNetworkEditorState({
				...roadEditorState, statusWindowState: statusWindowState
			})
		}
	}

	@ActionReducer()
	setMessage(key:string, message:string) {
		log.info("Setting new status window message", {key:key, message:message})
		return (roadEditorState: RoadNetworkEditorState) => {
			const statusWindowState = new StatusWindowState({...roadEditorState.statusWindowState})
			statusWindowState.messages.set(key, message)
			return new RoadNetworkEditorState({
				...roadEditorState, statusWindowState: statusWindowState
			})
		}
	}


}













