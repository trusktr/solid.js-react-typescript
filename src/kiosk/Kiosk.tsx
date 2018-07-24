/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

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
import TrajectoryPicker from "@/kiosk/TrajectoryPicker";
import * as Electron from "electron";

const log = Logger(__filename)
const dialog = Electron.remote.dialog

export interface KioskProps {
    isCarInitialized ?: boolean
    isInitialOriginSet ?: boolean
    isLiveMode ?: boolean
    isPlayMode ?: boolean
    flyThroughEnabled ?: boolean
}

export interface KioskState {
    annotatedSceneController?: AnnotatedSceneController
    carManager?: CarManager
    flyThroughManager?: FlyThroughManager
    hasCalledSetup: boolean
    isChildLoopAdded: boolean
    trajectoryPicker ?: TrajectoryPicker
}

@typedConnect(createStructuredSelector({
    isCarInitialized: (state) => state.get(AnnotatedSceneState.Key).isCarInitialized,
    isInitialOriginSet: (state) => state.get(AnnotatedSceneState.Key).isInitialOriginSet,
    isLiveMode: (state) => state.get(AnnotatedSceneState.Key).isLiveMode,
    isPlayMode: (state) => state.get(AnnotatedSceneState.Key).isPlayMode,
    flyThroughEnabled: (state) => state.get(AnnotatedSceneState.Key).flyThroughEnabled,
}))
export default class Kiosk extends React.Component<KioskProps, KioskState> {

    constructor(props: KioskProps) {
        super(props)

        this.state = {
            hasCalledSetup: false,
            isChildLoopAdded: false,
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
                }
            )
        }

        if (config['fly_through.render.fps'])
            log.warn('config option fly_through.render.fps has been renamed to fly_through.animation.fps')
    }

    exitApp(): void {
        Electron.remote.getCurrentWindow().close()
    }

    async componentWillReceiveProps(newProps: KioskProps) {
        if (!this.state.isChildLoopAdded && this.state.annotatedSceneController && this.state.flyThroughManager) {
            // this is the transition from the Scene not being setup to when it is
            // Since it's setup now let's setup the fly through manager
            const flyThroughManager = this.state.flyThroughManager
            // flyThroughManager.init() -- called on componentDidMount within FlyThroughManager
            const controller = this.state.annotatedSceneController
            controller.addChildAnimationLoop(flyThroughManager.getAnimationLoop())

            flyThroughManager.startLoop()

            // Register key events
            this.registerKeyDownEvents()

            this.setState({isChildLoopAdded: true})
        }

        if (newProps.isCarInitialized && newProps.isInitialOriginSet && !this.state.hasCalledSetup &&
            this.state.annotatedSceneController && this.state.carManager && this.state.flyThroughManager
        ) {

            await this.state.flyThroughManager.loadUserData()

            // At this point the car model has been loaded and user data has also been loaded, we're ready for listen()
            // this only gets called once because then state.hasCalledSetup is set to True
			this.listen()

        }

    }

    private registerKeyDownEvents(): void {
        const cameraOffsetDelta = 1

        this.mapKey('ArrowLeft', () => {
            this.state.annotatedSceneController!.adjustCameraXOffset(cameraOffsetDelta)
        })
        this.mapKey('ArrowUp', () => {
            this.state.annotatedSceneController!.adjustCameraYOffset(cameraOffsetDelta)
        })
        this.mapKey('ArrowRight', () => {
            this.state.annotatedSceneController!.adjustCameraXOffset(-1 * cameraOffsetDelta)
        })
        this.mapKey('ArrowDown', () => {
            this.state.annotatedSceneController!.adjustCameraYOffset(-1 * cameraOffsetDelta)
        })
    }

	mapKey( key, fn ): void {
        this.state.annotatedSceneController!.mapKey(key, fn)
	}

    // this gets called after the CarManager is instantiated
    private listen(): void {
        if (this.state.hasCalledSetup) return

        // TODO FIXME avoid access of deep state
        if (!this.state.annotatedSceneController!.state.sceneManager) {
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
        // TODO FIXME avoid access of deep state
        this.state.carManager!.addObjectToCar(this.state.annotatedSceneController!.state.sceneManager!.getCamera()) // follow/orbit around the car
        this.state.carManager!.makeCarVisible()

        if (this.state.flyThroughManager) {
            // Start both types of playback, just in case. If fly-through is enabled it will preempt the live location client.
            this.state.flyThroughManager.startFlyThrough()

            this.state.flyThroughManager.resumePlayMode()
            this.state.flyThroughManager.initClient()
        } else {
            log.error("Error in listen() - flyThroughManager expected, but not found")
        }

        this.state.annotatedSceneController!.shouldRender()
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

    // }}}

    getCarManagerRef = (ref: any): void => {
        ref && this.setState({ carManager: ref.getWrappedInstance() as CarManager })
    }

	getFlyThroughManagerRef = (ref: any): void => {
		ref && this.setState({ flyThroughManager: ref.getWrappedInstance() as FlyThroughManager })
	}

	getAnnotatedSceneControllerRef = (ref: any): void => {
		ref && this.setState({ annotatedSceneController: ref.getWrappedInstance() as AnnotatedSceneController })
	}

    private trajectoryFileSelectedCallback = (path: string): void => {
        log.info("Attempting to load path", path)
        if (this.props.isLiveMode) return

        this.state.flyThroughManager!.loadFlyThroughTrajectories([path])
            .then(() => {
                log.info("Finished loading trajectory from", path)

                // Make sure that we are in flyThrough mode and that the animation is running.
                if (!this.props.flyThroughEnabled) {
                    this.state.flyThroughManager!.toggleLiveAndRecordedPlay()
                }

                this.state.flyThroughManager!.startFlyThrough()

                if (!this.props.isPlayMode) {
                    this.state.flyThroughManager!.resumePlayMode()
                }
            })
            .catch(error => {
                log.error(`loadFlyThroughTrajectories failed: ${error}`)
                dialog.showErrorBox('Error loading trajectory', error.message)
            })
    }

    getTrajectoryPickerRef = (ref: any): void => {
        ref && this.setState({trajectoryPicker: ref})
    }

    render(): JSX.Element {
        // CarManager will not be setup the first time through
		let onPointOfInterestCall = () => new THREE.Vector3(0,0,0)
		let onCurrentRotation = () => new THREE.Quaternion()

        if (this.state.carManager && this.props.isCarInitialized) {
			onPointOfInterestCall = () => this.state.carManager!.getCarModelPosition()
			onCurrentRotation = () => this.state.carManager!.getCarModelRotation()
		}

        return (
            <div style={{width: "100%", height: "100%"}}>
				<AnnotatedSceneController
					ref={this.getAnnotatedSceneControllerRef}
					onPointOfInterestCall={onPointOfInterestCall}
					onCurrentRotation={onCurrentRotation}
					initialFocusPoint={config['startup.point_cloud_bounding_box']}
				/>

				{this.state.annotatedSceneController &&
					<CarManager
						ref={this.getCarManagerRef}
						annotatedScene={this.state.annotatedSceneController}
					/>
				}

				{this.state.annotatedSceneController && this.state.carManager &&
					<FlyThroughManager
						ref={this.getFlyThroughManagerRef}
						carManager={this.state.carManager}
						annotatedSceneController={this.state.annotatedSceneController}
					/>
				}

                {this.state.flyThroughManager &&
					<TrajectoryPicker ref={this.getTrajectoryPickerRef} />
				}

                {this.state.flyThroughManager && this.state.trajectoryPicker &&
	                <KioskMenuView
	                    flyThroughManager={this.state.flyThroughManager}
	                    openTrajectoryPickerFunction={() => {
	                        this.state.trajectoryPicker!.openModal(this.trajectoryFileSelectedCallback)
	                    }}
	                />
                }
            </div>
        )
    }

}
