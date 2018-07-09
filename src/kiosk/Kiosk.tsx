import * as React from 'react'
import * as THREE from 'three'
import config from "@/config";
import CarManager from "@/kiosk/components/CarManager";
import AnnotatedSceneState from "@/mapper-annotated-scene/src/store/state/AnnotatedSceneState";
import {typedConnect} from "@/mapper-annotated-scene/src/styles/Themed";
import {createStructuredSelector} from "reselect";
import FlyThroughManager from "@/kiosk/components/FlyThroughManager";
import KioskMenuView from "@/kiosk/components/KioskMenuView";
import Logger from "@/util/log";
import AnnotatedSceneController from "@/mapper-annotated-scene/src/services/AnnotatedSceneController";
import * as watch from 'watch'
import FlyThroughActions from "@/kiosk/store/actions/FlyThroughActions";

const log = Logger(__filename)


export interface KioskProps {
  sceneInitialized ?: boolean
  isCarInitialized ?: boolean
}

export interface KioskState {
  annotatedSceneController: AnnotatedSceneController | null
	carManager: CarManager | null
	flyThroughManager: FlyThroughManager | null
	hasCalledSetup: boolean

}


@typedConnect(createStructuredSelector({
  sceneInitialized: (state) => state.get(AnnotatedSceneState.Key).sceneInitialized,
  isCarInitialized: (state) => state.get(AnnotatedSceneState.Key).isCarInitialized,
}))
export default class Kiosk extends React.Component<KioskProps, KioskState> {

	constructor(props) {
		super(props)

		this.state = {
			annotatedSceneController: null,
			carManager: null,
			flyThroughManager: null,
			hasCalledSetup: false,
		}

		const watchForRebuilds: boolean = config['startup.watch_for_rebuilds.enable'] || false
		if (watchForRebuilds) {
			// Watch for rebuilds and exit if we get rebuilt.
			// This relies on a script or something else to restart after we exit
			const self = this
			watch.createMonitor(
				'/tmp',
				{
					filter: function (f: string): boolean {
						return f === '/tmp/visualizer-rebuilt.flag'
					}
				},
				function (monitor: any): void {
					monitor.on("created", function (): void {
						log.info("Rebuilt flag file created, exiting app")
						self.exitApp()
					})
					monitor.on("changed", function (): void {
						log.info("Rebuilt flag file modified, exiting app")
						self.exitApp()
					})
				})
		}

		new FlyThroughActions().resetFlyThroughState()

		if (config['fly_through.render.fps'])
			log.warn('config option fly_through.render.fps has been renamed to fly_through.animation.fps')
	}

	exitApp(): void {
		Electron.remote.getCurrentWindow().close()
	}

	componentWillReceiveProps(newProps) {
		if(newProps.sceneInitialized && !this.props.sceneInitialized && this.state.annotatedSceneController && this.state.flyThroughManager) {
			// this is the transition from the Scene not being setup to when it is
			// Since it's setup now let's setup the fly through manager
      const flyThroughManager = this.state.flyThroughManager
      // flyThroughManager.init() -- called on componentDidMount within FlyThroughManager
			const sceneManager = this.state.annotatedSceneController
			sceneManager.addChildLoop(flyThroughManager.getAnimationLoop())

      flyThroughManager.startLoop()

			// Register key events
			this.registerKeyDownEvents()

			this.setState({flyThroughManager})

      // setup other items after scene is initialized
      // 1) Update the camera offset for kiosk specifically
      const cameraOffset = new THREE.Vector3(30, 10, 0)
      this.state.annotatedSceneController.setCameraOffsetVector(cameraOffset)
		}

		if(newProps.isCarInitialized && newProps.isKioskUserDataLoaded && !this.state.hasCalledSetup &&
			this.state.annotatedSceneController && this.state.carManager && this.state.flyThroughManager
		) {
			// At this point the car model has been loaded and user data has also been loaded, we're ready for listen()
			// this only gets called once because then state.hasCalledSetup is set to True
			this.listen()
		}

	}

	private registerKeyDownEvents() {
		const LEFT_ARROW_KEY_CODE = 37
		const UP_ARROW_KEY_CODE = 38
		const RIGHT_ARROW_KEY_CODE = 39
		const DOWN_ARROW_KEY_CODE = 40
		const cameraOffsetDelta = 1

    this.state.annotatedSceneController!.registerKeyboardDownEvent(LEFT_ARROW_KEY_CODE, () => {this.state.annotatedSceneController!.adjustCameraXOffset(cameraOffsetDelta)})
		this.state.annotatedSceneController!.registerKeyboardDownEvent(UP_ARROW_KEY_CODE, () => {this.state.annotatedSceneController!.adjustCameraYOffset(cameraOffsetDelta)})
		this.state.annotatedSceneController!.registerKeyboardDownEvent(RIGHT_ARROW_KEY_CODE, () => {this.state.annotatedSceneController!.adjustCameraXOffset(-1 * cameraOffsetDelta)})
		this.state.annotatedSceneController!.registerKeyboardDownEvent(DOWN_ARROW_KEY_CODE, () => {this.state.annotatedSceneController!.adjustCameraYOffset(-1 * cameraOffsetDelta)})
	}

	getCarManager = (carManager:CarManager) => {
		this.setState({carManager,})
	}

	getAnnotatedSceneController = (annotatedSceneController:AnnotatedSceneController) => {
		this.setState({annotatedSceneController,})
	}

  getFlyThroughManager = (flyThroughManager:FlyThroughManager) => {
    this.setState({flyThroughManager,})
  }

  // this gets called after the CarManager is instantiated
  private listen() {
    if (this.state.hasCalledSetup) return

		if(!this.state.carManager || !this.state.annotatedSceneController || !this.state.annotatedSceneController.state.sceneManager) {
			log.warn("Unable to finish calling listen() -- managers not initialized")
    	return
		}

    log.info('Listening for messages...')
		this.setState({
      hasCalledSetup: true
		})

		this.state.annotatedSceneController!.activateReadOnlyViewingMode()

    // The camera and the point cloud AOI track the car object, so add it to the scene
    // regardless of whether it is visible in the scene.
		// @TODO confirm this works as expected
		this.state.carManager.addObjectToCar(this.state.annotatedSceneController.state.sceneManager.getCamera()) // follow/orbit around the car
		this.state.carManager.makeCarVisible()


		if(this.state.flyThroughManager) {
      // Start both types of playback, just in case. If fly-through is enabled it will preempt the live location client.
      this.state.flyThroughManager.startFlyThrough()

      //this.resumeLiveMode()
      this.state.flyThroughManager.initClient()
		} else {
    	log.error("Error in listen() - flyThroughManager expected, but not found")
		}

    this.state.annotatedSceneController!.renderScene()
  }


    // TODO JOE WEDNESDAY {{{
    // get this kiosk-specific trajectory picker stuff working

    // import TrajectoryPicker, {TrajectoryFileSelectedCallback} from "./components/TrajectoryPicker"
    // import {dataSetNameFromPath, TrajectoryDataSet} from "../util/Perception"
    //
    // private openTrajectoryPickerFunction: ((cb: TrajectoryFileSelectedCallback) => void) | null
    // private sceneContainer: HTMLDivElement
    // private trajectoryPickerRef: TrajectoryPicker
    //
    // constructor() {
    //     this.openTrajectoryPickerFunction = null
    // }
    //
    // private loadTrajectoryFromOpenDialog(): Promise<void> {
    //     const { promise, resolve, reject }: PromiseReturn<void, Error> = createPromise<void, Error>()
    //
    //     const options: Electron.OpenDialogOptions = {
    //         message: 'Load Trajectory File',
    //         properties: ['openFile'],
    //         filters: [{name: 'md', extensions: ['md']}],
    //     }
    //
    //     const handler = (paths: string[]): void => {
    //         if (paths && paths.length)
    //         FlyThroughManager.loadFlyThroughTrajectories([ paths[0] ])
    //         .then(() => resolve())
    //         .catch(err => reject(err))
    //         else
    //         reject(Error('no trajectory path selected'))
    //     }
    //
    //     dialog.showOpenDialog(options, handler)
    //
    //     return promise
    // }
    //
    //     // TODO JOE WEDNESDAY on click #tools_load_trajectory run loadTrajectoryFromOpenDialog
    //    const toolsLoadTrajectory = document.getElementById('tools_load_trajectory')
    //    if (toolsLoadTrajectory)
    //            toolsLoadTrajectory.addEventListener('click', () => {
    //                    this.loadTrajectoryFromOpenDialog()
    //                            .catch(err => log.warn('loadFromFile failed: ' + err.message))
    //            })
    //    else
    //            log.warn('missing element tools_load_trajectory')
    //
    //     // TODO JOE WEDNESDAY on click #select_trajectory_playback_file run openTrajectoryPicker
    //    const selectTrajectoryPlaybackFile = document.querySelector('#select_trajectory_playback_file')
    //    if (selectTrajectoryPlaybackFile)
    //            selectTrajectoryPlaybackFile.addEventListener('click', this.openTrajectoryPicker)
    //    else
    //            log.warn('missing element select_trajectory_playback_file')
    //
    // // Hang on to a reference to TrajectoryPicker so we can call it later.
    // setOpenTrajectoryPickerFunction(theFunction: (cb: TrajectoryFileSelectedCallback) => void): void {
    //    this.openTrajectoryPickerFunction = theFunction
    // }
    //
    // // ANNOTATOR ONLY
    // // TODO REORG JOE remove trajectory picker stuff
    // private openTrajectoryPicker = (): void => {
    //    if (this.openTrajectoryPickerFunction)
    //        this.openTrajectoryPickerFunction(this.trajectoryFileSelectedCallback)
    // }
    //
    //    <TrajectoryPicker
    //         // TODO REORG JOE remove trajectory picker stuff
    //        ref={(tp): TrajectoryPicker => this.trajectoryPickerRef = tp!}
    //    />
    //
    //
    //    // this was called in componentDidMount
    //    this.mount()
    //        .then(() => this.setOpenTrajectoryPickerFunction(this.trajectoryPickerRef.openModal))
    //
    // // TODO JOE beholder uses trajectories
    // // TODO REORG JOE remove trajectory picker stuff
    // private trajectoryFileSelectedCallback = (path: string): void => {
    //    if (!this.uiState.isLiveMode) return
    //
    //    FlyThroughManager.loadFlyThroughTrajectories([path])
    //        .then(() => {
    //                // Make sure that we are in flyThrough mode and that the animation is running.
    //                if (this.props.flyThroughState && !this.props.flyThroughState.enabled) {
    //                        // this.toggleLiveAndRecordedPlay()
    //                        FlyThroughManager.toggleLiveAndRecordedPlay()
    //                }
    //
    //                FlyThroughManager.startFlyThrough()
    //                //this.startFlyThrough()
    //
    //                //if (this.uiState.isLiveModePaused)
    //                if (!this.props.liveModeEnabled)
    //                        console.log("WANTING TO RESUME LIVE MODE")
    //                        // this.resumeLiveMode()
    //        })
    //        .catch(error => {
    //                log.error(`loadFlyThroughTrajectories failed: ${error}`)
    //                dialog.showErrorBox('Error loading trajectory', error.message)
    //        })
    // }

    // }}}


  getCarManagerRef = (carManager: CarManager): void => {
    this.setState({ carManager })
  }

  getFlyThroughManagerRef = (flyThroughManager: FlyThroughManager): void => {
    this.setState({ flyThroughManager })
  }

	render() {
		console.log("RENDERING WITH STORE", this.props.sceneInitialized)


		// CarManager will not be setup the first time through
		let onPointOfInterestCall = () => {return new THREE.Vector3(0,0,0)}
    let onCurrentRotation = () => {return new THREE.Quaternion()}
		if(this.state.carManager) {
      onPointOfInterestCall = () => {return this.state.carManager!.getCarModelPosition()}
      onCurrentRotation = () => {return this.state.carManager!.getCarModelRotation()}
		}


		return (<div style={{width: "100%", height: "100%"}}>
				<AnnotatedSceneController enableAnnotationTileManager={true} onPointOfInterestCall={onPointOfInterestCall} onCurrentRotation={onCurrentRotation} />

				{this.state.annotatedSceneController &&
					<CarManager ref={this.getCarManagerRef} annotatedScene={this.state.annotatedSceneController}/> }

      	{this.state.annotatedSceneController && this.state.carManager &&
					<FlyThroughManager ref={this.getFlyThroughManagerRef} carManager={this.state.carManager!} annotatedSceneController={this.state.annotatedSceneController} />}

				{this.state.flyThroughManager && <KioskMenuView flyThroughManager={this.state.flyThroughManager}/>}
		</div>)
	}

}
