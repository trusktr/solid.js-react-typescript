/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as React from 'react'
import AnnotatedSceneState from '@mapperai/annotated-scene/src/store/state/AnnotatedSceneState'
import {FlyThroughState, FlyThroughTrajectory} from '../FlyThroughState'
import StatusWindowActions from '@mapperai/annotated-scene/src/StatusWindowActions'
import {ChildAnimationLoop} from 'animation-loop'
const {default: config} = require(`${__base}/src/config`)
import * as AsyncFile from 'async-file'
import {dataSetNameFromPath} from '../../util/Perception'
import * as MapperProtos from '@mapperai/mapper-models'
import Logger from '../../util/log'
import * as Electron from 'electron'
import StatusKey from '../StatusKey'
import CarManager from './CarManager'
import * as zmq from 'zmq'
import {typedConnect} from '@mapperai/annotated-scene/src/styles/Themed'
import AnnotatedSceneActions from '@mapperai/annotated-scene/src/store/actions/AnnotatedSceneActions'
import AnnotatedSceneController from '@mapperai/annotated-scene/src/services/AnnotatedSceneController'
import {getAnnotatedSceneStore} from '@mapperai/annotated-scene/src/store/AppStore'
import toProps from '@mapperai/annotated-scene/src/util/toProps'

const dialog = Electron.remote.dialog
const log = Logger(__filename)

export interface FlyThroughManagerProps {
	carManager: CarManager
	annotatedSceneController: AnnotatedSceneController
	isLiveMode?: boolean
	isPlayMode?: boolean
	isInitialOriginSet?: boolean
	shouldAnimate?: boolean
	flyThroughEnabled?: boolean
}
export interface FlyThroughManagerState {
	flyThroughLoop: ChildAnimationLoop
	liveSubscribeSocket: zmq.Socket | null
	flyThroughState: FlyThroughState
}
@typedConnect(toProps(
	'isLiveMode',
	'isPlayMode',
	'isInitialOriginSet',
	'shouldAnimate',
	'flyThroughEnabled',
))
export default class FlyThroughManager extends React.Component<FlyThroughManagerProps, FlyThroughManagerState> {
	constructor(props: FlyThroughManagerProps) {
		super(props)

		const loop = new ChildAnimationLoop()
		const flyThroughFps = config['fly_through.animation.fps']
		const flyThroughInterval = flyThroughFps === 'device' ? 0 : 1 / (flyThroughFps || 10)

		loop.interval = flyThroughInterval

		const flyThroughState = new FlyThroughState({
			trajectories: [],
			currentTrajectoryIndex: 0,
			currentPoseIndex: 0,
			endPoseIndex: 0,
		})

		this.state = {
			flyThroughLoop: loop,
			liveSubscribeSocket: null,
			flyThroughState: flyThroughState,
		}
		// new AnnotatedSceneActions().updateFlyThroughState(this.flyThroughState)
	}

	componentWillReceiveProps(newProps) {
		if (newProps.isCarInitialized) {
			// The car is setup but we haven't loaded the user data and trajectories - let's do that now
			this.loadUserData()
		}
	}

	/**
	 *	Load up any data which configuration has asked for on start-up.
	 *	Note: This function is called after the car has been instantiated AND after PointCloudManager and AnnotatedScene are setup
	 */
	loadUserData(): Promise<void> {
		if (config['startup.point_cloud_directory']) log.warn('config option startup.point_cloud_directory has been removed.')

		if (config['live_mode.trajectory_path']) log.warn('config option live_mode.trajectory_path has been renamed to fly_through.trajectory_path')

		if (config['fly_through.trajectory_path']) log.warn('config option fly_through.trajectory_path is now a list: fly_through.trajectory_path.list')

		let trajectoryResult: Promise<void>

		const trajectoryPaths = config['fly_through.trajectory_path.list']

		if (Array.isArray(trajectoryPaths) && trajectoryPaths.length) {
			log.info('loading pre-configured trajectories')
			trajectoryResult = this.loadFlyThroughTrajectories(trajectoryPaths)
		} else {
			trajectoryResult = Promise.resolve()
		}

		return trajectoryResult
	}

	componentDidMount() {
		this.init().then()
	}

	async init() {
		try {
			log.info('Setting up FlyThroughManager')

			getAnnotatedSceneStore().observe([AnnotatedSceneState.Key, 'isPlayMode'], (newValue: Boolean, __oldValue: Boolean, __observer) => {
				log.info('isPlayMode changed, new value is', newValue)

				if (newValue) this.startLoop()
				else this.pauseLoop()
			})
		} catch (err) {
			console.log('ERROR OCCURRED ON FLY THROUGH LISTEN')
		}
	}

	getCurrentFlyThroughTrajectory(): FlyThroughTrajectory {
		const flyThroughState = this.state.flyThroughState

		return flyThroughState.trajectories[flyThroughState.currentTrajectoryIndex]
	}

	clearFlyThroughMessages(): void {
		new StatusWindowActions().setMessage(StatusKey.FLY_THROUGH_TRAJECTORY, '')
		new StatusWindowActions().setMessage(StatusKey.FLY_THROUGH_POSE, '')
	}

	// Display some info about what flyThrough mode is doing now.
	private setFlyThroughMessage(): void {
		const flyThroughState = this.state.flyThroughState
		const currentFlyThroughTrajectory = this.getCurrentFlyThroughTrajectory()

		let message: string

		if (!this.props.flyThroughEnabled || !currentFlyThroughTrajectory)
			message = ''
		else if (currentFlyThroughTrajectory.dataSet)
			message = `Data set: ${currentFlyThroughTrajectory.dataSet.name}`
		else if (flyThroughState.trajectories.length > 1)
			message = `Data set: ${flyThroughState.currentTrajectoryIndex + 1} of ${flyThroughState.trajectories.length}`
		else
			message = ''

		new StatusWindowActions().setMessage(StatusKey.FLY_THROUGH_TRAJECTORY, message)
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
		log.info('Starting flyThrough')
		this.setFlyThroughMessage()

		const flyThroughLoop = this.state.flyThroughLoop

		flyThroughLoop.addAnimationFn(this.flyThroughAnimation)
	}

	private flyThroughAnimation = (): boolean => {
		const shouldAnimate = this.props.shouldAnimate

		if (!shouldAnimate) return false

		return this.runFlyThrough()
	}

	/**
	 *	Move the camera and the car model through poses loaded from a file on disk.
	 *  See also initClient().
	 */
	private runFlyThrough(): boolean {
		const isLiveMode = this.props.isLiveMode
		const flyThroughState = this.state.flyThroughState

		if (isLiveMode || !flyThroughState || !this.props.flyThroughEnabled)
			return false

		if (flyThroughState.currentPoseIndex >= flyThroughState.endPoseIndex) {
			// Reset pose index
			flyThroughState.currentPoseIndex = 0

			// Update the current trajectory index
			if (flyThroughState.currentTrajectoryIndex >= flyThroughState.trajectories.length - 1) {
				// Reset it
				flyThroughState.currentTrajectoryIndex = 0
			} else {
				flyThroughState.currentTrajectoryIndex++
			}

			this.setFlyThroughMessage()
		}

		const pose = this.getCurrentFlyThroughTrajectory().poses[flyThroughState.currentPoseIndex]

		new StatusWindowActions().setMessage(StatusKey.FLY_THROUGH_POSE, `Pose: ${flyThroughState.currentPoseIndex + 1} of ${flyThroughState.endPoseIndex}`)

		// new AnnotatedSceneActions().setCarPose(pose)
		this.props.carManager.updateCarWithPose(pose)

		flyThroughState.currentPoseIndex++

		// new AnnotatedSceneActions().updateFlyThroughState(this.flyThroughState)

		return true
	}

	// Move the camera and the car model through poses streamed from ZMQ.
	// See also runFlyThrough().
	initClient(): void {
		if (this.state.liveSubscribeSocket) return

		const liveSubscribeSocket = zmq.socket('sub')

		liveSubscribeSocket.on('message', (msg) => {
			if (!this.props.isLiveMode || !this.props.isPlayMode) return

			if (this.props.flyThroughEnabled) return

			const state = MapperProtos.mapper.models.InertialStateMessage.decode(msg)

			if (
				state.pose &&
				state.pose.x != null && state.pose.y != null && state.pose.z != null &&
				state.pose.q0 != null && state.pose.q1 != null && state.pose.q2 != null && state.pose.q3 != null
			)
				this.props.carManager.updateCarWithPose(state.pose as MapperProtos.mapper.models.PoseMessage)
			else
				log.warn('got an InertialStateMessage without a pose')
		})

		const locationHost = config['location_server.host'] || 'localhost'
		const locationPort = config['location_server.port'] || '5564'

		liveSubscribeSocket.connect('tcp://' + locationHost + ':' + locationPort)
		liveSubscribeSocket.subscribe('')

		this.setState({liveSubscribeSocket})
	}

	resetFlyThroughState() {
		const flyThroughState = new FlyThroughState({
			trajectories: [],
			currentTrajectoryIndex: 0,
			currentPoseIndex: 0,
			endPoseIndex: 0,
		})

		this.setState({flyThroughState})
	}

	loadFlyThroughTrajectories(paths: string[]): Promise<void> {
		if (!paths.length) return Promise.reject(Error('called loadFlyThroughTrajectories() with no paths'))

		return Promise.all(paths.map(path =>
			AsyncFile.readFile(path)
				.then(buffer => [path, buffer]))
		)
			.then(tuples => {
				this.resetFlyThroughState()

				const flyThroughState = this.state.flyThroughState
				const trajectories = tuples.map(tuple => {
					const path = tuple[0]
					const buffer = tuple[1]
					const msg = MapperProtos.mapper.models.TrajectoryMessage.decode(buffer)
					const poses = msg.states
						.filter(state =>
							state && state.pose &&
							state.pose.x !== null && state.pose.y !== null && state.pose.z !== null &&
							state.pose.q0 !== null && state.pose.q1 !== null && state.pose.q2 !== null && state.pose.q3 !== null
						)
						.map(state => state.pose! as MapperProtos.mapper.models.PoseMessage)
					const dataSetName = dataSetNameFromPath(path)

					return {
						dataSet: dataSetName ? {name: dataSetName, path: path} : null,
						poses: poses,
					} as FlyThroughTrajectory
				}).filter(trajectory => trajectory.poses.length > 0)

				flyThroughState.trajectories = trajectories

				if (trajectories.length) {
					flyThroughState.endPoseIndex = this.getCurrentFlyThroughTrajectory().poses.length
					log.info(`loaded ${trajectories.length} trajectories`)
				} else {
					throw Error('failed to load trajectories')
				}

				// new AnnotatedSceneActions().updateFlyThroughState(this.flyThroughState)
			})
			.catch(err => {
				log.info('Error occurred loading fly through trajectories')
				this.resetFlyThroughState()
				// new AnnotatedSceneActions().updateFlyThroughState(this.flyThroughState)
				log.error(err.message)
				dialog.showErrorBox('Fly-through Load Error', err.message)
			})
	}

	// While live mode is enabled, switch between live data and pre-recorded data. Live data takes whatever
	// pose comes next over the socket. The "recorded" option opens a dialog box to select a data file
	// if we are so configured.
	// Side effect: if the animation is paused, start playing.
	// RYAN - when someone clicks between LIVE AND RECORDED
	toggleLiveAndRecordedPlay() {
		const flyThroughState = this.state.flyThroughState
		const isPlayMode = this.props.isPlayMode

		// if (!this.uiState.isLiveMode) return

		if (this.props.flyThroughEnabled) {
			this.clearFlyThroughMessages()
			new AnnotatedSceneActions().setFlyThroughEnabled(false)
		} else {
			new AnnotatedSceneActions().setFlyThroughEnabled(true)

			if (flyThroughState.trajectories.length) {
				this.startFlyThrough()
				this.startLoop()
			}
		}

		if (!isPlayMode) this.toggleLiveModePlay()
	}

	// While live mode is enabled, start or stop playing through a trajectory, whether it is truly live
	// data or pre-recorded "fly-through" data.
	// PAUSE AND PLAY BUTTON
	toggleLiveModePlay() {
		const {isPlayMode, isLiveMode, flyThroughEnabled} = this.props

		if (!isLiveMode) return

		if (!isPlayMode) {
			this.resumePlayMode()

			if (flyThroughEnabled)
				this.startLoop()
		} else {
			this.pauseMode()

			if (flyThroughEnabled)
				this.pauseLoop()
		}
	}

	private pauseMode(): void {
		// Set it to False so we pause
		new AnnotatedSceneActions().setPlayMode(false)
	}

	resumePlayMode(): void {
		// Set it to true so we keep going
		new AnnotatedSceneActions().setPlayMode(true)
	}

	render(): JSX.Element | null {
		return null
	}
}
