/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import config from '../../../config'
import * as Electron from 'electron'
import * as React from 'react'
import {getValue} from 'typeguard'
import * as THREE from 'three'
import {sprintf} from 'sprintf-js'
import {ChildAnimationLoop} from 'animation-loop'
import {typedConnect} from '../../src/styles/Themed'
import StatusWindow from '../../components/StatusWindow'
import Logger from '../../../util/log'
import PointCloudManager from '../../src/services/PointCloudManager'
import GroundPlaneManager from '../../src/services/GroundPlaneManager'
import {SceneManager} from '../../src/services/SceneManager'
import LayerManager, {Layer, LayerToggle} from '../../src/services/LayerManager'
import {UtmCoordinateSystem} from '../../UtmCoordinateSystem'
import {EventEmitter} from 'events'
import {PointCloudTileManager} from '../../tile/PointCloudTileManager'
import {GrpcTileServiceClient, RestTileServiceClient, MapperTileServiceClient} from '../../tile/TileServiceClient'
import {ScaleProvider} from '../../tile/ScaleProvider'
import * as OBJLoader from 'three-obj-loader'
import {AnnotationTileManager} from '../../tile/AnnotationTileManager'
import StatusWindowActions from '../../StatusWindowActions'
import {StatusKey} from '../../src/models/StatusKey'
import {AnnotationManager} from '../../AnnotationManager'
import AnnotatedSceneActions from '../../src/store/actions/AnnotatedSceneActions'
import AreaOfInterestManager from '../../src/services/AreaOfInterestManager'
import {BusyError} from '../../tile/TileManager'
import {THREEColorValue} from '../../src/THREEColorValue-type'
import {KeyboardEventHighlights} from '../../../electron-ipc/Messages'
import ResizeObserver from 'react-resize-observer'
import toProps from '../../../util/toProps'
import StatusWindowState from '../../src/models/StatusWindowState'
import Key from '../../src/models/Key'
import {Events} from '../../src/models/Events'

const log = Logger(__filename)

OBJLoader(THREE)

const dialog = Electron.remote.dialog
const timeBetweenErrorDialogsMs = 30000

interface CameraState {
	lastCameraCenterPoint: THREE.Vector3 | null // point in three.js coordinates where camera center line has recently intersected ground plane
}

interface AnnotatedSceneControllerSettings {
	useGrpcClient: boolean // Old style uses a gRPC client; new style uses a Swagger auto-generated REST client.
}

export interface AnnotatedSceneControllerProps {
	backgroundColor?: THREEColorValue
	onPointOfInterestCall?: () => THREE.Vector3
	onCurrentRotation?: () => THREE.Quaternion
	statusWindowState?: StatusWindowState
	pointOfInterest?: THREE.Vector3
	getAnnotationManagerRef?: (ref: AnnotationManager) => void
	setKeys?: () => void
	camera?: THREE.Camera
	numberKeyPressed?: number | null
	isHoveringOnMarker?: boolean

	initialBoundingBox: [ number, number, number, number, number, number ]
}
export interface AnnotatedSceneControllerState {
	cameraState: CameraState // isolating camera state in case we decide to migrate it to a Camera Manager down the road
	statusWindow?: StatusWindow
	pointCloudManager?: PointCloudManager
	areaOfInterestManager?: AreaOfInterestManager
	groundPlaneManager?: GroundPlaneManager
	sceneManager?: SceneManager
	layerManager?: LayerManager
	annotationTileManager?: AnnotationTileManager
	annotationManager?: AnnotationManager
	container?: HTMLDivElement
	componentWidth: number
	componentHeight: number
}
@typedConnect(toProps(
	'statusWindowState',
	'pointOfInterest',
	'numberKeyPressed',
))
export default class AnnotatedSceneController extends React.Component<AnnotatedSceneControllerProps, AnnotatedSceneControllerState> {
	public utmCoordinateSystem: UtmCoordinateSystem
	private settings: AnnotatedSceneControllerSettings
	private scaleProvider: ScaleProvider
	private tileServiceClient: MapperTileServiceClient
	private pointCloudTileManager: PointCloudTileManager
	channel: EventEmitter
	lastPointCloudLoadedErrorModalMs: number
	private isAllSet: boolean

	private registeredKeyDownEvents: Map<string, Set<(e: KeyboardEvent | KeyboardEventHighlights) => void>> = new Map() // mapping between KeyboardEvent.key and function to execute
	private registeredKeyUpEvents: Map<string, Set<(e: KeyboardEvent | KeyboardEventHighlights) => void>> = new Map() // mapping between KeyboardEvent.key and function to execute
	private heldKeys: Set<Key> = new Set()

	constructor(props: AnnotatedSceneControllerProps) {
		super(props)

		this.settings = {
			useGrpcClient: !!config['tile_client.service.use_grpc'],
		}

		this.state = {
			cameraState: {
				lastCameraCenterPoint: null,
			},
			componentWidth: 1000,
			componentHeight: 1000,
		}

		// These don't need to be state, because these references don't change
		this.channel = new EventEmitter()
		this.utmCoordinateSystem = new UtmCoordinateSystem()
		this.scaleProvider = new ScaleProvider()

		this.tileServiceClient = this.settings.useGrpcClient
			? new GrpcTileServiceClient(this.scaleProvider, this.channel)
			: new RestTileServiceClient(this.scaleProvider, this.channel)

		this.pointCloudTileManager = new PointCloudTileManager(
			this.scaleProvider,
			this.utmCoordinateSystem,
			this.tileServiceClient,
			this.channel
		)

		this.lastPointCloudLoadedErrorModalMs = 0

		// TODO JOE clean up event listeners on unmount
		window.addEventListener('keydown', this.onKeyDown)
		window.addEventListener('keyup', this.onKeyUp)
	}

	updateCurrentLocationStatusMessage(positionUtm: THREE.Vector3): void {
		// This is a hack to allow data with no coordinate reference system to pass through the UTM classes.
		// Data in local coordinate systems tend to have small values for X (and Y and Z) which are invalid in UTM.
		if (positionUtm.x > 100000) { // If it looks local, don't convert to LLA. TODO CLYDE fix this.
			const positionLla = this.utmCoordinateSystem.utmVectorToLngLatAlt(positionUtm)
			const messageLla = sprintf('LLA: %.4fE %.4fN %.1falt', positionLla.x, positionLla.y, positionLla.z)

			new StatusWindowActions().setMessage(StatusKey.CURRENT_LOCATION_LLA, messageLla)
		}

		const messageUtm = sprintf('UTM %s: %dE %dN %.1falt', this.utmCoordinateSystem.utmZoneString(), positionUtm.x, positionUtm.y, positionUtm.z)

		new StatusWindowActions().setMessage(StatusKey.CURRENT_LOCATION_UTM, messageUtm)
	}

	setup(): void {
		// TODO JOE clean up event listeners on unmount
		this.state.container!.addEventListener('mousemove', this.state.annotationManager!.checkForActiveMarker)

		this.state.container!.addEventListener('mousedown', () => {
			new AnnotatedSceneActions().setIsMouseDown(true)
		})

		this.state.container!.addEventListener('mousemove', () => {
			new AnnotatedSceneActions().setIsMouseDraggingIfIsMouseDown()
		})

		this.state.container!.addEventListener('mouseup', () => {
			new AnnotatedSceneActions().setIsMouseDown(false)
		})

		this.state.container!.addEventListener('mouseup', () => {
			// Waiting for 0 time queues this block to run in the next macro-task, so that for example
			// AnnotationManager.checkForAnnotationSelection() can fire on mouseup and get the old
			// value of isMouseDragging, before we negate isMouseDragging.
			setTimeout(() => {
				new AnnotatedSceneActions().setIsMouseDraggingFalse()
			}, 0)
		})

		this.state.container!.addEventListener('mouseup', this.state.annotationManager!.checkForConflictOrDeviceSelection)
		this.state.container!.addEventListener('mouseup', this.state.annotationManager!.checkForAnnotationSelection)
		this.state.container!.addEventListener('mouseup', this.state.annotationManager!.addAnnotationMarker)
		this.state.container!.addEventListener('mouseup', this.state.annotationManager!.addLaneConnection)
		this.state.container!.addEventListener('mouseup', this.state.annotationManager!.connectNeighbor)
		this.state.container!.addEventListener('mouseup', this.state.annotationManager!.joinAnnotationsEventHandler)
	}

	/**
	 * Set the point cloud as the center of the visible world.
	 */
	// Currently this function is only used on keyboard shortcuts
	// IDEA JOE long term move orbit controls to Camera Manger
	focusOnPointCloud(): void {
		this.state.pointCloudManager!.focusOnPointCloud()
		this.displayCameraInfo()
	}

	// IDEA JOE long term move orbit controls to Camera Manger
	// Display some info in the UI about where the camera is pointed.
	private displayCameraInfo = (): void => {
		if (!getValue(() => this.props.statusWindowState!.enabled, false)) return

		// const currentPoint = this.currentPointOfInterest()
		const currentPoint = this.props.pointOfInterest

		if (currentPoint) {
			const oldPoint = this.state.cameraState.lastCameraCenterPoint
			const newPoint = currentPoint.clone().round()
			const samePoint = oldPoint && oldPoint.x === newPoint.x && oldPoint.y === newPoint.y && oldPoint.z === newPoint.z

			if (!samePoint) {
				const cameraState = this.state.cameraState

				cameraState.lastCameraCenterPoint = newPoint
				this.setState({cameraState})

				const utm = this.utmCoordinateSystem.threeJsToUtm(newPoint)

				this.updateCurrentLocationStatusMessage(utm)
			}
		}
	}

	activateReadOnlyViewingMode() {
		this.state.layerManager!.setLayerVisibility([Layer.POINT_CLOUD, Layer.ANNOTATIONS], true)

		// TODO JOE all that should be needed here is just setting layer
		// visibility, the rest is not needed (assuming the following are all
		// put in layers)

		this.state.areaOfInterestManager!.removeAxisFromScene()
		this.state.sceneManager!.removeCompassFromScene()
		this.state.areaOfInterestManager!.hideGridVisibility()

		this.state.pointCloudManager!.hidePointCloudBoundingBox()
	}

	addLayer(name: string, toggle: LayerToggle): void {
		this.state.layerManager!.addLayer(name, toggle)
	}

	setLayerVisibility(layerKeysToShow: string[], hideOthers = false): void {
		this.state.layerManager!.setLayerVisibility(layerKeysToShow, hideOthers)
	}

	cleanTransformControls(): void {
		this.state.annotationManager!.cleanTransformControls()
	}

	/**
	 *  Set the camera directly above the current target, looking down.
	 */
	// TODO JOE long term move orbit controls to Camera Manger
	resetTiltAndCompass(): void {
		this.state.sceneManager!.resetTiltAndCompass()
	}

	unloadPointCloudData() {
		this.state.pointCloudManager!.unloadPointCloudData()
	}

	toggleCameraType() {
		this.state.sceneManager!.toggleCameraType()
	}

	addObjectToScene(object: THREE.Object3D) {
		new AnnotatedSceneActions().addObjectToScene(object)
	}

	removeObjectFromScene(object: THREE.Object3D) {
		new AnnotatedSceneActions().removeObjectFromScene(object)
	}

	adjustCameraXOffset(value: number) {
		this.state.sceneManager!.adjustCameraXOffset(value)
	}

	adjustCameraYOffset(value: number) {
		this.state.sceneManager!.adjustCameraYOffset(value)
	}

	addChildAnimationLoop(childLoop: ChildAnimationLoop) {
		this.state.sceneManager!.addChildAnimationLoop(childLoop)
	}

	getCamera(): THREE.Camera {
		return this.state.sceneManager!.getCamera()
	}

	/**
	 * Handle keyboard events
	 */
	onKeyDown = (event: KeyboardEvent | KeyboardEventHighlights): void => {
		// TODO JOE we might have to add this check elsewhere now that it is disabled, if we need it
		// if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return

		// TODO JOE replace this with keyHeld API usage
		this.possiblySetNumberPressed(event)

		const handlers = this.registeredKeyDownEvents.get(event.key)

		handlers && handlers.size && handlers.forEach(fn => fn(event))
	}

	onKeyUp = (event: KeyboardEvent | KeyboardEventHighlights): void => {
		// TODO JOE we might have to add this check elsewhere now that it is disabled, if we need it
		// if (event.defaultPrevented) return

		// TODO JOE replace this with keyHeld API usage
		this.possiblyUnsetNumberPressed(event)

		const handlers = this.registeredKeyUpEvents.get(event.key)

		handlers && handlers.size && handlers.forEach(fn => fn(event))
	}

	private possiblySetNumberPressed = (event: KeyboardEvent | KeyboardEventHighlights): void => {
		if (event.repeat) return

		if (event.keyCode >= 48 && event.keyCode <= 57) { // digits 0 to 9
			new AnnotatedSceneActions().setNumberKeyPressed(parseInt(event.key, 10))
		}
	}

	private possiblyUnsetNumberPressed = (event: KeyboardEvent | KeyboardEventHighlights): void => {
		if (this.props.numberKeyPressed === event.keyCode) new AnnotatedSceneActions().setNumberKeyPressed(null)
	}

	setKeys() {
		const actions = new AnnotatedSceneActions()

		this.keyHeld('Control', held => actions.setControlKeyPressed(held))
		this.keyHeld('Shift', held => actions.setShiftKeyPressed(held))
	}

	keyHeld(key: Key, fn: (held: boolean) => void) {
		this.mapKeyDown(key, () => {
			if (!this.heldKeys.has(key)) {
				this.heldKeys.add(key)
				fn(true)
			}
		})

		this.mapKeyUp(key, () => {
			this.heldKeys.delete(key)
			fn(false)
		})
	}

	mapKey(key: Key, fn: (e?: KeyboardEvent | KeyboardEventHighlights) => void) {
		this.mapKeyDown(key, fn)
	}

	mapKeyDown(key: Key, fn: (e?: KeyboardEvent | KeyboardEventHighlights) => void) {
		this.registerKeyboardDownEvent(key, fn)
	}

	mapKeyUp(key: Key, fn: (e?: KeyboardEvent | KeyboardEventHighlights) => void) {
		this.registerKeyboardUpEvent(key, fn)
	}

	registerKeyboardDownEvent(key: Key, fn: (e: KeyboardEvent | KeyboardEventHighlights) => void) {
		let handlers = this.registeredKeyDownEvents.get(key)

		if (!handlers)
			this.registeredKeyDownEvents.set(key, handlers = new Set())

		handlers.add(fn)
	}

	registerKeyboardUpEvent(key: Key, fn: (e?: KeyboardEvent | KeyboardEventHighlights) => void) {
		let handlers = this.registeredKeyUpEvents.get(key)

		if (!handlers)
			this.registeredKeyUpEvents.set(key, handlers = new Set())

		handlers.add(fn)
	}

	private handleTileManagerLoadError = (dataType: Key, err: Error): void => {
		if (err instanceof BusyError) {
			log.info(err.message)
		} else {
			console.error(dataType, err)

			const now = new Date().getTime()

			if (now - this.lastPointCloudLoadedErrorModalMs < timeBetweenErrorDialogsMs) {
				log.warn(err.message)
			} else {
				log.error(err.message)
				dialog.showErrorBox(`${dataType} Load Error`, err.message)
				this.lastPointCloudLoadedErrorModalMs = now
			}
		}
	}

	makeAnnotationTileManager() {
		this.setState({
			annotationTileManager: new AnnotationTileManager(
				this.scaleProvider,
				this.utmCoordinateSystem,
				this.tileServiceClient,
				this.channel,

				// TODO JOE remove this reference, see TODO in AnnotationTileManager
				this.state.annotationManager!,
			),
		})

		new AnnotatedSceneActions().setIsAnnotationTileManagerEnabled(true)
	}

	loadInitialPointCloudTiles(): Promise<void> {
		return this.state.pointCloudManager!.loadPointCloudDataFromConfigBoundingBox(this.props.initialBoundingBox)
	}

	shouldRender() {
		this.channel.emit(Events.SCENE_SHOULD_RENDER)
	}

	componentDidUpdate(_, prevState, __) {
		if (!this.isAllSet && this.state.sceneManager && this.state.container && this.state.annotationManager) {
			this.isAllSet = true

			this.setup()
		}

		if (!prevState.annotationManager && this.state.annotationManager)
			this.makeAnnotationTileManager()

		if (!prevState.pointCloudManager && this.state.pointCloudManager)
			this.loadInitialPointCloudTiles()

		this.displayCameraInfo()
	}

	componentDidMount() {
		this.setKeys()
		this.props.setKeys && this.props.setKeys()
	}

	/* eslint-disable typescript/no-explicit-any */

	getAnnotationManagerRef = (ref: any): void => {
		if (ref) {
			ref = ref.getWrappedInstance() as AnnotationManager
			this.setState({annotationManager: ref})
			this.props.getAnnotationManagerRef && this.props.getAnnotationManagerRef(ref)
		}
	}

	getSceneManagerRef = (ref: any): void => {
		ref && this.setState({sceneManager: ref.getWrappedInstance() as SceneManager})
	}

	getStatusWindowRef = (ref: any) => {
		ref && this.setState({statusWindow: ref.getWrappedInstance() as StatusWindow})
	}

	getPointCloudManagerRef = (ref: any) => {
		ref && this.setState({pointCloudManager: ref.getWrappedInstance() as any})
	}

	getLayerManagerRef = (layerManager: LayerManager): void => {
		layerManager && this.setState({layerManager})
	}

	getAreaOfInterestManagerRef = (ref: any): void => {
		ref && this.setState({areaOfInterestManager: ref.getWrappedInstance() as AreaOfInterestManager})
	}

	getGroundPlaneManagerRef = (ref: any): void => {
		ref && this.setState({groundPlaneManager: ref.getWrappedInstance() as GroundPlaneManager})
	}

	getContainerRef = (container: HTMLDivElement | null): void => {
		container && this.setState({container})
	}

	/* eslint-enable typescript/no-explicit-any */

	onMouseMove = (event): void => {
		// TODO JOE don't make a `new AnnotatedSceneActions` every time, just use a singleton
		new AnnotatedSceneActions().setMousePosition({
			x: event.clientX - event.target.offsetLeft,
			y: event.clientY - event.target.offsetTop,
		})
	}

	render(): JSX.Element {
		const {
			scaleProvider,
			utmCoordinateSystem,
			handleTileManagerLoadError,
			channel,
		} = this
		const {
			layerManager,
			pointCloudManager,
			groundPlaneManager,
			sceneManager,
			annotationTileManager,
			container,
			areaOfInterestManager,
		} = this.state

		return (
			<div
				ref={this.getContainerRef}
				className="scene-container"
				onMouseMove={this.onMouseMove}
				style={{
					cursor: this.props.isHoveringOnMarker ? 'pointer' : 'auto',
				}}
			>

				<ResizeObserver
					onResize={(rect) => {
						this.setState({
							componentWidth: rect.width,
							componentHeight: rect.height,
						})
					}}
				/>

				<StatusWindow
					ref={this.getStatusWindowRef}
					eventEmitter={this.channel}
				/>

				{ container && areaOfInterestManager &&
					<SceneManager
						ref={this.getSceneManagerRef}

						backgroundColor={this.props.backgroundColor}
						width={this.state.componentWidth}
						height={this.state.componentHeight}

						utmCoordinateSystem={this.utmCoordinateSystem}
						channel={this.channel}
						areaOfInterestManager={areaOfInterestManager}

						container={container}
					/>
				}

				{ groundPlaneManager &&
					<AreaOfInterestManager
						ref={this.getAreaOfInterestManagerRef}
						getPointOfInterest={this.props.onPointOfInterestCall}
						getCurrentRotation={this.props.onCurrentRotation}
						utmCoordinateSystem={this.utmCoordinateSystem}
						groundPlaneManager={groundPlaneManager}
						channel={this.channel}
					/>
				}

				<LayerManager ref={this.getLayerManagerRef} channel={this.channel} />

				{ layerManager && sceneManager &&
					<PointCloudManager
						ref={this.getPointCloudManagerRef}
						utmCoordinateSystem={this.utmCoordinateSystem}
						sceneManager={sceneManager}
						pointCloudTileManager={this.pointCloudTileManager}
						layerManager={layerManager}
						handleTileManagerLoadError={this.handleTileManagerLoadError}
						channel={this.channel}
					/>
				}

				{ pointCloudManager && groundPlaneManager && sceneManager && layerManager &&
					<AnnotationManager
						ref={this.getAnnotationManagerRef}
						{...{
							scaleProvider,
							utmCoordinateSystem,
							handleTileManagerLoadError,
							channel,

							layerManager,
							pointCloudManager,
							groundPlaneManager,
							annotationTileManager,
							sceneManager,
						}}

					/>
				}

				{ layerManager &&
					<GroundPlaneManager
						ref={this.getGroundPlaneManagerRef}
						utmCoordinateSystem={this.utmCoordinateSystem}
						areaOfInterestManager={areaOfInterestManager!}
						channel={this.channel}
						layerManager={layerManager}
					/>
				}

			</div>
		)
	}
}
