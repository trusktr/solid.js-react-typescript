
import * as React from "react"
import AnnotatedSceneState from "@/mapper-annotated-scene/src/store/state/AnnotatedSceneState";
import {FlyThroughState, FlyThroughTrajectory} from "@/mapper-annotated-scene/src/models/FlyThroughState";
import StatusWindowActions from "@/mapper-annotated-scene/StatusWindowActions";
import {ChildAnimationLoop} from 'animation-loop'
import config from "@/config";
import * as AsyncFile from "async-file";
import {dataSetNameFromPath} from "@/util/Perception";
import * as MapperProtos from '@mapperai/mapper-models'
import Models = MapperProtos.mapper.models
import Logger from "@/util/log";
import * as Electron from "electron";
import { StatusKey } from "@/mapper-annotated-scene/src/models/StatusKey";
import {getValue} from "typeguard";
import CarManager from "@/kiosk/components/CarManager";
import * as zmq from "zmq";
import {Socket} from "zmq";
import {createStructuredSelector} from "reselect";
import {typedConnect} from "@/mapper-annotated-scene/src/styles/Themed";
import AnnotatedSceneActions from "@/mapper-annotated-scene/src/store/actions/AnnotatedSceneActions";
import AnnotatedSceneController from "@/mapper-annotated-scene/src/services/AnnotatedSceneController";
import {getAnnotatedSceneStore} from '@/mapper-annotated-scene/src/store/AppStore'

const dialog = Electron.remote.dialog
const log = Logger(__filename)

export interface FlyThroughManagerProps {
  carManager: CarManager
  annotatedSceneController: AnnotatedSceneController
  liveModeEnabled ?: boolean
  playModeEnabled ?: boolean
  isCarInitialized ?: boolean
  isKioskUserDataLoaded ?: boolean
  shouldAnimate ?: boolean
}

export interface FlyThroughManagerState {
  flyThroughLoop: ChildAnimationLoop
  liveSubscribeSocket: Socket | null
}


@typedConnect(createStructuredSelector({
  liveModeEnabled: (state) => state.get(AnnotatedSceneState.Key).liveModeEnabled,
  playModeEnabled: (state) => state.get(AnnotatedSceneState.Key).playModeEnabled,
  isCarInitialized: (state) => state.get(AnnotatedSceneState.Key).isCarInitialized,
  isKioskUserDataLoaded: (state) => state.get(AnnotatedSceneState.Key).isKioskUserDataLoaded,
  shouldAnimate: (state) => state.get(AnnotatedSceneState.Key).shouldAnimate,
}))
export default class FlyThroughManager extends React.Component<FlyThroughManagerProps, FlyThroughManagerState> {
	private flyThroughState: FlyThroughState

  constructor(props) {
    super(props)
    console.log("RT-DEBUG FlyThroughManager constructor")

    const loop = new ChildAnimationLoop
    const flyThroughFps = config['fly_through.animation.fps']
    const flyThroughInterval = flyThroughFps === 'device' ? 0 : 1 / (flyThroughFps || 10)

    loop.interval = flyThroughInterval

    this.state = {
      flyThroughLoop: loop,
      liveSubscribeSocket: null,
    }

	this.flyThroughState = new FlyThroughState({
		enabled: true,
		trajectories: [],
		currentTrajectoryIndex: 0,
		currentPoseIndex: 0,
		endPoseIndex: 0,
	})
	new AnnotatedSceneActions().updateFlyThroughState(this.flyThroughState)

  }

  componentWillReceiveProps(newProps) {
    console.log("RT-DEBUG FlyThroughManager componentWillReceiveProps")
    if(newProps.isCarInitialized && !newProps.isKioskUserDataLoaded) {
      // The car is setup but we haven't loaded the user data and trajectories - let's do that now
      console.log("RT-DEBUG FlyThroughManager componentWillReceiveProps -- load user data")
      this.loadUserData().then(() => new AnnotatedSceneActions().setIsKioskUserDataLoaded(true))
    }
  }

  /**
   * 	Load up any data which configuration has asked for on start-up.
   * 	Note: This function is called after the car has been instantiated AND after PointCloudManager and AnnotatedScene are setup
   */
  private loadUserData(): Promise<void> {
    const annotationsPath = config['startup.annotations_path']
    let annotationsResult: Promise<void>
    if (annotationsPath) {
      annotationsResult = this.props.annotatedSceneController.annotationManager.loadAnnotations(annotationsPath)
    } else {
      annotationsResult = Promise.resolve()
    }

    const pointCloudBbox: [number, number, number, number, number, number] = config['startup.point_cloud_bounding_box']
    let pointCloudResult: Promise<void>
    if (pointCloudBbox) {
      pointCloudResult = annotationsResult
        .then(() => {
          log.info('loading pre-configured bounding box ' + pointCloudBbox)
          return this.props.annotatedSceneController.state.pointCloudManager!.loadPointCloudDataFromConfigBoundingBox(pointCloudBbox)
        })
    } else {
      pointCloudResult = annotationsResult
    }

    if (config['startup.point_cloud_directory'])
      log.warn('config option startup.point_cloud_directory has been removed.')
    if (config['live_mode.trajectory_path'])
      log.warn('config option live_mode.trajectory_path has been renamed to fly_through.trajectory_path')
    if (config['fly_through.trajectory_path'])
      log.warn('config option fly_through.trajectory_path is now a list: fly_through.trajectory_path.list')

    let trajectoryResult: Promise<void>
    const trajectoryPaths = config['fly_through.trajectory_path.list']
    if (Array.isArray(trajectoryPaths) && trajectoryPaths.length) {
      trajectoryResult = pointCloudResult
        .then(() => {
          console.log('loading pre-configured trajectories')
          log.info('loading pre-configured trajectories')
          return this.loadFlyThroughTrajectories(trajectoryPaths)
        })
    } else {
      trajectoryResult = pointCloudResult
    }

    console.log("RT-DEBUG Finished loadUserData")
    return trajectoryResult
  }

  componentDidMount() {
    console.log("RT-DEBUG FlyThrough componentDidMount")
    this.init()
  }


  async init() {
    try {
      log.info('Setting up FlyThroughManager')
      getAnnotatedSceneStore().observe([AnnotatedSceneState.Key,'playModeEnabled'], (newValue:Boolean, __oldValue:Boolean, __observer) => {
        log.info("playModeEnabled changed, new value is", newValue)

        if(newValue)
          this.startLoop()
        else
          this.pauseLoop()
      })
    } catch (err) {
      console.log("ERROR OCCURRED ON FLY THROUGH LISTEN")
    }

    // @TODO make any changes to the Scene orbitControls() -- see initFlyThroughOrbitControls()
  }

  getCurrentFlyThroughTrajectory(): FlyThroughTrajectory {
    const flyThroughState = this.flyThroughState
    return flyThroughState.trajectories[flyThroughState.currentTrajectoryIndex]
  }

  clearFlyThroughMessages(): void {
    new StatusWindowActions().setMessage(StatusKey.FLY_THROUGH_TRAJECTORY, '')
    new StatusWindowActions().setMessage(StatusKey.FLY_THROUGH_POSE, '')
  }

  // Display some info about what flyThrough mode is doing now.
  private setFlyThroughMessage(): void {
    const flyThroughState = this.flyThroughState
    const currentFlyThroughTrajectory = this.getCurrentFlyThroughTrajectory()

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

  getAnimationLoop() {
    return this.state.flyThroughLoop
  }

  startLoop() {
    console.log("RT-DEBUG FlyThrough Inside startLoop")
    this.state.flyThroughLoop.start()
  }

  pauseLoop() {
    console.log("RT-DEBUG FlyThrough Inside pauseLoop")
    this.state.flyThroughLoop.pause()
  }

  startFlyThrough(): void {
    console.log("RT-DEBUG FlyThrough inside startFlyThrough")
    this.setFlyThroughMessage()
		const flyThroughLoop = this.state.flyThroughLoop
    console.log("Inside startFlyThrough about to start loop.removeAnimationFn -- flyThroughLoop", flyThroughLoop.removeAnimationFn)
    flyThroughLoop.removeAnimationFn(this.flyThroughAnimation)
    console.log("Inside startFlyThrough about to start loop.addAnimationFn -- flyThroughLoop", flyThroughLoop.addAnimationFn)
    flyThroughLoop.addAnimationFn(this.flyThroughAnimation)
  }

  private flyThroughAnimation = (): boolean => {
    console.log("NEED TO GET HERE flyThroughAnimation")
    const shouldAnimate = this.props.shouldAnimate
    if(!shouldAnimate)
      return false
    return this.runFlyThrough()
  }

  /**
   * 	Move the camera and the car model through poses loaded from a file on disk.
   *  See also initClient().
   */
  private runFlyThrough(): boolean {
    // console.log("Inside runFlyThrough")
    console.log("BINGO - we're set")
    const liveModeEnabled = this.props.liveModeEnabled
    const flyThroughState = this.flyThroughState

    if (!liveModeEnabled || !flyThroughState || !getValue(() => flyThroughState.enabled, false)) {
      console.log("Returning early from within runFlyThrough")
      return false
    }

    if (flyThroughState.currentPoseIndex >= flyThroughState.endPoseIndex) {
      // Reset pose index
	  this.flyThroughState.currentPoseIndex = 0
      // Update the current trajectory index
	  const updatedFlyThroughState = this.flyThroughState
      if(updatedFlyThroughState!.currentTrajectoryIndex >= updatedFlyThroughState!.trajectories.length - 1){
        // Reset it
		this.flyThroughState.currentTrajectoryIndex = 0
      } else {
		this.flyThroughState.currentTrajectoryIndex++
      }
      this.setFlyThroughMessage()
    }

    const pose = this.getCurrentFlyThroughTrajectory().poses[this.flyThroughState.currentPoseIndex]
    new StatusWindowActions().setMessage(StatusKey.FLY_THROUGH_POSE, `Pose: ${this.flyThroughState.currentPoseIndex + 1} of ${this.flyThroughState.endPoseIndex}`)

    // new AnnotatedSceneActions().setCarPose(pose)
    console.log("AH HA calling updateCarWithPose", pose)
    this.props.carManager.updateCarWithPose(pose)

    this.flyThroughState.currentPoseIndex++

	new AnnotatedSceneActions().updateFlyThroughState(this.flyThroughState)

    return true
  }

  // Move the camera and the car model through poses streamed from ZMQ.
  // See also runFlyThrough().
  initClient(): void {
    console.log("RT FlyThroughManager initClient")
    if (this.state.liveSubscribeSocket) return

    const liveSubscribeSocket = zmq.socket('sub')

    liveSubscribeSocket.on('message', (msg) => {
      if(!this.props.liveModeEnabled || !this.props.playModeEnabled) return

      if (this.flyThroughState.enabled) return


      const state = Models.InertialStateMessage.decode(msg)
      console.log("GOT NEW MESSAGE FROM liveSubscribeSocket", state)
      if (
        state.pose &&
        state.pose.x != null && state.pose.y != null && state.pose.z != null &&
        state.pose.q0 != null && state.pose.q1 != null && state.pose.q2 != null && state.pose.q3 != null
      ) {
        console.log("Going to call updateCarWithPose")
        this.props.carManager.updateCarWithPose(state.pose as Models.PoseMessage)
      } else {
        console.log('got an InertialStateMessage without a pose')
        log.warn('got an InertialStateMessage without a pose')

      }
    })

    const locationHost = config['location_server.host'] || 'localhost'
    const locationPort = config['location_server.port'] || '5564'
    liveSubscribeSocket.connect("tcp://" + locationHost + ":" + locationPort)
    liveSubscribeSocket.subscribe("")

    this.setState({liveSubscribeSocket})
  }

  resetFlyThroughState() {
	  this.flyThroughState = new FlyThroughState({
		  enabled: true,
		  trajectories: [],
		  currentTrajectoryIndex: 0,
		  currentPoseIndex: 0,
		  endPoseIndex: 0,
	  })
  }

  loadFlyThroughTrajectories(paths: string[]): Promise<void> {
    if (!paths.length)
      return Promise.reject(Error('called loadFlyThroughTrajectories() with no paths'))

    return Promise.all(paths.map(path =>
      AsyncFile.readFile(path)
        .then(buffer => [path, buffer]))
    )
      .then(tuples => {

        this.resetFlyThroughState()

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

        this.flyThroughState.trajectories = trajectories

        if (trajectories.length) {
		  this.flyThroughState.endPoseIndex = this.getCurrentFlyThroughTrajectory().poses.length
          console.log(`loaded ${trajectories.length} trajectories`)
          log.info(`loaded ${trajectories.length} trajectories`)
        } else {
          throw Error('failed to load trajectories')
        }

		new AnnotatedSceneActions().updateFlyThroughState(this.flyThroughState)
      })
      .catch(err => {
        log.info("Error occurred loading fly through trajectories")
        this.resetFlyThroughState()
		new AnnotatedSceneActions().updateFlyThroughState(this.flyThroughState)
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
    console.log("inside toggleLiveAndRecordedPlay")
    const flyThroughState = this.flyThroughState
    const liveModeEnabled = this.props.liveModeEnabled


    console.log("Value for flyThroughState", flyThroughState)
    console.log("Value for liveModeEnabled", liveModeEnabled)

    // if (!this.uiState.isLiveMode) return

    if (flyThroughState.enabled) {
      console.log("toggling LiveAndRecordedPlay - moving to enable=false")
      this.clearFlyThroughMessages()
	  this.flyThroughState.enabled = false
    } else {
      console.log("toggling LiveAndRecordedPlay - moving to enable=true")
	  this.flyThroughState.enabled = true

      if (flyThroughState.trajectories.length) {
        console.log("Looking to start animation loop")
        this.startFlyThrough()
        this.startLoop()
      }
    }

	new AnnotatedSceneActions().updateFlyThroughState(this.flyThroughState)

    // if (this.uiState.isLiveModePaused)
    if (!liveModeEnabled)
      this.toggleLiveModePlay()
  }


  // While live mode is enabled, start or stop playing through a trajectory, whether it is truly live
	// data or pre-recorded "fly-through" data.
	// PAUSE AND PLAY BUTTON
  toggleLiveModePlay() {
    const flyThroughState = this.flyThroughState
    const playModeEnabled = this.props.playModeEnabled
    // @TODO comment back in
    // if (!this.props.liveModeEnabled) {
    // 	console.log("Early return live mode disabled")
    // 	return
    // }

    if (!playModeEnabled) {
      // this.resumeLiveMode()
      if (flyThroughState.enabled) {
        console.log("STARTING LOOP onToggle")
        this.startLoop()
      }

    } else {
      // this.pauseLiveMode()

      if (flyThroughState.enabled) {
        console.log("PAUSING LOOP onToggle")
        this.pauseLoop()
      }

    }
  }


  render() {
  	return null
	}
}
