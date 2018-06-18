import UIMessage from "annotator-z-hydra-shared/src/models/UIMessage"
import {FlyThroughState} from "@/annotator-z-hydra-shared/src/models/FlyThroughState";
import StatusWindowState from "@/annotator-z-hydra-shared/src/models/StatusWindowState";
import * as MapperProtos from '@mapperai/mapper-models'
import Models = MapperProtos.mapper.models

export default class RoadNetworkEditorState {

	static Key = 'RoadNetworkEditorState'

	/**
	 * Create state from JS (method required to comply with by IStateConstructor on the reducer)
	 * @param o
	 * @returns {RoadNetworkEditorState}
	 */
	static fromJS(o: any = {}): RoadNetworkEditorState {
		return new RoadNetworkEditorState(o)
	}

	constructor(o: any = {}) {
		Object.assign(this, o)
	}

	messages: Array<UIMessage>

	// ANNOTATOR SPECIFIC STATE
	liveModeEnabled: boolean // toggles between live mode and recorded mode
	playModeEnabled: boolean // toggles between play and pause modes

	flyThroughState: FlyThroughState
	statusWindowState: StatusWindowState

	uiMenuVisible: boolean
	shouldAnimate: boolean

	carPose: Models.PoseMessage
}
