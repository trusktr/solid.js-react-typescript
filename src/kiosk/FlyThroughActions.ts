import {ActionFactory, ActionMessage, ActionReducer} from "typedux";
import AnnotatedSceneState from "@/annotator-z-hydra-shared/src/store/state/AnnotatedSceneState";



import Logger from "@/util/log";
import {FlyThroughState, FlyThroughTrajectory} from "@/annotator-z-hydra-shared/src/models/FlyThroughState";

const log = Logger(__filename)


export default class FlyThroughActions extends ActionFactory<AnnotatedSceneState, ActionMessage<AnnotatedSceneState>> {

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
	resetFlyThroughState() {
		log.info("Resetting fly through state")
		return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
			...annotatedSceneState, flyThroughState: {
				enabled: true,
				trajectories: [],
				currentTrajectoryIndex: 0,
				currentPoseIndex: 0,
				endPoseIndex: 0,
			}
		})
	}


	@ActionReducer()
	setCurrentTrajectoryIndex(value:number) {
		log.info("Setting current trajectory index on FlyThroughState")
		return (annotatedSceneState: AnnotatedSceneState) => {
			const flyThroughState = new FlyThroughState({...annotatedSceneState.flyThroughState})

			flyThroughState.currentTrajectoryIndex = value
			return new AnnotatedSceneState({
				...annotatedSceneState, flyThroughState: flyThroughState
			})
		}
	}

	@ActionReducer()
	setCurrentPoseIndex(value:number) {
		// log.info("Setting current pose index on FlyThroughState", value)
		return (annotatedSceneState: AnnotatedSceneState) => {
			const flyThroughState = new FlyThroughState({...annotatedSceneState.flyThroughState})

			flyThroughState.currentPoseIndex = value
			return new AnnotatedSceneState({
				...annotatedSceneState, flyThroughState: flyThroughState
			})
		}
	}

	@ActionReducer()
	setEndPoseIndex(value:number) {
		log.info("Setting end pose index on FlyThroughState")
		return (annotatedSceneState: AnnotatedSceneState) => {
			const flyThroughState = new FlyThroughState({...annotatedSceneState.flyThroughState})

			flyThroughState.endPoseIndex = value
			return new AnnotatedSceneState({
				...annotatedSceneState, flyThroughState: flyThroughState
			})
		}
	}

	@ActionReducer()
	setEnable(isEnabled:boolean) {
		log.info("Setting enable on FlyThroughState")
		return (annotatedSceneState: AnnotatedSceneState) => {
			const flyThroughState = new FlyThroughState({...annotatedSceneState.flyThroughState})

			flyThroughState.enabled = isEnabled
			return new AnnotatedSceneState({
				...annotatedSceneState, flyThroughState: flyThroughState
			})
		}
	}

	@ActionReducer()
	setTrajectories(trajectories:FlyThroughTrajectory[]) {
		log.info("Setting trajectories on FlyThroughState")
		return (annotatedSceneState: AnnotatedSceneState) => {
			const flyThroughState = new FlyThroughState({...annotatedSceneState.flyThroughState})

			flyThroughState.trajectories = trajectories
			return new AnnotatedSceneState({
				...annotatedSceneState, flyThroughState: flyThroughState
			})
		}
	}
}













