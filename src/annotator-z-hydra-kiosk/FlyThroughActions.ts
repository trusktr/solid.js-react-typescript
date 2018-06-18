import {ActionFactory, ActionMessage, ActionReducer} from "typedux";
import RoadNetworkEditorState from "@/annotator-z-hydra-shared/src/store/state/RoadNetworkEditorState";



import Logger from "@/util/log";
import {FlyThroughState, FlyThroughTrajectory} from "@/annotator-z-hydra-shared/src/models/FlyThroughState";

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

	@ActionReducer()
	setCurrentTrajectoryIndex(value:number) {
		log.info("Setting current trajectory index on FlyThroughState")
		return (roadEditorState: RoadNetworkEditorState) => {
			const flyThroughState = new FlyThroughState({...roadEditorState.flyThroughState})

			flyThroughState.currentTrajectoryIndex = value
			return new RoadNetworkEditorState({
				...roadEditorState, flyThroughState: flyThroughState
			})
		}
	}

	@ActionReducer()
	setCurrentPoseIndex(value:number) {
		log.info("Setting current pose index on FlyThroughState")
		return (roadEditorState: RoadNetworkEditorState) => {
			const flyThroughState = new FlyThroughState({...roadEditorState.flyThroughState})

			flyThroughState.currentPoseIndex = value
			return new RoadNetworkEditorState({
				...roadEditorState, flyThroughState: flyThroughState
			})
		}
	}

	@ActionReducer()
	setEndPoseIndex(value:number) {
		log.info("Setting end pose index on FlyThroughState")
		return (roadEditorState: RoadNetworkEditorState) => {
			const flyThroughState = new FlyThroughState({...roadEditorState.flyThroughState})

			flyThroughState.endPoseIndex = value
			return new RoadNetworkEditorState({
				...roadEditorState, flyThroughState: flyThroughState
			})
		}
	}

	@ActionReducer()
	setEnable(isEnabled:boolean) {
		log.info("Setting enable on FlyThroughState")
		return (roadEditorState: RoadNetworkEditorState) => {
			const flyThroughState = new FlyThroughState({...roadEditorState.flyThroughState})

			flyThroughState.enabled = isEnabled
			return new RoadNetworkEditorState({
				...roadEditorState, flyThroughState: flyThroughState
			})
		}
	}

	@ActionReducer()
	setTrajectories(trajectories:FlyThroughTrajectory[]) {
		log.info("Setting trajectories on FlyThroughState")
		return (roadEditorState: RoadNetworkEditorState) => {
			const flyThroughState = new FlyThroughState({...roadEditorState.flyThroughState})

			flyThroughState.trajectories = trajectories
			return new RoadNetworkEditorState({
				...roadEditorState, flyThroughState: flyThroughState
			})
		}
	}



}













