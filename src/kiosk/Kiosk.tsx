/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as React from 'react'
import * as THREE from 'three'
import config from '@src/config'
import CarManager from '../kiosk/components/CarManager'
import {typedConnect} from '@mapperai/mapper-annotated-scene/src/styles/Themed'
import FlyThroughManager from '../kiosk/components/FlyThroughManager'
import KioskMenuView from '../kiosk/components/KioskMenuView'
import Logger from '@mapperai/mapper-annotated-scene/src/util/log'
import AnnotatedSceneController from '@mapperai/mapper-annotated-scene/src/services/AnnotatedSceneController'
import * as watch from 'watch'
import TrajectoryPicker from '../kiosk/TrajectoryPicker'
import * as Electron from 'electron'
import toProps from '@mapperai/mapper-annotated-scene/src/util/toProps'
import StatusWindowActions from '@mapperai/mapper-annotated-scene/src/StatusWindowActions'
import {
	LocationServerStatusClient,
	LocationServerStatusLevel,
} from './clients/LocationServerStatusClient'
import StatusKey from './StatusKey'
import {Events} from '@mapperai/mapper-annotated-scene/src/models/Events'
import loadAnnotations from '../util/loadAnnotations'

const log = Logger(__filename)
const dialog = Electron.remote.dialog

export interface KioskProps {
	isCarInitialized?: boolean
	isInitialOriginSet?: boolean
	isLiveMode?: boolean
	isPlayMode?: boolean
	flyThroughEnabled?: boolean
}
export interface KioskState {
	annotatedSceneController?: AnnotatedSceneController
	carManager?: CarManager
	flyThroughManager?: FlyThroughManager
	hasCalledSetup: boolean
	trajectoryPicker?: TrajectoryPicker
	controllerReady: boolean
}
@typedConnect(toProps(
	'isCarInitialized',
	'isInitialOriginSet',
	'isLiveMode',
	'isPlayMode',
	'flyThroughEnabled',
))
export default class Kiosk extends React.Component<KioskProps, KioskState> {
	private locationServerStatusClient: LocationServerStatusClient
	private locationServerStatusMessageTimeout: number
	private locationServeStatusMessageDuration: number

	constructor(props: KioskProps) {
		super(props)

		this.locationServeStatusMessageDuration = 10000 // milliseconds
		this.locationServerStatusMessageTimeout = 0
		this.locationServerStatusClient = new LocationServerStatusClient(this.onLocationServerStatusUpdate)
		this.locationServerStatusClient.connect()

		this.state = {
			hasCalledSetup: false,
			controllerReady: false,
		}

		const watchForRebuilds: boolean = config['startup.watch_for_rebuilds.enable'] || false

		if (watchForRebuilds) {
			// Watch for rebuilds and exit if we get rebuilt.
			// This relies on a script or something else to restart after we exit
			const self = this

			watch.createMonitor(
				'/tmp',
				{
					filter: function(f: string): boolean {
						return f === '/tmp/visualizer-rebuilt.flag'
					},
				},
				function(monitor) {
					monitor.on('created', function(): void {
						log.info('Rebuilt flag file created, exiting app')
						self.exitApp()
					})

					monitor.on('changed', function(): void {
						log.info('Rebuilt flag file modified, exiting app')
						self.exitApp()
					})
				}
			)
		}

		if (config['fly_through.render.fps']) log.warn('config option fly_through.render.fps has been renamed to fly_through.animation.fps')
	}

	exitApp(): void {
		Electron.remote.getCurrentWindow().close()
	}

	// Display a UI element to tell the user what is happening with the location server.
	// Error messages persist, and success messages disappear after a time-out.
	onLocationServerStatusUpdate = (level: LocationServerStatusLevel, serverStatus: string): void => {
		let className = ''

		switch (level) {
			case LocationServerStatusLevel.INFO:
				className = 'statusOk'
				this.delayLocationServerStatus()
				break
			case LocationServerStatusLevel.WARNING:
				className = 'statusWarning'
				this.cancelHideLocationServerStatus()
				break
			case LocationServerStatusLevel.ERROR:
				className = 'statusError'
				this.cancelHideLocationServerStatus()
				break
			default:
				log.error('unknown LocationServerStatusLevel ' + LocationServerStatusLevel.ERROR)
		}

		const message = <div> Location status: <span className={className}> {serverStatus} </span> </div>

		new StatusWindowActions().setMessage(StatusKey.LOCATION_SERVER, message)
	}

	private delayLocationServerStatus = (): void => {
		this.cancelHideLocationServerStatus()
		this.hideLocationServerStatus()
	}

	private cancelHideLocationServerStatus = (): void => {
		if (this.locationServerStatusMessageTimeout)
			window.clearTimeout(this.locationServerStatusMessageTimeout)
	}

	private hideLocationServerStatus = (): void => {
		this.locationServerStatusMessageTimeout = window.setTimeout(() => {
			new StatusWindowActions().setMessage(StatusKey.LOCATION_SERVER, '')
		}, this.locationServeStatusMessageDuration)
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

	mapKey(key, fn): void {
		this.state.annotatedSceneController!.mapKey(key, fn)
	}

	// this gets called after the CarManager is instantiated
	private beginFlyThrough(): void {
		if (this.state.hasCalledSetup) return

		log.info('Listening for location updates...')

		this.setState({
			hasCalledSetup: true,
		})

		this.state.annotatedSceneController!.activateReadOnlyViewingMode()

		// The camera and the point cloud AOI track the car object, so add it to the scene
		// regardless of whether it is visible in the scene.
		//
		// TODO JOE This is hacky. We should provide the shared lib with a camera focus point function, then the
		// lib can update the camera focus point with that, which will be the
		// Car's position in Kiosk's case.
		this.state.carManager!.addObjectToCar(this.state.annotatedSceneController!.getCamera()) // follow/orbit around the car
		this.state.carManager!.makeCarVisible()

		if (this.state.flyThroughManager) {
			// Start both types of playback, just in case. If fly-through is enabled it will preempt the live location client.
			this.state.flyThroughManager.startFlyThrough()

			this.state.flyThroughManager.resumePlayMode()
			this.state.flyThroughManager.initClient()
		} else {
			log.error('Error in beginFlyThrough() - flyThroughManager expected, but not found')
		}

		this.state.annotatedSceneController!.shouldRender()
	}

	private trajectoryFileSelectedCallback = (path: string): void => {
		log.info('Attempting to load path', path)
		if (this.props.isLiveMode) return

		this.state.flyThroughManager!.loadFlyThroughTrajectories([path])
			.then(() => {
				log.info('Finished loading trajectory from', path)

				// Make sure that we are in flyThrough mode and that the animation is running.
				if (!this.props.flyThroughEnabled)
					this.state.flyThroughManager!.toggleLiveAndRecordedPlay()

				this.state.flyThroughManager!.startFlyThrough()

				if (!this.props.isPlayMode)
					this.state.flyThroughManager!.resumePlayMode()
			})
			.catch(error => {
				log.error(`loadFlyThroughTrajectories failed: ${error}`)
				dialog.showErrorBox('Error loading trajectory', error.message)
			})
	}

	/* eslint-disable typescript/no-explicit-any */

	getCarManagerRef = (ref: any): void => {
		ref && this.setState({carManager: ref.getWrappedInstance() as CarManager})
	}

	getFlyThroughManagerRef = (ref: any): void => {
		ref && this.setState({flyThroughManager: ref.getWrappedInstance() as FlyThroughManager})
	}

	getAnnotatedSceneControllerRef = (ref: any): void => {
		ref && this.setState({annotatedSceneController: ref.getWrappedInstance() as AnnotatedSceneController})
	}

	getTrajectoryPickerRef = (ref: any): void => {
		ref && this.setState({trajectoryPicker: ref})
	}

	/* eslint-enable typescript/no-explicit-any */

	onPointOfInterestCall = (): THREE.Vector3 => new THREE.Vector3(0, 0, 0)
	onCurrentRotation = (): THREE.Quaternion => new THREE.Quaternion()

	async componentDidUpdate(oldProps, oldState) {
		if (!oldState.annotatedSceneController && this.state.annotatedSceneController) {
			this.state.annotatedSceneController.channel.once(Events.ANNOTATED_SCENE_READY, async() => {
				this.setState({controllerReady: true})
				this.registerKeyDownEvents()

				const annotationsPath = config['startup.annotations_path']

				if (annotationsPath) await loadAnnotations.call(this, annotationsPath, this.state.annotatedSceneController)
			})
		}

		if (!oldProps.isCarInitialized && this.props.isCarInitialized) {
			this.onPointOfInterestCall = () => this.state.carManager!.getCarModelPosition()
			this.onCurrentRotation = () => this.state.carManager!.getCarModelRotation()
			this.forceUpdate()
		}

		if (
			!this.state.hasCalledSetup && this.state.controllerReady &&
			this.props.isCarInitialized && this.props.isInitialOriginSet &&
			this.state.carManager && this.state.flyThroughManager
		) {
			await this.state.flyThroughManager.loadUserData()

			this.beginFlyThrough()
		}
	}

	render(): JSX.Element {
		// CarManager will not be setup the first time through

		return (
			<div style={{width: '100%', height: '100%'}}>
				<AnnotatedSceneController
					ref={this.getAnnotatedSceneControllerRef}
					onPointOfInterestCall={this.onPointOfInterestCall}
					onCurrentRotation={this.onCurrentRotation}
					config={{
						// required
						'startup.point_cloud_bounding_box': config['startup.point_cloud_bounding_box'],

						// other ones optional
						...config,
					}}
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
