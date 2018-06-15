import {ActionFactory, ActionMessage, ActionReducer} from "typedux";
import RoadNetworkEditorState from "@/annotator-z-hydra-shared/src/store/state/RoadNetworkEditorState";



import Logger from "@/util/log";

const log = Logger(__filename)


export default class FlyThroughActions extends ActionFactory<RoadNetworkEditorState, ActionMessage<RoadNetworkEditorState>> {

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
	resetFlyThroughState() {
		log.info("Resetting fly through state")
		return (roadEditorState: RoadNetworkEditorState) => new RoadNetworkEditorState({
			...roadEditorState, flyThroughState: {
				enabled: false,
				trajectories: [],
				currentTrajectoryIndex: 0,
				currentPoseIndex: 0,
				endPoseIndex: 0,
			}
		})
	}


	// set trajectories



}













