

import RoadEditorState from "@/annotator-z-hydra-shared/src/store/state/RoadNetworkEditorState";
import {FlyThroughTrajectory} from "@/annotator-z-hydra-shared/src/models/FlyThroughState";
import StatusWindowActions from "@/annotator-z-hydra-shared/StatusWindowActions";
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
import { StatusKey } from "@/annotator-z-hydra-shared/src/models/StatusKey";
import {getValue} from "typeguard";
import {OrbitControls} from "@/annotator-entry-ui/controls/OrbitControls";

const dialog = Electron.remote.dialog
const log = Logger(__filename)


const
	loop = new ChildAnimationLoop,
	flyThroughFps = config.get('fly_through.animation.fps'),
	flyThroughInterval = flyThroughFps === 'device' ? 0 : 1 / (flyThroughFps || 10)

loop.interval = flyThroughInterval

export async function init() {
	try {
		log.info('Setting up FlyThroughManager')
		getRoadNetworkEditorStore().observe([RoadEditorState.Key,'playModeEnabled'],(newValue:Boolean,oldValue:Boolean,observer) => {
			log.info("playModeEnabled changed, new value is", newValue)
			// storeUser(newValue)
			if(newValue)
				startLoop()
			else
				pauseLoop()
		})
	} catch (err) {
		console.log("ERROR OCCURRED ON FLY THROUGH LISTEN")
	}
}


export function getCurrentFlyThroughTrajectory(): FlyThroughTrajectory {
	const flyThroughState = getRoadNetworkEditorStore().getState().get(RoadEditorState.Key).flyThroughState
	return flyThroughState.trajectories[flyThroughState.currentTrajectoryIndex]
}

export function clearFlyThroughMessages(): void {
	new StatusWindowActions().setMessage(StatusKey.FLY_THROUGH_TRAJECTORY, '')
	new StatusWindowActions().setMessage(StatusKey.FLY_THROUGH_POSE, '')
}


// Display some info about what flyThrough mode is doing now.
function setFlyThroughMessage(): void {
	const flyThroughState = getRoadNetworkEditorStore().getState().get(RoadEditorState.Key).flyThroughState
	const currentFlyThroughTrajectory = getCurrentFlyThroughTrajectory()

	let message: string
	if (!flyThroughState.enabled || !currentFlyThroughTrajectory)
		message = ''
	else if (currentFlyThroughTrajectory.dataSet)
		message = `Data set: ${currentFlyThroughTrajectory.dataSet.name}`
	else if (flyThroughState.trajectories.length > 1)
		message = `Data set: ${flyThroughState.currentTrajectoryIndex + 1} of ${flyThroughState.trajectories.length}`
	else
		message = ''

	new StatusWindowActions().setMessage(StatusKey.FLY_THROUGH_TRAJECTORY, message)
}

export function getAnimationLoop() {
	return loop
}

export function startLoop() {
	log.info("Inside startLoop")
	loop.start()
}

export function pauseLoop() {
	log.info("Inside pauseLoop")
	loop.pause()
}

export function startFlyThrough(): void {
	log.info("inside startFlyThrough")
	setFlyThroughMessage()
	loop.removeAnimationFn(flyThroughAnimation)
	loop.addAnimationFn(flyThroughAnimation)
}

function flyThroughAnimation(): boolean {
	const shouldAnimate = getRoadNetworkEditorStore().getState().get(RoadEditorState.Key).shouldAnimate
	if(!shouldAnimate)
		return false
	return runFlyThrough()
}

/**
 * 	Move the camera and the car model through poses loaded from a file on disk.
 *  See also initClient().
 */
function runFlyThrough(): boolean {
	// console.log("Inside runFlyThrough")
	const liveModeEnabled = getRoadNetworkEditorStore().getState().get(RoadEditorState.Key).liveModeEnabled
	const flyThroughState = getRoadNetworkEditorStore().getState().get(RoadEditorState.Key).flyThroughState

	if (!liveModeEnabled || !flyThroughState || !getValue(() => flyThroughState.enabled, false)) {
		console.log("Returning early from within runFlyThrough")
		return false
	}

	if (flyThroughState.currentPoseIndex >= flyThroughState.endPoseIndex) {
		// Reset pose index
		new FlyThroughActions().setCurrentPoseIndex(0)
		// Update the current trajectory index
		const updatedFlyThroughState = getRoadNetworkEditorStore().getState().get(RoadEditorState.Key).flyThroughState
		if(updatedFlyThroughState.currentTrajectoryIndex >= updatedFlyThroughState.trajectories.length - 1){
			// Reset it
			new FlyThroughActions().setCurrentTrajectoryIndex(0)
		} else {
			new FlyThroughActions().setCurrentTrajectoryIndex(updatedFlyThroughState.currentTrajectoryIndex++)
		}
		setFlyThroughMessage()
	}
	const newFlyThroughState = getRoadNetworkEditorStore().getState().get(RoadEditorState.Key).flyThroughState
	const pose = getCurrentFlyThroughTrajectory().poses[newFlyThroughState.currentPoseIndex]
	new StatusWindowActions().setMessage(StatusKey.FLY_THROUGH_POSE, `Pose: ${newFlyThroughState.currentPoseIndex + 1} of ${newFlyThroughState.endPoseIndex}`)

	new RoadNetworkEditorActions().setCarPose(pose)

	const newValue = newFlyThroughState.currentPoseIndex + 1
	new FlyThroughActions().setCurrentPoseIndex(newValue)
	return true
}



export function loadFlyThroughTrajectories(paths: string[]): Promise<void> {
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

			new FlyThroughActions().setTrajectories(trajectories)

			if (trajectories.length) {
				new FlyThroughActions().setEndPoseIndex(getCurrentFlyThroughTrajectory().poses.length)
				log.info(`loaded ${trajectories.length} trajectories`)
			} else {
				throw Error('failed to load trajectories')
			}
		})
		.catch(err => {
			log.info("Error occurred loading fly through trajectories")
			new FlyThroughActions().resetFlyThroughState()
			log.error(err.message)
			dialog.showErrorBox('Fly-through Load Error', err.message)
		})
}


// While live mode is enabled, switch between live data and pre-recorded data. Live data takes whatever
// pose comes next over the socket. The "recorded" option opens a dialog box to select a data file
// if we are so configured.
// Side effect: if the animation is paused, start playing.
// RYAN - when someone clicks between LIVE AND RECORDED
export function toggleLiveAndRecordedPlay() {
	const flyThroughState = getRoadNetworkEditorStore().getState().get(RoadEditorState.Key).flyThroughState
	const liveModeEnabled = getRoadNetworkEditorStore().getState().get(RoadEditorState.Key).liveModeEnabled



	// if (!this.uiState.isLiveMode) return

	if (flyThroughState.enabled) {
		console.log("toggling LiveAndRecordedPlay - moving to enable=false")
		clearFlyThroughMessages()
		new FlyThroughActions().setEnable(false)
	} else {
		console.log("toggling LiveAndRecordedPlay - moving to enable=true")
		new FlyThroughActions().setEnable(true)

		if (flyThroughState.trajectories.length) {
			console.log("Looking to start animation loop")
			startFlyThrough()
			startLoop()
			// this.startFlyThrough()
			// this.flyThroughLoop.start()
		}
	}

	// if (this.uiState.isLiveModePaused)
	if (!liveModeEnabled)
		toggleLiveModePlay()
}




// While live mode is enabled, start or stop playing through a trajectory, whether it is truly live
// data or pre-recorded "fly-through" data.
// PAUSE AND PLAY BUTTON
export function toggleLiveModePlay() {
	const flyThroughState = getRoadNetworkEditorStore().getState().get(RoadEditorState.Key).flyThroughState
	const playModeEnabled = getRoadNetworkEditorStore().getState().get(RoadEditorState.Key).playModeEnabled
	// @TODO comment back in
	// if (!this.props.liveModeEnabled) {
	// 	console.log("Early return live mode disabled")
	// 	return
	// }

	if (!playModeEnabled) {
		// this.resumeLiveMode()
		if (flyThroughState.enabled) {
			console.log("STARTING LOOP onToggle")
			startLoop()
		}

	} else {
		// this.pauseLiveMode()

		if (flyThroughState.enabled) {
			console.log("PAUSING LOOP onToggle")
			pauseLoop()
		}

	}
}


// @TODO add this.initFlyThroughOrbitControls() here and on init() above


export function initFlyThroughOrbitControls(camera:THREE.Camera, domElement:HTMLCanvasElement): void {
	const flyThroughOrbitControls = new OrbitControls(camera, domElement)
	flyThroughOrbitControls.enabled = false
	flyThroughOrbitControls.minDistance = 10
	flyThroughOrbitControls.maxDistance = 5000
	flyThroughOrbitControls.minPolarAngle = 0
	flyThroughOrbitControls.maxPolarAngle = Math.PI / 2
	flyThroughOrbitControls.keyPanSpeed = 100
	flyThroughOrbitControls.enablePan = false

	flyThroughOrbitControls.addEventListener('change', this.updateSkyPosition)

	flyThroughOrbitControls.addEventListener('start', () => {
		this.updateOrbitControls = true
		this.loop.addAnimationFn(() => this.updateOrbitControls)
	})

	this.flyThroughOrbitControls.addEventListener('end', () => {
		this.updateOrbitControls = false
	})
}
