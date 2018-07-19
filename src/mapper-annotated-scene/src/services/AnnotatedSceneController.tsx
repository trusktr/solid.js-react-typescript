import * as Electron from 'electron'
import * as React from "react"
import {getValue} from "typeguard";
import * as THREE from "three";
import {sprintf} from 'sprintf-js'
import {AnimationLoop, ChildAnimationLoop} from 'animation-loop'
import {createStructuredSelector} from "reselect";
import {typedConnect} from "@/mapper-annotated-scene/src/styles/Themed";
import AnnotatedSceneState from "@/mapper-annotated-scene/src/store/state/AnnotatedSceneState";
import StatusWindow from "@/mapper-annotated-scene/components/StatusWindow";
import Logger from "@/util/log";
import PointCloudManager from "@/mapper-annotated-scene/src/services/PointCloudManager";
import GroundPlaneManager from "@/mapper-annotated-scene/src/services/GroundPlaneManager"
import {SceneManager} from "@/mapper-annotated-scene/src/services/SceneManager";
import {Layer, default as LayerManager} from "@/mapper-annotated-scene/src/services/LayerManager";
import {UtmCoordinateSystem} from "@/mapper-annotated-scene/UtmCoordinateSystem";
import {EventEmitter} from "events"
import {PointCloudTileManager} from "@/mapper-annotated-scene/tile/PointCloudTileManager";
import {TileServiceClient} from "@/mapper-annotated-scene/tile/TileServiceClient"
import {ScaleProvider} from "@/mapper-annotated-scene/tile/ScaleProvider"
import * as OBJLoader from 'three-obj-loader'
import {isTupleOfNumbers} from "@/util/Validation";
import config from "@/config";
import {AnnotationTileManager} from "@/mapper-annotated-scene/tile/AnnotationTileManager";
import StatusWindowActions from "@/mapper-annotated-scene/StatusWindowActions";
import {StatusKey} from "@/mapper-annotated-scene/src/models/StatusKey";
import {AnnotationManager} from "@/mapper-annotated-scene/AnnotationManager";
import AnnotatedSceneActions from "@/mapper-annotated-scene/src/store/actions/AnnotatedSceneActions";
import AreaOfInterestManager from "@/mapper-annotated-scene/src/services/AreaOfInterestManager";
import {BusyError} from "@/mapper-annotated-scene/tile/TileManager"
import {THREEColorValue} from "@/mapper-annotated-scene/src/THREEColorValue-type";
import LayerToggle from "@/mapper-annotated-scene/src/models/LayerToggle";
import {Map} from 'immutable'
import {KeyboardEventHighlights} from "@/electron-ipc/Messages"
import ResizeObserver from 'react-resize-observer'
import {Events} from "@/mapper-annotated-scene/src/models/Events";

const log = Logger(__filename)

OBJLoader(THREE)

const dialog = Electron.remote.dialog

const timeBetweenErrorDialogsMs = 30000

export interface CameraState {
    lastCameraCenterPoint: THREE.Vector3 | null // point in three.js coordinates where camera center line has recently intersected ground plane
}

// TODO JOE WEDNESDAY moved from Annotator.tsx
interface AnnotatorSettings {
    cameraOffset: THREE.Vector3
    orthoCameraHeight: number // ortho camera uses world units (which we treat as meters) to define its frustum
    defaultAnimationFrameIntervalMs: number | false
    animationFrameIntervalSecs: number | false // how long we have to update the animation before the next frame fires
    enableTileManagerStats: boolean
    timeToDisplayHealthyStatusMs: number
    maxDistanceToDecorations: number // meters
    skyRadius: number
    cameraToSkyMaxDistance: number
}

export interface IAnnotatedSceneControllerProps {
	backgroundColor?: THREEColorValue
    onPointOfInterestCall ?: () => THREE.Vector3
    onCurrentRotation ?: () => THREE.Quaternion
    // statusWindowState ?: StatusWindowState
    showStatusWindow ?: boolean
    pointOfInterest?: THREE.Vector3
    getAnnotationManagerRef?: (ref: AnnotationManager) => void
	setKeys?: () => void
	camera?: THREE.Camera
	numberKeyPressed?: number | null
	isHoveringOnMarker?: boolean

    lockBoundaries?: boolean
    lockTerritories?: boolean
    lockLanes?: boolean
    lockTrafficDevices?: boolean

	initialFocusPoint: [ number, number, number, number, number, number ]
}

export interface IAnnotatedSceneControllerState {
    cameraState: CameraState // isolating camera state incase we decide to migrate it to a Camera Manager down the road
    statusWindow?: StatusWindow
    pointCloudManager?: PointCloudManager
    areaOfInterestManager?: AreaOfInterestManager
    groundPlaneManager?: GroundPlaneManager
    sceneManager?: SceneManager
    layerManager?: LayerManager
    annotationTileManager?: AnnotationTileManager
    annotationManager?: AnnotationManager
    registeredKeyDownEvents: Map<string, any> // mapping between KeyboardEvent.key and function to execute
    registeredKeyUpEvents: Map<string, any> // mapping between KeyboardEvent.key and function to execute
    container?: HTMLDivElement
    componentWidth: number
    componentHeight: number
}


@typedConnect(createStructuredSelector({
    // statusWindowState: (state) => state.get(AnnotatedSceneState.Key).statusWindowState,
    showStatusWindow: (state) => state.get(AnnotatedSceneState.Key).statusWindowState.enabled,
    pointOfInterest: (state) => state.get(AnnotatedSceneState.Key).pointOfInterest,
    numberKeyPressed: (state) => state.get(AnnotatedSceneState.Key).numberKeyPressed,
}))
export default class AnnotatedSceneController extends React.Component<IAnnotatedSceneControllerProps, IAnnotatedSceneControllerState> {
    public utmCoordinateSystem: UtmCoordinateSystem

    private scaleProvider: ScaleProvider
	private tileServiceClient: TileServiceClient
    private pointCloudTileManager: PointCloudTileManager
    channel: EventEmitter
	lastPointCloudLoadedErrorModalMs: number
	private isAllSet: boolean

    constructor(props) {
        super(props)

        // TODO not used currently
        // enableTileManagerStats: !!config['tile_manager.stats_display.enable'],

        this.state = {
            cameraState: {
                lastCameraCenterPoint: null,
            },
            registeredKeyDownEvents: Map<string, any>(),
            registeredKeyUpEvents: Map<string, any>(),
            componentWidth: 1000,
            componentHeight: 1000,
        }

        // These don't need to be state, because these references don't change
        this.channel = new EventEmitter()
        this.utmCoordinateSystem = new UtmCoordinateSystem()
        // ^ utmCoordinateSystem doesn't need to be a React component because it
        // isn't hooked to Redux.

        // TODO JOE THURSDAY if not creating it here, pass pointCloudTileManager as a prop
        this.scaleProvider = new ScaleProvider()
        this.tileServiceClient = new TileServiceClient(this.scaleProvider, this.channel)
        this.pointCloudTileManager = new PointCloudTileManager(
            this.scaleProvider,
            this.utmCoordinateSystem,
            this.tileServiceClient,
            this.channel
        )

		this.lastPointCloudLoadedErrorModalMs = 0

        window.addEventListener('keydown', this.onKeyDown)
        window.addEventListener('keyup', this.onKeyUp)
    }

    updateCurrentLocationStatusMessage(positionUtm: THREE.Vector3): void {
        // This is a hack to allow data with no coordinate reference system to pass through the UTM classes.
        // Data in local coordinate systems tend to have small values for X (and Y and Z) which are invalid in UTM.
        if (positionUtm.x > 100000) { // If it looks local, don't convert to LLA. TODO fix this.
            const positionLla = this.utmCoordinateSystem.utmVectorToLngLatAlt(positionUtm)
            const messageLla = sprintf('LLA: %.4fE %.4fN %.1falt', positionLla.x, positionLla.y, positionLla.z)

            // this.statusWindow.setMessage(statusKey.currentLocationLla, messageLla)
            new StatusWindowActions().setMessage(StatusKey.CURRENT_LOCATION_LLA, messageLla)
        }
        const messageUtm = sprintf('UTM %s: %dE %dN %.1falt', this.utmCoordinateSystem.utmZoneString(), positionUtm.x, positionUtm.y, positionUtm.z)
        // this.statusWindow.setMessage(statusKey.currentLocationUtm, messageUtm)
        new StatusWindowActions().setMessage(StatusKey.CURRENT_LOCATION_UTM, messageUtm)
    }

	// TODO this can have a better name
    setAnnotatedSceneController() {
		if (this.isAllSet) return

		this.isAllSet = true

        // TODO JOE FRIDAY
        // if ( interaction is enabled ) {

        this.state.container!.addEventListener('mousemove', this.state.annotationManager!.checkForActiveMarker)

        // TODO REORG JOE, shared, move to AnnotationManager, but Kiosk won't enable interaction stuff
        this.state.container!.addEventListener('mouseup', this.state.annotationManager!.checkForConflictOrDeviceSelection)
        this.state.container!.addEventListener('mouseup', this.state.annotationManager!.checkForAnnotationSelection)
        this.state.container!.addEventListener('mouseup', this.state.annotationManager!.addAnnotationMarker)
        this.state.container!.addEventListener('mouseup', this.state.annotationManager!.addLaneConnection)   // RYAN Annotator-specific
        this.state.container!.addEventListener('mouseup', this.state.annotationManager!.connectNeighbor)  // RYAN Annotator-specific
        this.state.container!.addEventListener('mouseup', this.state.annotationManager!.joinAnnotationsEventHandler)

        // }

        if (config['startup.camera_offset']) {
            const cameraOffset: [number, number, number] = config['startup.camera_offset']

            if (isTupleOfNumbers(cameraOffset, 3)) {
                this.state.sceneManager!.setCameraOffset(cameraOffset)
            } else if (cameraOffset) {
                log.warn(`invalid startup.camera_offset config: ${cameraOffset}`)
            }
        }
    }

    /**
     * Set the point cloud as the center of the visible world.
     */
    // Currently this function is only used on keyboard shortcuts
    // @TODO long term move orbit controls to Camera Manger
    focusOnPointCloud(): void {
        this.state.pointCloudManager!.focusOnPointCloud()
        this.displayCameraInfo()
    }

    // @TODO long term move orbit controls to Camera Manger
    // Display some info in the UI about where the camera is pointed.
    private displayCameraInfo = (): void => {

        if (!getValue(() => this.props.showStatusWindow, false)) return

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
        this.state.layerManager!.setLayerVisibility([Layer.POINT_CLOUD.toString(), Layer.ANNOTATIONS.toString()], true)

		// TODO JOE all that should be needed here is just setting layer
		// visibility, the rest is not needed (assuming the following are all
		// put in layers)

        // @TODO originally this function all called 'this.gui.close()' -- look into adding this funtionality
        this.state.areaOfInterestManager!.removeAxisFromScene()
        this.state.sceneManager!.removeCompassFromScene()
        this.state.areaOfInterestManager!.hideGridVisibility()

        // @TODO annotatorOrbitControls.enabled = false
        // @TODO flyThroughOrbitControls.enabled = true

        this.state.pointCloudManager!.hidePointCloudBoundingBox()
    }

	addLayer(name: string, toggle: LayerToggle) {
		this.state.layerManager!.addLayerToggle(name, toggle)
	}

	setLayerVisibility(layerKeysToShow: string[], hideOthers: boolean = false): void {
		this.state.layerManager!.setLayerVisibility( layerKeysToShow, hideOthers )
	}

	cleanTransformControls(): void {
		this.state.annotationManager!.cleanTransformControls()
	}

    /**
     *  Set the camera directly above the current target, looking down.
     */
    // @TODO long term move orbit controls to Camera Manger
    resetTiltAndCompass(): void {
        this.state.sceneManager!.resetTiltAndCompass()
    }

	unloadPointCloudData() {
		this.state.pointCloudManager!.unloadPointCloudData()
	}

	toggleCameraType() {
		this.state.sceneManager!.toggleCameraType()
	}

    setCameraOffsetVector(offset: THREE.Vector3): void {
        this.state.sceneManager!.setCameraOffsetVector(offset)
    }

    addObjectToScene(object: THREE.Object3D) {
        new AnnotatedSceneActions().addObjectToScene(object)
    }

    removeObjectFromScene(object: THREE.Object3D) {
        new AnnotatedSceneActions().removeObjectFromScene(object)
    }

	// TODO emit Events.SCENE_SHOULD_RENDER event instead
    renderScene() {
        return this.state.sceneManager!.renderScene()
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

    /**
     * Handle keyboard events
     */
    onKeyDown = (event: KeyboardEvent | KeyboardEventHighlights): void => {
        if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return

		this.possiblySetNumberPressed(event)

        const fn = this.state.registeredKeyDownEvents.get(event.key)
        fn && fn( event )
    }

    onKeyUp = (event: KeyboardEvent | KeyboardEventHighlights): void => {
        if (event.defaultPrevented) return

		this.possiblyUnsetNumberPressed(event)

        const fn = this.state.registeredKeyUpEvents.get(event.key)
        fn && fn( event )
    }

	private possiblySetNumberPressed = (event: KeyboardEvent | KeyboardEventHighlights): void => {
		if (event.repeat) return

		if (event.keyCode >= 48 && event.keyCode <= 57) { // digits 0 to 9
			new AnnotatedSceneActions().setNumberKeyPressed(parseInt(event.key, 10))
		}
	}

	private possiblyUnsetNumberPressed = (event: KeyboardEvent | KeyboardEventHighlights): void => {
		if (this.props.numberKeyPressed === event.keyCode)
			new AnnotatedSceneActions().setNumberKeyPressed(null)
	}

	setKeys() {
		const actions = new AnnotatedSceneActions()
		this.keyHeld('Control', held => actions.setControlKeyPressed(held))
		this.keyHeld('Shift', held => actions.setShiftKeyPressed(held))
	}

	keyHeld(key: string, fn: (held: boolean) => void) {
		this.mapKeyDown(key, () => fn(true))
		this.mapKeyUp(key, () => fn(false))
	}

	mapKey(key: string, fn: (e?: KeyboardEvent | KeyboardEventHighlights) => void) {
		this.mapKeyDown(key, fn)
	}

	mapKeyDown(key: string, fn: (e?: KeyboardEvent | KeyboardEventHighlights) => void) {
		this.registerKeyboardDownEvent(key, fn)
	}

	mapKeyUp(key: string, fn: (e?: KeyboardEvent | KeyboardEventHighlights) => void) {
		this.registerKeyboardUpEvent(key, fn)
	}

    registerKeyboardDownEvent(key: string, fn: (e: KeyboardEvent | KeyboardEventHighlights) => void) {
        this.setState({
            registeredKeyDownEvents: this.state.registeredKeyDownEvents.set(key, fn)
        })
    }

    registerKeyboardUpEvent(key: string, fn: (e?: KeyboardEvent | KeyboardEventHighlights) => void) {
        this.setState({
            registeredKeyUpEvents: this.state.registeredKeyUpEvents.set(key, fn)
        })
    }

    private handleTileManagerLoadError = (dataType: string, err: Error): void => {
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

                // TODO FIXME JOE AnnotationManager is passed into
                // AnnotationTileManager, so I think we're thinking of two
                // AnnotationManager classes: the one Clyde made, and the one we
                // imagine as effectively the thing controling the annotation
                // tile layer which is similar to PointCloudManager. So we
                // should split AnnotationManager into two, and name one of them
                // something like AnnotationLayer or something.
                this.state.annotationManager!,
            )
		})

        new AnnotatedSceneActions().setIsAnnotationTileManagerEnabled(true)

	}

	loadInitialPointCloudTiles(): Promise<void> {
        return this.state.pointCloudManager!.loadPointCloudDataFromConfigBoundingBox( this.props.initialFocusPoint )
	}

    componentDidUpdate(_, prevState, __) {
        if (!this.isAllSet && this.state.sceneManager && this.state.container && this.state.annotationManager) {
            this.setAnnotatedSceneController()
        }

		if (!prevState.annotationManager && this.state.annotationManager) {
			this.makeAnnotationTileManager()
		}

		if (!prevState.pointCloudManager && this.state.pointCloudManager) {
			console.log( ' ------------------------------ load the initial tiles' )
			this.loadInitialPointCloudTiles()
		}

        this.displayCameraInfo()
    }

	componentDidMount() {

		this.setKeys()
		this.props.setKeys && this.props.setKeys()

	}

    getAnnotationManagerRef = (ref: any): void => {
        if (ref) {
            ref = ref.getWrappedInstance() as AnnotationManager
            this.setState({ annotationManager: ref })
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

    onMouseMove = (event): void => {
        // TODO JOE do we have to make a `new AnnotatedSceneActions` every time? Or
        // can we just use a singleton?
        new AnnotatedSceneActions().setMousePosition({
            x: event.clientX - event.target.offsetLeft,
            y: event.clientY - event.target.offsetTop,
        })
    }

    render() {
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

        const {
			lockBoundaries,
			lockTerritories,
			lockTrafficDevices,
			lockLanes
		} = this.props

        // TODO JOE THURSDAY see onRenender below
        // const onRenderCallBack = this.state.sceneManager ? this.state.sceneManager.renderScene : () => {}

        return (
            <div
				ref={this.getContainerRef}
				className="scene-container"
				onMouseMove={this.onMouseMove}
				style={{
					cursor: this.props.isHoveringOnMarker ? 'pointer' : 'auto'
				}}
			>

                <ResizeObserver
                    onResize={(rect) => {
                        this.setState({
                            componentWidth: rect.width,
                            componentHeight: rect.height,
                        })
                    }}
                    onPosition={(rect) => {
                        console.log('Moved. New position:', rect.left, 'x', rect.top);
                    }}
                />

                {/* TODO JOE THURSDAY StatusWindow doesn't need UtmCoordinateSystem, it is only concerned with messages */}
                <StatusWindow
                    ref={this.getStatusWindowRef}
                    utmCoordinateSystem={this.utmCoordinateSystem}
                    eventEmitter={this.channel}
                />

                { container && areaOfInterestManager &&
	                <SceneManager
	                    ref={this.getSceneManagerRef}

						backgroundColor={this.props.backgroundColor}
	                    // TODO JOE this will resize based on container size using window.ResizeObserver.
	                    width={this.state.componentWidth}
	                    height={this.state.componentWidth}

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
	                />
				}

                <LayerManager ref={this.getLayerManagerRef}/>

				{ layerManager && sceneManager &&
	                <PointCloudManager
	                    ref={this.getPointCloudManagerRef}
	                    utmCoordinateSystem={this.utmCoordinateSystem}
	                    sceneManager={sceneManager}
	                    pointCloudTileManager={this.pointCloudTileManager}
	                    layerManager={layerManager}
	                    handleTileManagerLoadError={this.handleTileManagerLoadError}
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

	                        // TODO we can handle this better, revisit with Ryan. Currently we
	                        // forward props from the app through her to AnnotationManager
	                        lockBoundaries,
	                        lockTerritories,
	                        lockLanes,
	                        lockTrafficDevices,

	                    }}

	                />
				}

                <GroundPlaneManager
                    ref={this.getGroundPlaneManagerRef}
                    utmCoordinateSystem={this.utmCoordinateSystem}
                    areaOfInterestManager={areaOfInterestManager!}
                    channel={this.channel}
                />

            </div>
        )
    }
}
