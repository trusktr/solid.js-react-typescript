


// live_mode_pause

// live_recorded_playback_toggle

// select_trajectory_playback_file




// MAPPING

// old ------> new
//  --> liveModeEnabled
//  this.uiState.isLiveModePaused    --> playModeEnabled
import * as React from "react"
import {typedConnect} from "@/annotator-z-hydra-shared/src/styles/Themed";
import RoadEditorState from "@/annotator-z-hydra-shared/src/store/state/RoadNetworkEditorState";
import {createStructuredSelector} from "reselect";
import {FlyThroughState, FlyThroughTrajectory} from "@/annotator-z-hydra-shared/src/models/FlyThroughState";
import StatusWindowActions from "@/annotator-z-hydra-shared/StatusWindowActions";
import {getValue} from "typeguard";
import FlyThroughActions from "@/annotator-z-hydra-kiosk/FlyThroughActions";
import {AnimationLoop, ChildAnimationLoop} from 'animation-loop'
import config from "@/config";
import * as AsyncFile from "async-file";
import {dataSetNameFromPath} from "@/util/Perception";
import * as MapperProtos from '@mapperai/mapper-models'
import Models = MapperProtos.mapper.models
import Logger from "@/util/log";
import * as Electron from "electron";
import RoadNetworkEditorActions from "@/annotator-z-hydra-shared/src/store/actions/RoadNetworkEditorActions";

const dialog = Electron.remote.dialog
const log = Logger(__filename)

export interface FlyThroughProps {
	liveModeEnabled ?: boolean
	flyThroughState ?: FlyThroughState
	shouldAnimate ?: boolean
}

export interface FlyThroughComponentState {
	flyThroughLoop ?: AnimationLoop
}


@typedConnect(createStructuredSelector({
	liveModeEnabled: (state) => state.get(RoadEditorState.Key).liveModeEnabled,
	flyThroughState: (state) => state.get(RoadEditorState.Key).flyThroughState,
	shouldAnimate: (state) => state.get(RoadEditorState.Key).shouldAnimate,
}))
export default class FlyThrough extends React.Component<FlyThroughProps, FlyThroughComponentState> {


	constructor(props) {
		super(props)

		const loop = new ChildAnimationLoop
		const flyThroughFps = config.get('fly_through.animation.fps')
		const flyThroughInterval = flyThroughFps === 'device' ? 0 : 1 / (flyThroughFps || 10)
		loop.interval = flyThroughInterval

		console.log("Right before flyThrough set state")
		this.state = {
			flyThroughLoop: loop
		}



		console.log("flyThrough shouldAnimate", this.props.shouldAnimate)
		console.log("FINISHED FLY THROUGH CONSTRUCTOR")
	}

	get currentFlyThroughTrajectory(): FlyThroughTrajectory {
		return this.props.flyThroughState.trajectories[this.props.flyThroughState.currentTrajectoryIndex]
	}

	clearFlyThroughMessages(): void {
		new StatusWindowActions().setMessage(StatusKey.FLY_THROUGH_TRAJECTORY, '')
		new StatusWindowActions().setMessage(StatusKey.FLY_THROUGH_POSE, '')
	}

	// Display some info about what flyThrough mode is doing now.
	private setFlyThroughMessage(): void {
		const flyThroughState = this.props.flyThroughState

		let message: string
		if (!flyThroughState.enabled || !this.currentFlyThroughTrajectory)
			message = ''
		else if (this.currentFlyThroughTrajectory.dataSet)
			message = `Data set: ${this.currentFlyThroughTrajectory.dataSet.name}`
		else if (flyThroughState.trajectories.length > 1)
			message = `Data set: ${flyThroughState.currentTrajectoryIndex + 1} of ${flyThroughState.trajectories.length}`
		else
			message = ''

		new StatusWindowActions().setMessage(StatusKey.FLY_THROUGH_TRAJECTORY, message)
	}

	/**
	 * 	Move the camera and the car model through poses loaded from a file on disk.
	 *  See also initClient().
	 */
	private runFlyThrough(): boolean {
		const {liveModeEnabled, flyThroughState} = this.props
		if (!liveModeEnabled || !flyThroughState || !getValue(() => flyThroughState.enabled, false)) return false

		if (flyThroughState.currentPoseIndex >= flyThroughState.endPoseIndex) {
			// Reset pose index
			new FlyThroughActions().setCurrentPoseIndex(0)
			// Update the current trajectory index
			if(flyThroughState.currentTrajectoryIndex >= flyThroughState.trajectories.length - 1){
				// Reset it
				new FlyThroughActions().setCurrentTrajectoryIndex(0)
			} else {
				new FlyThroughActions().setCurrentTrajectoryIndex(flyThroughState.currentTrajectoryIndex++)
			}
			this.setFlyThroughMessage()
		}
		const pose = this.currentFlyThroughTrajectory.poses[flyThroughState.currentPoseIndex]
		new StatusWindowActions().setMessage(StatusKey.FLY_THROUGH_POSE, `Pose: ${flyThroughState.currentPoseIndex + 1} of ${flyThroughState.endPoseIndex}`)

		// RYAN UPDATED -- yolo?!
		new RoadNetworkEditorActions().setCarPose(pose)
		// this.updateCarWithPose(pose)

		new FlyThroughActions().setCurrentPoseIndex(flyThroughState.currentPoseIndex++)
		return true
	}

	getAnimationLoop() {
		return this.state.flyThroughLoop
	}

	startLoop() {
		this.state.flyThroughLoop.start()
	}

	pauseLoop() {
		this.state.flyThroughLoop.pause()
	}

	startFlyThrough(): void {
		this.setFlyThroughMessage()
		this.state.flyThroughLoop.removeAnimationFn(this.flyThroughAnimation)
		this.state.flyThroughLoop.addAnimationFn(this.flyThroughAnimation)
	}

	private flyThroughAnimation = (): boolean => {
		if (!this.props.shouldAnimate) return false
		return this.runFlyThrough()
	}

	loadFlyThroughTrajectories(paths: string[]): Promise<void> {
		if (!paths.length)
			return Promise.reject(Error('called loadFlyThroughTrajectories() with no paths'))

		return Promise.all(paths.map(path =>
			AsyncFile.readFile(path)
				.then(buffer => [path, buffer]))
		)
			.then(tuples => {

				new FlyThroughActions().resetFlyThroughState()

				const trajectories = tuples.map(tuple => {
						const path = tuple[0]
						const buffer = tuple[1]
						const msg = Models.TrajectoryMessage.decode(buffer)
						const poses = msg.states
							.filter(state =>
								state && state.pose
								&& state.pose.x !== null && state.pose.y !== null && state.pose.z !== null
								&& state.pose.q0 !== null && state.pose.q1 !== null && state.pose.q2 !== null && state.pose.q3 !== null
							)
							.map(state => state.pose! as Models.PoseMessage)
						const dataSetName = dataSetNameFromPath(path)
						return {
							dataSet: dataSetName ? {name: dataSetName, path: path} : null,
							poses: poses,
						} as FlyThroughTrajectory
					}).filter(trajectory => trajectory.poses.length > 0)

				// this.flyThroughState.trajectories =
				new FlyThroughActions().setTrajectories(trajectories)

				if (trajectories.length) {
					// RYAN UPDATED
					// this.flyThroughState.endPoseIndex = this.currentFlyThroughTrajectory.poses.length
					new FlyThroughActions().setEndPoseIndex(this.currentFlyThroughTrajectory.poses.length)
					log.info(`loaded ${trajectories.length} trajectories`)
				} else {
					throw Error('failed to load trajectories')
				}
			})
			.catch(err => {
				// RYAN UPDATED
				// this.resetFlyThroughState()
				new FlyThroughActions().resetFlyThroughState()
				log.error(err.message)
				dialog.showErrorBox('Fly-through Load Error', err.message)
			})
	}

	render() {
		return null
	}
}









