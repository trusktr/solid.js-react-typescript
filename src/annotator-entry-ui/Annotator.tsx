/**
 *  Copyright 2017 Mapper Inc. Part of the mapper-annotator project.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import config from '@/config'
import * as $ from 'jquery'
import * as Electron from 'electron'
// import * as electronUnhandled from 'electron-unhandled'
import {sprintf} from 'sprintf-js'
import * as lodash from 'lodash'
import {Map} from 'immutable'
import {AnimationLoop} from 'animation-loop'
import LocalStorage from "./state/LocalStorage"
import {GUI as DatGui, GUIParams} from 'dat.gui'
import {TransformControls} from './controls/TransformControls'
import {OrbitControls} from './controls/OrbitControls'
import {
	convertToStandardCoordinateFrame, CoordinateFrameType,
	cvtQuaternionToStandardCoordinateFrame
} from "./geometry/CoordinateFrame"
import {isTupleOfNumbers} from "../util/Validation"
import {UtmCoordinateSystem} from "./UtmCoordinateSystem"
import {PointCloudTileManager} from './tile/PointCloudTileManager'
import {SuperTile} from "./tile/SuperTile"
import {RangeSearch} from "./model/RangeSearch"
import {BusyError} from "./tile/TileManager"
import {getClosestPoints} from "./geometry/ThreeHelpers"
import {AxesHelper} from "./controls/AxesHelper"
import {CompassRose} from "./controls/CompassRose"
import {Sky} from "./controls/Sky"
import {getDecorations} from "./Decorations"
import {AnnotationType} from './annotations/AnnotationType'
import {AnnotationManager, OutputFormat} from './AnnotationManager'
import {Annotation} from './annotations/AnnotationBase'
import {NeighborLocation, NeighborDirection, Lane} from './annotations/Lane'
import {Territory} from "./annotations/Territory"
import {Boundary} from "./annotations/Boundary"
import Logger from '@/util/log'
import {getValue} from "typeguard"
import {isNull, isNullOrUndefined} from "util"
import * as MapperProtos from '@mapperai/mapper-models'
import Models = MapperProtos.mapper.models
import * as THREE from 'three'
import {LocationServerStatusClient, LocationServerStatusLevel} from "./status/LocationServerStatusClient"
import {ImageManager} from "./image/ImageManager"
import {ImageScreen} from "./image/ImageScreen"
import {CalibratedImage} from "./image/CalibratedImage"
import {Connection} from "./annotations/Connection"
import {TrafficDevice} from "./annotations/TrafficDevice"
import createPromise from "../util/createPromise"
import { PromiseReturn } from "../util/createPromise"
import * as watch from 'watch'
import * as Stats from 'stats.js'
import * as zmq from 'zmq'
import {Socket} from 'zmq'
import * as OBJLoader from 'three-obj-loader'
import * as carModelOBJ from 'assets/models/BMW_X5_4.obj'

import * as React from "react";
import RoadEditorState from "../annotator-z-hydra-shared/src/store/state/RoadNetworkEditorState";
import {typedConnect} from "../annotator-z-hydra-shared/src/styles/Themed";
import {createStructuredSelector} from "reselect";
import TrajectoryPicker, {TrajectoryFileSelectedCallback} from "./components/TrajectoryPicker"
import RoadNetworkEditorActions from "../annotator-z-hydra-shared/src/store/actions/RoadNetworkEditorActions";
import FlyThroughActions from "../annotator-z-hydra-kiosk/FlyThroughActions";
import StatusWindowState from "../annotator-z-hydra-shared/src/models/StatusWindowState";
import StatusWindowActions from "../annotator-z-hydra-shared/StatusWindowActions";
import {FlyThroughState} from "../annotator-z-hydra-shared/src/models/FlyThroughState";

import * as FlyThroughManager from "../annotator-z-hydra-kiosk/FlyThroughManagerNonReact";
import { StatusKey } from "../annotator-z-hydra-shared/src/models/StatusKey";

import {dataSetNameFromPath, TrajectoryDataSet} from "../util/Perception"
import {TileServiceClient} from "./tile/TileServiceClient"
import {PointCloudSuperTile} from "./tile/PointCloudSuperTile"
import {AnnotationTileManager} from "./tile/AnnotationTileManager"
import {AnnotationSuperTile} from "./tile/AnnotationSuperTile"
import {dateToString} from "../util/dateToString"
import {scale3DToSpatialTileScale, spatialTileScaleToString} from "./tile/ScaleUtil"
import {ScaleProvider} from "./tile/ScaleProvider"

const dialog = Electron.remote.dialog

// electronUnhandled()
OBJLoader(THREE)

const log = Logger(__filename)

const cameraCenter = new THREE.Vector2(0, 0)

const preferenceKey = {
	cameraPreference: 'cameraPreference',
}

const cameraTypeString = {
	orthographic: 'orthographic',
	perspective: 'perspective',
}

// enum MenuVisibility {
// 	HIDE = 0,
// 	SHOW,
// 	TOGGLE
// }

// Various types of objects which can be displayed in the three.js scene.
enum Layer {
	POINT_CLOUD,
	IMAGE_SCREENS,
	ANNOTATIONS,
}

let allLayers: Layer[] = []
// Now let javascript show you how easy it is to work with enums:
for (let key in Layer) {
	if (Layer.hasOwnProperty(key)) {
		const index = Layer[key]
		if (typeof index === 'number')
			allLayers.push(index)
	}
}

// Groups of layers which are visible together. They are toggled on/off with the 'show/hide' command.
// - all visible
// - annotations hidden
// - everything but annotations hidden
const layerGroups: Layer[][] = [
	allLayers,
	[Layer.POINT_CLOUD, Layer.IMAGE_SCREENS],
	[Layer.ANNOTATIONS],
]

const defaultLayerGroupIndex = 0

// Something that toggles on and off, and reports the result.
interface Toggle {
	show: () => boolean,
	hide: () => boolean,
}

interface MousePosition {
	clientX: number
	clientY: number
}

interface AnnotatorSettings {
	background: THREE.Color
	cameraOffset: THREE.Vector3
	orthoCameraHeight: number // ortho camera uses world units (which we treat as meters) to define its frustum
	defaultAnimationFrameIntervalMs: number | false
	animationFrameIntervalSecs: number | false // how long we have to update the animation before the next frame fires
	estimateGroundPlane: boolean
	tileGroundPlaneScale: number // ground planes don't meet at the edges: scale them up a bit so they are more likely to intersect a raycaster
	enableAnnotationTileManager: boolean
	drawBoundingBox: boolean
	enableTileManagerStats: boolean
	pointCloudBboxColor: THREE.Color
	aoiBboxColor: THREE.Color
	aoiFullSize: THREE.Vector3 // the dimensions of an AOI box, which will be constructed around a center point
	aoiHalfSize: THREE.Vector3 // half the dimensions of an AOI box
	timeBetweenErrorDialogsMs: number
	timeToDisplayHealthyStatusMs: number
	maxDistanceToDecorations: number // meters
	skyRadius: number
	cameraToSkyMaxDistance: number
}

interface LiveModeSettings {
	displayCarModel: boolean
	carModelMaterial: THREE.Material
	cameraOffset: THREE.Vector3
	cameraOffsetDelta: number
	// flyThroughIntervalSecs: number
}

interface UiState {
	sceneInitialized: boolean
	layerGroupIndex: number
	lockBoundaries: boolean
	lockLanes: boolean
	lockTerritories: boolean
	lockTrafficDevices: boolean
	isPointCloudVisible: boolean
	isImageScreensVisible: boolean
	isAnnotationsVisible: boolean
	isControlKeyPressed: boolean
	isShiftKeyPressed: boolean
	isAddMarkerKeyPressed: boolean
	isAddConnectionKeyPressed: boolean
	isConnectLeftNeighborKeyPressed: boolean
	isConnectRightNeighborKeyPressed: boolean
	isConnectFrontNeighborKeyPressed: boolean
	isJoinAnnotationKeyPressed: boolean
	isAddConflictOrDeviceKeyPressed: boolean
	isRotationModeActive: boolean
	isMouseButtonPressed: boolean
	isMouseDragging: boolean
	lastMousePosition: MousePosition | null
	numberKeyPressed: number | null
	// Live mode enables trajectory play-back with minimal user input. The trajectory comes from either a pre-recorded
	// file (if this.flyThroughSettings.enabled is true) or messages on a live socket.
	isLiveMode: boolean
	isLiveModePaused: boolean // When paused the UI for live mode doesn't change, but it ignores new poses.
	isKioskMode: boolean // hides window chrome and turns on live mode permanently, with even less user input
	imageScreenOpacity: number
	lastPointCloudLoadedErrorModalMs: number // timestamp when an error modal was last displayed
	lastCameraCenterPoint: THREE.Vector3 | null // point in three.js coordinates where camera center line has recently intersected ground plane
	skyPosition2D: THREE.Vector2 // sky's position, projected down to approximately the ground surface
	cameraPosition2D: THREE.Vector2 // active camera's position, projected down to approximately the ground surface
}

// Area of Interest: where to load point clouds
interface AoiState {
	enabled: boolean // enable auto-loading points around the AOI
	focalPoint: THREE.Vector3 | null, // cached value for the center of the AOI
	boundingBoxes: THREE.BoxHelper[] // boxes drawn around the current area of interest
	currentHeading: THREE.Vector3 | null // in fly-through mode: where the vehicle is heading
}

/**
 * The Annotator class is in charge of rendering the 3d Scene that includes the point clouds
 * and the annotations. It also handles the mouse and keyboard events needed to select
 * and modify the annotations.
 */
interface AnnotatorProps {
	liveModeEnabled ?: boolean
	playModeEnabled ?: boolean
	statusWindowState ?: StatusWindowState
	uiMenuVisible ?: boolean
	shouldAnimate ?: boolean
	flyThroughState ?: FlyThroughState
	carPose ?: Models.PoseMessage
}

interface AnnotatorState {}

// state = getRoadNetworkEditorReduxStore().getState()
@typedConnect(createStructuredSelector({
	liveModeEnabled: (state) => state.get(RoadEditorState.Key).liveModeEnabled,
	playModeEnabled: (state) => state.get(RoadEditorState.Key).playModeEnabled,
	uiMenuVisible: (state) => state.get(RoadEditorState.Key).uiMenuVisible,
	statusWindowState: (state) => state.get(RoadEditorState.Key).statusWindowState,
	flyThroughState: (state) => state.get(RoadEditorState.Key).flyThroughState,
	shouldAnimate: (state) => state.get(RoadEditorState.Key).shouldAnimate,
	carPose: (state) => state.get(RoadEditorState.Key).carPose,
}))
export default class Annotator extends React.Component<AnnotatorProps, AnnotatorState> {
	private storage: LocalStorage // persistent state for UI settings
	private uiState: UiState
	private aoiState: AoiState
	// private statusWindow: StatusWindowController // a place to print status messages
	private scene: THREE.Scene // where objects are rendered in the UI; shared with AnnotationManager
	private annotatorPerspectiveCam: THREE.PerspectiveCamera
	private annotatorOrthoCam: THREE.OrthographicCamera
	private annotatorCamera: THREE.Camera
	private flyThroughCamera: THREE.Camera
	private renderer: THREE.WebGLRenderer
	private raycasterPlane: THREE.Raycaster // used to compute where the waypoints will be dropped
	private raycasterMarker: THREE.Raycaster // used to compute which marker is active for editing
	private raycasterAnnotation: THREE.Raycaster // used to highlight annotations for selection
	private raycasterImageScreen: THREE.Raycaster // used to highlight ImageScreens for selection
	private sky: THREE.Object3D // makes it easier to tell up from down
	private carModel: THREE.Object3D // displayed during live mode, moving along a trajectory
	private decorations: THREE.Object3D[] // arbitrary objects displayed with the point cloud
	private scaleProvider: ScaleProvider
	private utmCoordinateSystem: UtmCoordinateSystem
	private pointCloudTileManager: PointCloudTileManager
	private annotationTileManager: AnnotationTileManager
	private imageManager: ImageManager
	private plane: THREE.Mesh // an arbitrary horizontal (XZ) reference plane for the UI
	private grid: THREE.GridHelper | null // visible grid attached to the reference plane
	private axis: THREE.Object3D | null // highlights the origin and primary axes of the three.js coordinate system
	private compassRose: THREE.Object3D | null // indicates the direction of North
	private stats: Stats
	private annotatorOrbitControls: THREE.OrbitControls
	private flyThroughOrbitControls: THREE.OrbitControls
	private transformControls: any // controller for translating an object within the scene
	private hideTransformControlTimer: number
	private serverStatusDisplayTimer: number
	private locationServerStatusDisplayTimer: number
	private annotationManager: AnnotationManager
	private superTileGroundPlanes: Map<string, THREE.Mesh[]> // super tile key -> all of the super tile's ground planes
	private allGroundPlanes: THREE.Mesh[] // ground planes for all tiles, denormalized from superTileGroundPlanes
	private pointCloudBoundingBox: THREE.BoxHelper | null // just a box drawn around the point cloud
	private highlightedImageScreenBox: THREE.Mesh | null // image screen which is currently active in the Annotator UI
	private highlightedLightboxImage: CalibratedImage | null // image screen which is currently active in the Lightbox UI
	private lightboxImageRays: THREE.Line[] // rays that have been formed in 3D by clicking images in the lightbox
	private liveSubscribeSocket: Socket
	private hovered: THREE.Object3D | null // a lane vertex which the user is interacting with
	private settings: AnnotatorSettings
	//private flyThroughState: FlyThroughState
	private liveModeSettings: LiveModeSettings
	private locationServerStatusClient: LocationServerStatusClient
	private layerToggle: Map<Layer, Toggle>
	private gui: DatGui | null
	private loop: AnimationLoop
	// private flyThroughLoop: AnimationLoop
	// private shouldAnimate: boolean
	private updateOrbitControls: boolean
	private root: HTMLElement
	private openTrajectoryPickerFunction: ((cb: TrajectoryFileSelectedCallback) => void) | null
	private sceneContainer: HTMLDivElement
	private trajectoryPickerRef: TrajectoryPicker

	constructor(props) {
		super(props)
		this.storage = new LocalStorage()

		// this.shouldAnimate = false
		this.updateOrbitControls = false

		if (!isNullOrUndefined(config.get('output.trajectory.csv.path')))
			log.warn('Config option output.trajectory.csv.path has been removed.')
		if (!isNullOrUndefined(config.get('annotator.generate_voxels_on_point_load')))
			log.warn('Config option annotator.generate_voxels_on_point_load has been removed.')
		if (config.get('startup.animation.fps'))
			log.warn('Config option startup.animation.fps has been removed. Use startup.render.fps.')
		const animationFps = config.get('startup.render.fps')

		this.settings = {
			background: new THREE.Color(config.get('startup.background_color') || '#082839'),
			cameraOffset: new THREE.Vector3(0, 400, 200),
			orthoCameraHeight: 100, // enough to view ~1 city block of data
			defaultAnimationFrameIntervalMs: animationFps === 'device' ? false : 1 / (animationFps || 10),
			animationFrameIntervalSecs: 0,
			estimateGroundPlane: !!config.get('annotator.add_points_to_estimated_ground_plane'),
			tileGroundPlaneScale: 1.05,
			enableAnnotationTileManager: false,
			drawBoundingBox: !!config.get('annotator.draw_bounding_box'),
			enableTileManagerStats: !!config.get('tile_manager.stats_display.enable'),
			pointCloudBboxColor: new THREE.Color(0xff0000),
			aoiBboxColor: new THREE.Color(0x00ff00),
			aoiFullSize: new THREE.Vector3(30, 30, 30),
			aoiHalfSize: new THREE.Vector3(15, 15, 15),
			timeBetweenErrorDialogsMs: 30000,
			timeToDisplayHealthyStatusMs: 10000,
			maxDistanceToDecorations: 50000,
			skyRadius: 8000,
			cameraToSkyMaxDistance: 0,
		}
		this.settings.cameraToSkyMaxDistance = this.settings.skyRadius * 0.05
		const cameraOffset: [number, number, number] = config.get('startup.camera_offset')
		if (isTupleOfNumbers(cameraOffset, 3)) {
			this.settings.cameraOffset = new THREE.Vector3().fromArray(cameraOffset)
		} else if (cameraOffset) {
			log.warn(`invalid startup.camera_offset config: ${cameraOffset}`)
		}
		const aoiSize: [number, number, number] = config.get('annotator.area_of_interest.size')
		if (isTupleOfNumbers(aoiSize, 3)) {
			this.settings.aoiFullSize = new THREE.Vector3().fromArray(aoiSize)
			this.settings.aoiHalfSize = this.settings.aoiFullSize.clone().divideScalar(2)
		} else if (aoiSize) {
			log.warn(`invalid annotator.area_of_interest.size config: ${aoiSize}`)
		}
		this.settings.animationFrameIntervalSecs = this.settings.defaultAnimationFrameIntervalMs
		this.uiState = {
			sceneInitialized: false,
			layerGroupIndex: defaultLayerGroupIndex,
			lockBoundaries: false,
			lockLanes: false,
			lockTerritories: true,
			lockTrafficDevices: false,
			isPointCloudVisible: true,
			isImageScreensVisible: true,
			isAnnotationsVisible: true,
			isControlKeyPressed: false,
			isShiftKeyPressed: false,
			isAddMarkerKeyPressed: false,
			isConnectLeftNeighborKeyPressed: false,
			isConnectRightNeighborKeyPressed: false,
			isConnectFrontNeighborKeyPressed: false,
			isAddConnectionKeyPressed: false,
			isAddConflictOrDeviceKeyPressed: false,
			isJoinAnnotationKeyPressed: false,
			isRotationModeActive: false,
			isMouseButtonPressed: false,
			isMouseDragging: false,
			lastMousePosition: null,
			numberKeyPressed: null,
			isLiveMode: false,
			isLiveModePaused: true,
			isKioskMode: !!config.get('startup.kiosk_mode'),
			imageScreenOpacity: parseFloat(config.get('image_manager.image.opacity')) || 0.5,
			lastPointCloudLoadedErrorModalMs: 0,
			lastCameraCenterPoint: null,
			skyPosition2D: new THREE.Vector2(),
			cameraPosition2D: new THREE.Vector2(),
		}
		// AnnotationTileManager will load and unload annotations without warning, which isn't helpful in interactive mode, so:
		this.settings.enableAnnotationTileManager = this.uiState.isKioskMode
		this.aoiState = {
			enabled: !!config.get('annotator.area_of_interest.enable'),
			focalPoint: null,
			boundingBoxes: [],
			currentHeading: null,
		}
		// this.statusWindow = new StatusWindowController()
		this.hovered = null
		this.raycasterPlane = new THREE.Raycaster()
		this.raycasterPlane.params.Points!.threshold = 0.1
		this.raycasterMarker = new THREE.Raycaster()
		this.decorations = []
		this.raycasterAnnotation = new THREE.Raycaster() // ANNOTATOR ONLY
		this.raycasterImageScreen = new THREE.Raycaster() // ANNOTATOR ONLY
  	this.scaleProvider = new ScaleProvider()
		this.utmCoordinateSystem = new UtmCoordinateSystem(this.onSetOrigin)
		this.superTileGroundPlanes = Map()
		this.allGroundPlanes = []
		this.pointCloudBoundingBox = null
		this.highlightedImageScreenBox = null
		this.highlightedLightboxImage = null
		this.lightboxImageRays = []
		this.imageManager = new ImageManager(
			this.utmCoordinateSystem,
			this.uiState.imageScreenOpacity,
			this.renderAnnotator,
			this.onImageScreenLoad,
			this.onLightboxImageRay,
			this.onKeyDown,
			this.onKeyUp,
		)
		this.locationServerStatusClient = new LocationServerStatusClient(this.onLocationServerStatusUpdate)
		this.openTrajectoryPickerFunction = null

		// this.resetFlyThroughState()
		new FlyThroughActions().resetFlyThroughState()

		if (config.get('fly_through.renderAnnotator.fps'))
			log.warn('config option fly_through.renderAnnotator.fps has been renamed to fly_through.animation.fps')


		this.liveModeSettings = {
			displayCarModel: !!config.get('live_mode.display_car_model'),
			carModelMaterial: new THREE.MeshPhongMaterial({
				color: 0x002233,
				specular: 0x222222,
				shininess: 0,
			}),
			cameraOffset: new THREE.Vector3(30, 10, 0),
			cameraOffsetDelta: 1,
			// flyThroughIntervalSecs: flyThroughInterval,
		}

		// RYAN - move to "AppGeneral"
		this.layerToggle = Map([
			[Layer.POINT_CLOUD, {show: this.showPointCloud, hide: this.hidePointCloud}],
			[Layer.IMAGE_SCREENS, {show: this.showImageScreens, hide: this.hideImageScreens}],
			[Layer.ANNOTATIONS, {show: this.showAnnotations, hide: this.hideAnnotations}],
		])

		const watchForRebuilds: boolean = config.get('startup.watch_for_rebuilds.enable') || false
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
	}

	async mount(): Promise<void> {
		this.root = this.sceneContainer
		if (!this.uiState.sceneInitialized) await this.initScene()
		this.sceneContainer.appendChild(this.renderer.domElement)
		this.createControlsGui()
		this.makeStats()
		this.startAnimation()
	}

	unmount(): void {
		this.stopAnimation()
		this.destroyStats()
		this.destroyControlsGui()
		this.renderer.domElement.remove()

		// TODO:
		//  - remove event listeners
		//  - clean up child windows
	}

	exitApp(): void {
		Electron.remote.getCurrentWindow().close()
	}

	/**
	 * Create the 3D Scene and add some basic objects. It also initializes
	 * several event listeners.
	 */
	private initScene(): Promise<void> {
		log.info(`Building scene`)

		const [width, height]: Array<number> = this.getContainerSize()

		this.annotatorPerspectiveCam = new THREE.PerspectiveCamera(70, width / height, 0.1, 10000)
		this.annotatorOrthoCam = new THREE.OrthographicCamera(1, 1, 1, 1, 0, 10000)

		// Create scene and camera
		this.scene = new THREE.Scene()
		if (this.storage.getItem(preferenceKey.cameraPreference, cameraTypeString.perspective) === cameraTypeString.orthographic)
			this.annotatorCamera = this.annotatorOrthoCam
		else
			this.annotatorCamera = this.annotatorPerspectiveCam

		this.flyThroughCamera = new THREE.PerspectiveCamera(70, width / height, 0.1, 10000)
		this.flyThroughCamera.position.set(800, 400, 0)

		this.setOrthographicCameraDimensions(width, height)

		// Add some lights
		this.scene.add(new THREE.AmbientLight(0xffffff))

		// Draw the sky.
		this.sky = Sky(this.settings.background, new THREE.Color(0xccccff), this.settings.skyRadius)
		this.scene.add(this.sky)

		// Add a "ground plane" to facilitate annotations
		const planeGeometry = new THREE.PlaneGeometry(2000, 2000)
		planeGeometry.rotateX(-Math.PI / 2)
		const planeMaterial = new THREE.ShadowMaterial()
		planeMaterial.visible = false
		planeMaterial.side = THREE.DoubleSide // enable raycaster intersections from both sides
		this.plane = new THREE.Mesh(planeGeometry, planeMaterial)
		this.scene.add(this.plane)

		// Add grid on top of the plane to visualize where the plane is.
		// Add an axes helper to visualize the origin and orientation of the primary directions.
		const axesHelperLength = parseFloat(config.get('annotator.axes_helper_length')) || 0
		if (axesHelperLength > 0) {
			const gridSize = parseFloat(config.get('annotator.grid_size')) || 200
			const gridUnit = parseFloat(config.get('annotator.grid_unit')) || 10
			const gridDivisions = gridSize / gridUnit

			this.grid = new THREE.GridHelper( gridSize, gridDivisions, new THREE.Color('white'))
			this.grid!.material.opacity = 0.25
			this.grid!.material.transparent = true
			this.scene.add(this.grid)

			this.axis = AxesHelper(axesHelperLength)
			this.scene.add(this.axis)
		} else {
			this.grid = null
			this.axis = null
		}

		const compassRoseLength = parseFloat(config.get('annotator.compass_rose_length')) || 0
		if (compassRoseLength > 0) {
			this.compassRose = CompassRose(compassRoseLength)
			this.compassRose.rotateX(Math.PI / -2)
			this.scene.add(this.compassRose)
		} else
			this.compassRose = null

		// All the annotations go here.
		// @TODO Ryan/Joe to be added outside of initial scene (only annotator specific)
		this.annotationManager = new AnnotationManager(
			!this.uiState.isKioskMode,
			this.scaleProvider,
			this.utmCoordinateSystem,
			this.onAddAnnotation,
			this.onRemoveAnnotation,
			this.onChangeActiveAnnotation
		)
        // replace with ref, pass props instead of constructor args

		// remote, tiled data sources
		const tileServiceClient = new TileServiceClient(this.scaleProvider, this.onTileServiceStatusUpdate)
		this.pointCloudTileManager = new PointCloudTileManager(
			this.scaleProvider,
			this.utmCoordinateSystem,
			this.onSuperTileLoad,
			this.onSuperTileUnload,
			tileServiceClient,
		)
		if (this.settings.enableAnnotationTileManager)
			this.annotationTileManager = new AnnotationTileManager(
				this.scaleProvider,
				this.utmCoordinateSystem,
				this.onSuperTileLoad,
				this.onSuperTileUnload,
				tileServiceClient,
				this.annotationManager,
			)

        // TODO REORG JOE AnnotationManager needs a reference to AnnotationTileManager

		// Create GL Renderer
		this.renderer = new THREE.WebGLRenderer({antialias: true})
		this.renderer.setClearColor(this.settings.background)
		this.renderer.setPixelRatio(window.devicePixelRatio)
		this.renderer.setSize(width, height)

		// Initialize all control objects.
		this.initAnnotatorOrbitControls()
		this.initFlyThroughOrbitControls()
		this.initTransformControls()

		// Add listeners
		window.addEventListener('focus', this.onFocus)  // RYAN Annotator-specific
		window.addEventListener('blur', this.onBlur)  // RYAN Annotator-specific
		window.addEventListener('beforeunload', this.onBeforeUnload) // RYAN Annotator-specific
		window.addEventListener('resize', this.onWindowResize) // BOTH
		window.addEventListener('keydown', this.onKeyDown) // split
		window.addEventListener('keyup', this.onKeyUp) // split

		// Annotator-specific
        this.renderer.domElement.addEventListener('mousemove', this.setLastMousePosition)
        this.renderer.domElement.addEventListener('mousemove', this.checkForActiveMarker)
        this.renderer.domElement.addEventListener('mousemove', this.checkForImageScreenSelection)
		this.renderer.domElement.addEventListener('mouseup', this.clickImageScreenBox)

        // TODO REORG JOE, shared, move to AnnotationManager, but Kiosk won't enable interaction stuff
        this.renderer.domElement.addEventListener('mouseup', this.checkForConflictOrDeviceSelection)
        this.renderer.domElement.addEventListener('mouseup', this.checkForAnnotationSelection)
		this.renderer.domElement.addEventListener('mouseup', this.addAnnotationMarker)
		this.renderer.domElement.addEventListener('mouseup', this.addLaneConnection)   // RYAN Annotator-specific
		this.renderer.domElement.addEventListener('mouseup', this.connectNeighbor)  // RYAN Annotator-specific
		this.renderer.domElement.addEventListener('mouseup', this.joinAnnotations)

        // TODO REORG JOE: this is generic stuff, put this in a lib so any code can use the states.
		this.renderer.domElement.addEventListener('mouseup', () => {this.uiState.isMouseButtonPressed = false})  // RYAN Annotator-specific
		this.renderer.domElement.addEventListener('mousedown', () => {this.uiState.isMouseButtonPressed = true}) // RYAN Annotator-specific
		this.renderer.domElement.addEventListener('mousemove', () => {this.uiState.isMouseDragging = this.uiState.isMouseButtonPressed}) // RYAN Annotator-specific

		// Bind events
		this.bind()
		// if ( this.props.uiMenuVisible ) this.deactivateAllAnnotationPropertiesMenus()

		// Create the hamburger menu and display (open) it as requested.
		const startupMenu = this.uiState.isKioskMode ? '#liveModeMenu' : '#annotationMenu'
		this.switchToMenu(startupMenu)


		// RYAN UPDATED
		// this.displayMenu(config.get('startup.show_menu') ? MenuVisibility.SHOW : MenuVisibility.HIDE)
		// @TODO this action shouldn't be needed because the default state is based on config.get('startup.show_menu') directly
		new RoadNetworkEditorActions().setUIMenuVisibility(config.get('startup.show_menu'))

		this.loop = new AnimationLoop
		this.loop.interval = this.settings.animationFrameIntervalSecs

		// Point the camera at some reasonable default location.
		this.setStage(0, 0, 0)

		// starts tracking time, but GPU use is still at 0% at this moment
		// because there are no animation functions added to the loop yet.
		this.loop.start()

		this.loop.addBaseFn( () => {
			if (this.stats) this.stats.update()
			this.renderer.render(this.scene, this.camera)
		})

		this.loop.addChildLoop( FlyThroughManager.getAnimationLoop() )

		FlyThroughManager.startLoop()

		return this.loadCarModel()
			.then(() => this.loadUserData())
			.then(() => {
				if (this.uiState.isKioskMode)
					this.listen()
				this.uiState.sceneInitialized = true
			})
	}

	private makeStats(): void {

		if (!config.get('startup.show_stats_module')) return

		// Create stats widget to display frequency of rendering
		this.stats = new Stats()
		this.stats.dom.style.top = 'initial' // disable existing setting
		this.stats.dom.style.bottom = '50px' // above Mapper logo
		this.stats.dom.style.left = '13px'
		this.root.appendChild(this.stats.dom)

	}

	private destroyStats(): void {
		if (!config.get('startup.show_stats_module')) return
		this.stats.dom.remove()
	}

	private get camera(): THREE.Camera {
		if (this.uiState.isLiveMode) return this.flyThroughCamera
		return this.annotatorCamera
	}

	// Create a UI widget to adjust application settings on the fly.
    // JOE, this is Annotator app-specific
	createControlsGui(): void {
		// Add panel to change the settings
		if (!isNullOrUndefined(config.get('startup.show_color_picker')))
			log.warn('config option startup.show_color_picker has been renamed to startup.show_control_panel')

		if (!config.get('startup.show_control_panel')) {
			this.gui = null
			return
		}

		const gui = this.gui = new DatGui({
			hideable: false,
			closeOnTop: true,
		} as GUIParams)
		gui.domElement.className = 'threeJs_gui'

		gui.domElement.setAttribute('style', `
			width: 245px;
			position: absolute;
			top: 13px;
			left: 13px;
			right: initial;
			bottom: initial;
			background: rgba(0,0,0,0.5);
			padding: 10px;
		`)

		const closeButton = gui.domElement.querySelector('.close-button')

		closeButton!.setAttribute('style', `
			padding-bottom: 5px;
			cursor: pointer;
		`)

		gui.addColor(this.settings, 'background').name('Background').onChange((value: string) => {
			this.renderer.setClearColor(new THREE.Color(value))
			this.renderAnnotator()
		})

		gui.add(this.uiState, 'imageScreenOpacity', 0, 1).name('Image Opacity').onChange((value: number) => {
			if (this.imageManager.setOpacity(value))
				this.renderAnnotator()
		})

		const folderLock = gui.addFolder('Lock')
		folderLock.add(this.uiState, 'lockBoundaries').name('Boundaries').onChange((value: boolean) => {
			if (value && this.annotationManager.getActiveBoundaryAnnotation())
				this.cleanTransformControlsAndEscapeSelection()
		})
		folderLock.add(this.uiState, 'lockLanes').name('Lanes').onChange((value: boolean) => {
			if (value && (this.annotationManager.getActiveLaneAnnotation() || this.annotationManager.getActiveConnectionAnnotation()))
				this.cleanTransformControlsAndEscapeSelection()
		})
		folderLock.add(this.uiState, 'lockTerritories').name('Territories').onChange((value: boolean) => {
			if (value && this.annotationManager.getActiveTerritoryAnnotation())
				this.cleanTransformControlsAndEscapeSelection()
		})
		folderLock.add(this.uiState, 'lockTrafficDevices').name('Traffic Devices').onChange((value: boolean) => {
			if (value && (this.annotationManager.getActiveTrafficDeviceAnnotation()))
				this.cleanTransformControlsAndEscapeSelection()
		})
		folderLock.open()

		const folderConnection = gui.addFolder('Connection params')
		folderConnection.add(this.annotationManager, 'bezierScaleFactor', 1, 30).step(1).name('Bezier factor')
		folderConnection.open()
	}

	private destroyControlsGui(): void {
		if (!config.get('startup.show_control_panel')) return
		if (this.gui) this.gui.destroy()
	}

	/**
	 * 	Load up any data which configuration has asked for on start-up.
	 */
	// TAKE OUT TRAJECTORIES (beholder specific)
	// SHARED
	// EDITED AND MOVED 6/20
	private loadUserData(): Promise<void> {
		const annotationsPath = config.get('startup.annotations_path')
		let annotationsResult: Promise<void>
		if (annotationsPath) {
			annotationsResult = this.annotationManager.loadAnnotations(annotationsPath)
		} else {
			annotationsResult = Promise.resolve()
		}

		const pointCloudBbox: [number, number, number, number, number, number] = config.get('startup.point_cloud_bounding_box')
		let pointCloudResult: Promise<void>
		if (pointCloudBbox) {
			pointCloudResult = annotationsResult
				.then(() => {
					log.info('loading pre-configured bounding box ' + pointCloudBbox)
					return this.loadPointCloudDataFromConfigBoundingBox(pointCloudBbox)
				})
		} else {
			pointCloudResult = annotationsResult
		}

		if (config.get('startup.point_cloud_directory'))
			log.warn('config option startup.point_cloud_directory has been removed.')
		if (config.get('live_mode.trajectory_path'))
			log.warn('config option live_mode.trajectory_path has been renamed to fly_through.trajectory_path')
		if (config.get('fly_through.trajectory_path'))
			log.warn('config option fly_through.trajectory_path is now a list: fly_through.trajectory_path.list')

		let trajectoryResult: Promise<void>
		const trajectoryPaths = config.get('fly_through.trajectory_path.list')
		if (Array.isArray(trajectoryPaths) && trajectoryPaths.length) {
			trajectoryResult = pointCloudResult
				.then(() => {
					log.info('loading pre-configured trajectories')
					return FlyThroughManager.loadFlyThroughTrajectories(trajectoryPaths)
				})
		} else {
			trajectoryResult = pointCloudResult
		}

		return trajectoryResult
	}

	// SHARED (moved)
	private startAnimation(): void {
		new RoadNetworkEditorActions().setShouldAnimate(true)

		// this.shouldAnimate = true
		this.startAoiUpdates()

		this.loop.addAnimationFn(() => {
			if ( !this.props.shouldAnimate ) return false
			this.animate()
			return true
		})
	}

	// SHARED
	private stopAnimation(): void {
		// this.shouldAnimate = false
		new RoadNetworkEditorActions().setShouldAnimate(false)
	}

	// SHARED (moved)
	private startAoiUpdates(): void {
		this.loop.addAnimationFn(() => {
			if ( !this.props.shouldAnimate ) return false
			this.updatePointCloudAoi()
			return true
		})
	}


	// Annotator only
	private animate(): void {
		this.transformControls.update()
	}

	pauseEverything(): void {
		this.loop.pause()
	}

	resumeEverything(): void {
		this.loop.start()
	}


	// BOTH (moved)
    // TODO JOE a better name is something like "shouldRender". The first call
    // queues an animation frame, other calls between the first call and the
    // animation frame are noops.
	private renderAnnotator = (): void => {
		// force a tick which causes renderer.render to be called
		this.loop.forceTick()
	}

	/**
	 * Move all visible elements into position, centered on a coordinate.
	 */
	// BOTH (moved)
	private setStage(x: number, y: number, z: number, resetCamera: boolean = true): void {
		this.plane.geometry.center()
		this.plane.geometry.translate(x, y, z)
		if (this.grid) {
			this.grid.geometry.center()
			this.grid.geometry.translate(x, y, z)
		}
		if (resetCamera) {
			this.camera.position.set(x + this.settings.cameraOffset.x, y + this.settings.cameraOffset.y, z + this.settings.cameraOffset.z)
			this.orbitControls.target.set(x, y, z)
			this.orbitControls.update()
			this.renderAnnotator()
		}
	}

	/**
	 * Set some point as the center of the visible world.
	 */
	// BOTH
	private setStageByVector(point: THREE.Vector3, resetCamera: boolean = true): void {
		this.setStage(point.x, point.y, point.z, resetCamera)
	}

	/**
	 * Set the stage at the bottom center of TileManager's point cloud.
	 */
	// BOTH
	private setStageByPointCloud(resetCamera: boolean): void {
		const focalPoint = this.pointCloudTileManager.centerPoint()
		if (focalPoint)
			this.setStageByVector(focalPoint, resetCamera)
	}

	/**
	 * 	Display the compass rose just outside the bounding box of the point cloud.
	 */
	// BOTH
	private setCompassRoseByPointCloud(): void {
		if (!this.compassRose) return
		const boundingBox = this.pointCloudTileManager.getLoadedObjectsBoundingBox()
		if (!boundingBox) return

		// Find the center of one of the sides of the bounding box. This is the side that is
		// considered to be North given the current implementation of UtmInterface.utmToThreeJs().
		const topPoint = boundingBox.getCenter().setZ(boundingBox.min.z)
		const boundingBoxHeight = Math.abs(boundingBox.max.z - boundingBox.min.z)
		const zOffset = boundingBoxHeight / 10

		this.compassRose.position.set(topPoint.x, topPoint.y, topPoint.z - zOffset)
	}

	/**
	 * Set the point cloud as the center of the visible world.
	 */
	// BOTH
	private focusOnPointCloud(): void {
		const center = this.pointCloudTileManager.centerPoint()
		if (center) {
			this.orbitControls.target.set(center.x, center.y, center.z)
			this.orbitControls.update()
			this.renderAnnotator()
			this.displayCameraInfo()
		} else {
			log.warn('point cloud has not been initialized')
		}
	}

	/**
	 * 	Set the camera directly above the current target, looking down.
	 */
	// BOTH
	private resetTiltAndCompass(): void {
		const distanceCameraToTarget = this.camera.position.distanceTo(this.orbitControls.target)
		this.camera.position.x = this.orbitControls.target.x
		this.camera.position.y = this.orbitControls.target.y + distanceCameraToTarget
		this.camera.position.z = this.orbitControls.target.z
		this.orbitControls.update()
		this.renderAnnotator()
	}

	// Load tiles within a bounding box and add them to the scene.
	// BOTH
	private loadPointCloudDataFromConfigBoundingBox(bbox: number[]): Promise<void> {
		if (!isTupleOfNumbers(bbox, 6)) {
			this.handleTileManagerLoadError('Point Cloud', Error('invalid point cloud bounding box config'))
			return Promise.resolve()
		} else {
			const p1 = new THREE.Vector3(bbox[0], bbox[1], bbox[2])
			const p2 = new THREE.Vector3(bbox[3], bbox[4], bbox[5])
			return this.loadPointCloudDataFromMapServer([{minPoint: p1, maxPoint: p2}])
		}
	}

	// Load tiles within a bounding box and add them to the scene.
	// BOTH
	private loadPointCloudDataFromMapServer(searches: RangeSearch[], loadAllPoints: boolean = false, resetCamera: boolean = true): Promise<void> {
		return this.pointCloudTileManager.loadFromMapServer(searches, CoordinateFrameType.STANDARD, loadAllPoints)
			.then(loaded => {if (loaded) this.pointCloudLoadedSideEffects(resetCamera)})
			.catch(err => this.handleTileManagerLoadError('Point Cloud', err))
	}

	// Do some house keeping after loading a point cloud, such as drawing decorations
	// and centering the stage and the camera on the point cloud.
	// BOTH
	private pointCloudLoadedSideEffects(resetCamera: boolean = true): void {
		this.setLayerVisibility([Layer.POINT_CLOUD])

		this.updatePointCloudBoundingBox()
		this.setCompassRoseByPointCloud()
		this.setStageByPointCloud(resetCamera)
		this.renderAnnotator()
	}

	// BOTH
	private handleTileManagerLoadError(dataType: string, err: Error): void {
		if (err instanceof BusyError) {
			log.info(err.message)
		} else if (this.uiState.isKioskMode) {
			log.warn(err.message)
		} else {
			const now = new Date().getTime()
			if (now - this.uiState.lastPointCloudLoadedErrorModalMs < this.settings.timeBetweenErrorDialogsMs) {
				log.warn(err.message)
			} else {
				log.error(err.message)
				dialog.showErrorBox(`${dataType} Load Error`, err.message)
				this.uiState.lastPointCloudLoadedErrorModalMs = now
			}
		}
	}

	private unloadPointCloudData(): void {
		if (this.pointCloudTileManager.unloadAllTiles()) {
			if (this.pointCloudBoundingBox)
				this.scene.remove(this.pointCloudBoundingBox)
		} else {
			log.warn('unloadPointCloudData failed')
		}
	}

	// Do some house keeping after loading annotations.
	private annotationLoadedSideEffects(): void {

        // TODO REORG JOE needs layerManager ref. Maybe LayerManager is a part of SceneManager?
		this.layerManager.setLayerVisibility([Layer.ANNOTATIONS])

        // TODO JOE belongs further down the call stack at the scene modification point.
		this.renderAnnotator()
	}

	// When TileManager loads a super tile, update Annotator's parallel data structure.
	// BOTH
    // TODO JOE, TileManager should coordinate with SceneManager to add tiles to
    // the scene, and this should be simple and only call loadTileGroundPlanes
    // which is annotator-app-specific.
	private onSuperTileLoad: (superTile: SuperTile) => void =
		(superTile: SuperTile) => {
			if (superTile instanceof PointCloudSuperTile) {

				this.loadTileGroundPlanes(superTile)

				if (superTile.pointCloud)
                    // TODO TileManager should coordinate this with SceneManager
					this.sceneManager.addObjectToScene(superTile.pointCloud)
				else
					log.error('onSuperTileLoad() got a super tile with no point cloud')
			} else if (superTile instanceof AnnotationSuperTile) {
				if (superTile.annotations)
                    // TODO JOE, AnnotationManager should coordinate this with SceneManager
					superTile.annotations.forEach(a => this.annotationManager.addAnnotation(a))
				else
					log.error('onSuperTileLoad() got a super tile with no annotations')
			} else {
				log.error('unknown superTile')
			}

            // TODO JOE, most render updates can move to SceneManager
			this.renderAnnotator()
			this.updateTileManagerStats()
		}

	// When TileManager unloads a super tile, update Annotator's parallel data structure.
    // BOTH
	private onSuperTileUnload: (superTile: SuperTile) => void =
		(superTile: SuperTile) => {
			if (superTile instanceof PointCloudSuperTile) {
				this.unloadTileGroundPlanes(superTile)

				if (superTile.pointCloud)
                    // TODO JOE, TileManager coordinate this with SceneManager
					this.scene.remove(superTile.pointCloud)
				else
					log.error('onSuperTileUnload() got a super tile with no point cloud')
			} else if (superTile instanceof AnnotationSuperTile) {
                // TODO JOE, AnnotationManager can coordinate this with SceneManager, and redux state can notify Annotation app if needed.
				superTile.annotations.forEach(a => this.annotationManager.deleteAnnotation(a))
			} else {
				log.error('unknown superTile')
			}

			this.renderAnnotator()
			this.updateTileManagerStats()
		}

	// Construct a set of 2D planes, each of which approximates the ground plane within a tile.
	// This assumes that each ground plane is locally flat and normal to gravity.
	// This assumes that the ground planes in neighboring tiles are close enough that the discrete
	// jumps between them won't matter much.
	// ??????
	private loadTileGroundPlanes(superTile: PointCloudSuperTile): void {
		if (!this.settings.estimateGroundPlane) return
		if (!superTile.pointCloud) return
		if (this.superTileGroundPlanes.has(superTile.key())) return

		const groundPlanes: THREE.Mesh[] = []

		superTile.tiles.forEach(tile => {
			const y = tile.groundAverageYIndex()
			if (!isNull(y)) {
				const xSize = tile.index.scale.xSize
				const zSize = tile.index.scale.zSize

				const geometry = new THREE.PlaneGeometry(
					xSize * this.settings.tileGroundPlaneScale,
					zSize * this.settings.tileGroundPlaneScale
				)
				geometry.rotateX(-Math.PI / 2)

				const material = new THREE.ShadowMaterial()
				const plane = new THREE.Mesh(geometry, material)
				const origin = this.utmCoordinateSystem.utmVectorToThreeJs(tile.index.origin)
				plane.position.x = origin.x + xSize / 2
				plane.position.y = y
				plane.position.z = origin.z - zSize / 2

				groundPlanes.push(plane)
			}
		})

		this.superTileGroundPlanes = this.superTileGroundPlanes.set(superTile.key(), groundPlanes)
		this.allGroundPlanes = this.allGroundPlanes.concat(groundPlanes)
		groundPlanes.forEach(plane => this.scene.add(plane))
	}

	private unloadTileGroundPlanes(superTile: PointCloudSuperTile): void {
		if (!this.superTileGroundPlanes.has(superTile.key())) return

		const groundPlanes = this.superTileGroundPlanes.get(superTile.key())!

		this.superTileGroundPlanes = this.superTileGroundPlanes.remove(superTile.key())
		this.allGroundPlanes = lodash.flatten(this.superTileGroundPlanes.valueSeq().toArray())
		groundPlanes.forEach(plane => this.scene.remove(plane))
	}

	/**
	 * 	Draw a box around the data. Useful for debugging.
	 */
	// RYAN DEBUG TOOL
	private updatePointCloudBoundingBox(): void {
		if (this.settings.drawBoundingBox) {
			if (this.pointCloudBoundingBox) {
				this.scene.remove(this.pointCloudBoundingBox)
				this.pointCloudBoundingBox = null
			}

			const bbox = this.pointCloudTileManager.getLoadedObjectsBoundingBox()
			if (bbox) {
				// BoxHelper wants an Object3D, but a three.js bounding box is a Box3, which is not an Object3D.
				// Maybe BoxHelper isn't so helpful after all. But guess what? It will take a Box3 anyway and
				// do the right thing with it.
				// tslint:disable-next-line:no-any
				this.pointCloudBoundingBox = new THREE.BoxHelper(bbox as any, this.settings.pointCloudBboxColor)
				this.scene.add(this.pointCloudBoundingBox)
			}
		}
	}

	// Find the point in the scene that is most interesting to a human user.
	// BOTH - used with AOI
	private currentPointOfInterest(): THREE.Vector3 | null {
		if (this.uiState.isLiveMode) {
			// In live mode track the car, regardless of what the camera does.
			return this.carModel.position
		} else {
			// In interactive mode intersect the camera with the ground plane.
			this.raycasterPlane.setFromCamera(cameraCenter, this.camera)

			let intersections: THREE.Intersection[] = []
			if (this.settings.estimateGroundPlane)
				intersections = this.raycasterPlane.intersectObjects(this.allGroundPlanes)
			if (!intersections.length)
				intersections = this.raycasterPlane.intersectObject(this.plane)

			if (intersections.length)
				return intersections[0].point
			else
				return null
		}
	}

	// Set the area of interest for loading point clouds.
	private updatePointCloudAoi(): void {
		if (!this.aoiState.enabled) return
		// The only use of Control at the moment is to enable model rotation in OrbitControls. Updating AOI is useful
		// mainly while panning across the model. Disable it during rotation for better rendering performance.
		if (this.uiState.isControlKeyPressed) return
		// Don't update AOI and load tiles if the point cloud is not visible.
		if (!this.uiState.isPointCloudVisible) return
		// TileManager will only handle one IO request at time. Pause AOI updates if it is busy.
		if (this.pointCloudTileManager.isLoadingTiles) return

		const currentPoint = this.currentPointOfInterest()
		if (currentPoint) {
			const oldPoint = this.aoiState.focalPoint
			const newPoint = currentPoint.clone().round()
			const samePoint = oldPoint && oldPoint.x === newPoint.x && oldPoint.y === newPoint.y && oldPoint.z === newPoint.z
			if (!samePoint) {
				this.aoiState.focalPoint = newPoint
				this.updatePointCloudAoiBoundingBox(this.aoiState.focalPoint)
			}
		} else {
			if (this.aoiState.focalPoint !== null) {
				this.aoiState.focalPoint = null
				this.updatePointCloudAoiBoundingBox(this.aoiState.focalPoint)
			}
		}
	}

	// Create a bounding box around the current AOI and optionally display it.
	// Then load the points in and around the AOI. If we have a current heading,
	// extend the AOI with another bounding box in the direction of motion.
    //
    // TODO JOE, TileManager can manage AoIs for tiles in each layer, so this
    // can move to the PointCloudTileManager.
	private updatePointCloudAoiBoundingBox(focalPoint: THREE.Vector3 | null): void {
		if (this.settings.drawBoundingBox) {
			this.aoiState.boundingBoxes.forEach(bbox => this.scene.remove(bbox))
			this.aoiState.boundingBoxes = []
		}

		if (focalPoint) {
			const threeJsSearches: RangeSearch[] = [{
				minPoint: focalPoint.clone().sub(this.settings.aoiHalfSize),
				maxPoint: focalPoint.clone().add(this.settings.aoiHalfSize),
			}]

			// What could be better than one AOI, but two? Add another one so we see more of what's in front.
			if (this.aoiState.currentHeading) {
				const extendedFocalPoint = focalPoint.clone()
					.add(this.settings.aoiFullSize.clone().multiply(this.aoiState.currentHeading))
				threeJsSearches.push({
					minPoint: extendedFocalPoint.clone().sub(this.settings.aoiHalfSize),
					maxPoint: extendedFocalPoint.clone().add(this.settings.aoiHalfSize),
				})
			}

			if (this.settings.drawBoundingBox) {
				threeJsSearches.forEach(search => {
					const geom = new THREE.Geometry()
					geom.vertices.push(search.minPoint, search.maxPoint)
					const bbox = new THREE.BoxHelper(new THREE.Points(geom), this.settings.aoiBboxColor)
					this.aoiState.boundingBoxes.push(bbox)
					this.scene.add(bbox)
				})
			}

			const utmSearches = threeJsSearches.map(threeJs => {
				return {
					minPoint: this.utmCoordinateSystem.threeJsToUtm(threeJs.minPoint),
					maxPoint: this.utmCoordinateSystem.threeJsToUtm(threeJs.maxPoint),
				}
			})

			this.loadPointCloudDataFromMapServer(utmSearches, true, false)
				.catch(err => {log.warn(err.message)})

			if (this.settings.enableAnnotationTileManager)
				this.loadAnnotationDataFromMapServer(utmSearches, true)
					.catch(err => {log.warn(err.message)})
		}
	}

	// The sky needs to be big enough that we don't bump into it but not so big that the camera can't see it.
	// So make it pretty big, then move it around to keep it centered over the camera in the XZ plane. Sky radius
	// and camera zoom settings, set elsewhere, should keep the camera from penetrating the shell in the Y dimension.
    //
    // TODO JOE moved to SceneManager
	// private updateSkyPosition = (): void => {
	// 	this.uiState.cameraPosition2D.set(this.camera.position.x, this.camera.position.z)
	// 	if (this.uiState.cameraPosition2D.distanceTo(this.uiState.skyPosition2D) > this.settings.cameraToSkyMaxDistance) {
	// 		this.sky.position.setX(this.uiState.cameraPosition2D.x)
	// 		this.sky.position.setZ(this.uiState.cameraPosition2D.y)
	// 		this.uiState.skyPosition2D.set(this.sky.position.x, this.sky.position.z)
	// 	}
	// }

	// Display some info in the UI about where the camera is pointed.
    //
    // TODO JOE let's let StatusWindow listen to global redux state that contains
	// a stack of status messages, which any component can push messages to and
	// remove from. The list of StatusMessages are objects that StatusSindow
	// observes, in order to update the display of the window.
	private displayCameraInfo = (): void => {
		if (this.uiState.isLiveMode) return

		// if (!this.statusWindow.isEnabled()) return
		// [RYAN] updated
		if( !getValue( () => this.props.statusWindowState && this.props.statusWindowState.enabled, false ) ) return

		const currentPoint = this.currentPointOfInterest()
		if (currentPoint) {
			const oldPoint = this.uiState.lastCameraCenterPoint
			const newPoint = currentPoint.clone().round()
			const samePoint = oldPoint && oldPoint.x === newPoint.x && oldPoint.y === newPoint.y && oldPoint.z === newPoint.z
			if (!samePoint) {
				this.uiState.lastCameraCenterPoint = newPoint
				const utm = this.utmCoordinateSystem.threeJsToUtm(newPoint)
				this.updateCurrentLocationStatusMessage(utm)
			}
		}
	}

	// ANNOTATOR ONLY
    // TODO REORG JOE generic event state, can go somewhere for use by all.
	private setLastMousePosition = (event: MouseEvent | null): void => {
		this.uiState.lastMousePosition = event
	}

	// ANNOTATOR ONLY
    // TODO REORG JOE, generic, can go in a lib or utils
	private getMouseCoordinates = (mousePosition: MousePosition): THREE.Vector2 => {
		const mouse = new THREE.Vector2()
		mouse.x = ( mousePosition.clientX / this.renderer.domElement.clientWidth ) * 2 - 1
		mouse.y = -( mousePosition.clientY / this.renderer.domElement.clientHeight ) * 2 + 1
		return mouse
	}

	// BOTH
    //
    // TODO JOE keep in Annotator app me thinks?
    //
    // TODO JOE Maybe ground tiles can be in
    // their own tile layer, and they are added/removed based on super tiles.
	private intersectWithGround(raycaster: THREE.Raycaster): THREE.Intersection[] {
		let intersections: THREE.Intersection[]
		if (this.settings.estimateGroundPlane || !this.pointCloudTileManager.objectCount()) {
			if (this.allGroundPlanes.length)
				intersections = raycaster.intersectObjects(this.allGroundPlanes)
			else
				intersections = raycaster.intersectObject(this.plane)
		} else {
			intersections = raycaster.intersectObjects(this.pointCloudTileManager.getPointClouds())
		}
		return intersections
	}

	// BOTH -- may be annotator only???
    //
    // TODO JOE Seems like this can move  somewhere related to
    // PointCloudTileManager, and app code can opt to using it.
	private intersectWithPointCloud(raycaster: THREE.Raycaster): THREE.Intersection[] {
		return raycaster.intersectObjects(this.pointCloudTileManager.getPointClouds())
	}

	// ANNOTATOR ONLY
	private intersectWithLightboxImageRay(raycaster: THREE.Raycaster): THREE.Intersection[] {
		if (this.lightboxImageRays.length)
			return raycaster.intersectObjects(this.lightboxImageRays)
		else
			return []
	}

	// When ImageManager loads an image, add it to the scene.
	// ANNOTATOR ONLY
    //
    // TODO JOE The UI can have check boxes for showing/hiding layers.
	private onImageScreenLoad: (imageScreen: ImageScreen) => void =
		(imageScreen: ImageScreen) => {
			this.setLayerVisibility([Layer.IMAGE_SCREENS])
			this.scene.add(imageScreen)
			this.renderAnnotator()
		}

	// When a lightbox ray is created, add it to the scene.
	// On null, remove all rays.
	// ANNOTATOR ONLY
	private onLightboxImageRay: (ray: THREE.Line | null) => void =
		(ray: THREE.Line | null) => {
			if (ray) {
				// Accumulate rays while shift is pressed, otherwise clear old ones.
				if (!this.uiState.isShiftKeyPressed)
					this.clearLightboxImageRays()
				this.setLayerVisibility([Layer.IMAGE_SCREENS])
				this.lightboxImageRays.push(ray)
				this.scene.add(ray)
				this.renderAnnotator()
			} else {
				this.clearLightboxImageRays()
			}
		}
	// ANNOTATOR ONLY
	private clearLightboxImageRays(): void {
		if (!this.lightboxImageRays.length) return

		this.lightboxImageRays.forEach(r => this.scene.remove(r))
		this.lightboxImageRays = []
		this.renderAnnotator()
	}

	// ANNOTATOR ONLY
	private checkForImageScreenSelection = (mousePosition: MousePosition): void => {
		if (this.uiState.isLiveMode) return
		if (!this.uiState.isShiftKeyPressed) return
		if (this.uiState.isMouseButtonPressed) return
		if (this.uiState.isAddMarkerKeyPressed) return
		if (this.uiState.isAddConnectionKeyPressed) return
		if (this.uiState.isConnectLeftNeighborKeyPressed ||
			this.uiState.isConnectRightNeighborKeyPressed ||
			this.uiState.isConnectFrontNeighborKeyPressed) return
		if (this.uiState.isJoinAnnotationKeyPressed) return
		if (!this.uiState.isImageScreensVisible) return

		if (!this.imageManager.imageScreenMeshes.length) return this.unHighlightImageScreenBox()

		const mouse = this.getMouseCoordinates(mousePosition)
		this.raycasterImageScreen.setFromCamera(mouse, this.camera)
		const intersects = this.raycasterImageScreen.intersectObjects(this.imageManager.imageScreenMeshes)

		// No screen intersected
		if (!intersects.length) {
			this.unHighlightImageScreenBox()
		} else {
			// Get intersected screen
			const first = intersects[0].object as THREE.Mesh
			const image = first.userData as CalibratedImage

			// Unhighlight previous screen
			if (
				this.highlightedImageScreenBox && this.highlightedImageScreenBox.id !== first.id
				|| this.highlightedLightboxImage && this.highlightedLightboxImage !== image
			)
				this.unHighlightImageScreenBox()

			// Highlight new screen
			this.highlightImageScreenBox(first)
		}
	}

	// ANNOTATOR ONLY
	private clickImageScreenBox = (event: MouseEvent): void => {
		if (this.uiState.isLiveMode) return
		if (this.uiState.isMouseDragging) return
		if (!this.uiState.isImageScreensVisible) return

		switch (event.button) {
			// Left click released
			case 0: {
				if (!this.highlightedImageScreenBox) return

				const mouse = this.getMouseCoordinates(event)
				this.raycasterImageScreen.setFromCamera(mouse, this.camera)
				const intersects = this.raycasterImageScreen.intersectObject(this.highlightedImageScreenBox)

				if (intersects.length) {
					const image = this.highlightedImageScreenBox.userData as CalibratedImage
					this.unHighlightImageScreenBox()
					this.renderAnnotator()
					this.imageManager.loadImageIntoWindow(image)
				}
				break
				// Middle click released
			} case 1: {
				// no actions
				break
			// Right  click released
			} case 2: {
				if (this.uiState.isShiftKeyPressed) return

				const mouse = this.getMouseCoordinates(event)
				this.raycasterImageScreen.setFromCamera(mouse, this.camera)
				const intersects = this.raycasterImageScreen.intersectObjects(this.imageManager.imageScreenMeshes)
				// Get intersected screen
				if (intersects.length) {
					const first = intersects[0].object as THREE.Mesh
					const material = first.material as THREE.MeshBasicMaterial
					material.opacity = this.uiState.imageScreenOpacity

					const screen = this.imageManager.getImageScreen(first)
					if (screen) screen.unloadImage()

					this.renderAnnotator()
				}
				break
			} default:
				log.warn('This should never happen.')
		}
	}

	// Draw the box with max opacity to indicate that it is active.
	// ANNOTATOR ONLY
	private highlightImageScreenBox(imageScreenBox: THREE.Mesh): void {
		if (this.uiState.isLiveMode) return
		if (!this.uiState.isShiftKeyPressed) return

		// Note: image loading takes time, so even if image is marked as "highlighted"
		// it is required to continue to renderAnnotator until the image is actually loaded and rendered
		if (imageScreenBox === this.highlightedImageScreenBox) {
			this.renderAnnotator()
			return
		}
		this.highlightedImageScreenBox = imageScreenBox

		const screen = this.imageManager.getImageScreen(imageScreenBox)
		if (screen)
			screen.loadImage()
				.then(loaded => {if (loaded) this.renderAnnotator()})
				.catch(err => log.warn('getImageScreen() failed', err))

		const image = imageScreenBox.userData as CalibratedImage
		// If it's already loaded in the lightbox, highlight it in the lightbox.
		// Don't allow it to be loaded a second time.
		if (this.imageManager.loadedImageDetails.has(image)) {
			if (this.imageManager.highlightImageInLightbox(image))
				this.highlightedLightboxImage = image
			return
		}

		const material = imageScreenBox.material as THREE.MeshBasicMaterial
		material.opacity = 1.0
		this.renderAnnotator()
	}

	// Draw the box with default opacity like all the other boxes.
	// ANNOTATOR ONLY
	private unHighlightImageScreenBox(): void {
		if (this.highlightedLightboxImage) {
			if (this.imageManager.unhighlightImageInLightbox(this.highlightedLightboxImage))
				this.highlightedLightboxImage = null
		}

		if (!this.highlightedImageScreenBox) return

		const material = this.highlightedImageScreenBox.material as THREE.MeshBasicMaterial
		material.opacity = this.uiState.imageScreenOpacity
		this.highlightedImageScreenBox = null
		this.renderAnnotator()
	}

	/*
	 * Make a best effort to save annotations before exiting. There is no guarantee the
	 * promise will complete, but it seems to work in practice.
	 */
	// ANNOTATOR ONLY
	private onBeforeUnload: (e: BeforeUnloadEvent) => void = (_: BeforeUnloadEvent) => {
		this.annotationManager.immediateAutoSave().then()
	}

	/**
	 * Get the size of the canvas
	 * @returns {[number,number]}
	 */
	// BOTH
    // TODO JOE moved to SceneManager
	// private getContainerSize = (): Array<number> => {
	// 	const $root = $(this.root)
	// 	return getValue(() => [$root.width(), $root.height()], [0, 0])
	// }

	// BOTH
    // TODO JOE moved to SceneManager
	// private onWindowResize = (): void => {
	// 	const [width, height]: Array<number> = this.getContainerSize()
    //
	// 	if ( this.camera instanceof THREE.PerspectiveCamera ) {
	// 		this.camera.aspect = width / height
	// 		this.camera.updateProjectionMatrix()
	// 	} else {
	// 		this.setOrthographicCameraDimensions(width, height)
	// 	}
    //
	// 	this.renderer.setSize(width, height)
	// 	this.renderAnnotator()
	// }

	// Scale the ortho camera frustum along with window dimensions to preserve a 1:1
	// proportion for model width:height.
	// BOTH
    // TODO JOE moved to SceneManager
	// private setOrthographicCameraDimensions(width: number, height: number): void {
	// 	const orthoWidth = this.settings.orthoCameraHeight * (width / height)
	// 	const orthoHeight = this.settings.orthoCameraHeight
	// 	this.annotatorOrthoCam.left = orthoWidth / -2
	// 	this.annotatorOrthoCam.right = orthoWidth / 2
	// 	this.annotatorOrthoCam.top = orthoHeight / 2
	// 	this.annotatorOrthoCam.bottom = orthoHeight / -2
	// 	this.annotatorOrthoCam.updateProjectionMatrix()
	// }

	// ANNOTATOR ONLY
    //
    // TODO REORG JOE move to AnnotationManager
    //
    // TODO REORG JOE instead of enabling/disabling autosave, just have auto-save
    // configured not to save when unfocused unless there's changes.
	private onFocus = (): void => {
		this.annotationManager.enableAutoSave()
	}
	private onBlur = (): void => {
		this.setLastMousePosition(null)
		this.annotationManager.disableAutoSave()
	}

	/**
	 * Handle keyboard events
	 */
	// BOTH (moved) -- requires keyboard event registration now though
    // TODO REORG JOE split this up, each app will register/hook into key events that
    // are managed from shared lib (SceneManager?)
	private onKeyDown = (event: KeyboardEvent): void => {
		if (event.defaultPrevented) return
		if (event.altKey) return
		if (event.ctrlKey) return
		if (event.metaKey) return

		if (document.activeElement.tagName === 'INPUT')
			this.onKeyDownInputElement(event)
		else if (this.uiState.isLiveMode)
			this.onKeyDownLiveMode(event)
		else
			this.onKeyDownInteractiveMode(event)
	}

	// ANNOTATOR ONLY
	private onKeyDownInputElement = (event: KeyboardEvent): void => {
		switch (event.key) {
			case 'Escape': {
				(event.target as HTMLInputElement).blur()
				break
			}
			default:
			// nothing to do here
		}
	}

	// @TODO BEHOLDER -- beholder needs to register these with SceneManager
	private onKeyDownLiveMode = (event: KeyboardEvent): void => {
		switch (event.keyCode) {
			case 37: { // left arrow
				this.liveModeSettings.cameraOffset.x += this.liveModeSettings.cameraOffsetDelta
				break
			}
			case 38: { // up arrow
				this.liveModeSettings.cameraOffset.y += this.liveModeSettings.cameraOffsetDelta
				break
			}
			case 39: { // right arrow
				this.liveModeSettings.cameraOffset.x -= this.liveModeSettings.cameraOffsetDelta
				break
			}
			case 40: { // down arrow
				this.liveModeSettings.cameraOffset.y -= this.liveModeSettings.cameraOffsetDelta
				break
			}
			default:
			// nothing to do here
		}
	}

	// ANNOTATOR ONLY
    // TODO REORG JOE move some of this event state to shared lib, perhaps a
    // KeyboardManager, and some of it is Annotation stuff.
	private onKeyDownInteractiveMode = (event: KeyboardEvent): void => {
		if (event.repeat) {
			// tslint:disable-line:no-empty
		} else if (event.keyCode >= 48 && event.keyCode <= 57) { // digits 0 to 9
			this.uiState.numberKeyPressed = parseInt(event.key, 10)
		} else {
			switch (event.key) {
				case 'Backspace': {
					this.onDeleteActiveAnnotation()
					break
				}
				case 'Control': {
					this.uiState.isControlKeyPressed = true
					break
				}
				case 'Escape': {
					this.escapeSelection()
					break
				}
				case 'Shift': {
					this.onShiftKeyDown()
					break
				}
				case 'A': {
					this.deleteAllAnnotations()
					break
				}
				case 'a': {
					this.uiState.isAddMarkerKeyPressed = true
					break
				}
				case 'b': {
					this.onAddAnnotation(AnnotationType.BOUNDARY)
					break
				}
				case 'C': {
					this.focusOnPointCloud()
					break
				}
				case 'c': {
					this.uiState.isAddConnectionKeyPressed = true
					break
				}
				case 'd': {
					log.info("Deleting last marker")
					if (this.annotationManager.deleteLastMarker())
						this.hideTransform()
					break
				}
				case 'F': {
					this.reverseLaneDirection()
					break
				}
				case 'f': {
					this.uiState.isConnectFrontNeighborKeyPressed = true
					break
				}
				case 'h': {
					this.toggleLayerVisibility()
					break
				}
				case 'j': {
					this.uiState.isJoinAnnotationKeyPressed = true
					break
				}
				case 'l': {
					this.uiState.isConnectLeftNeighborKeyPressed = true
					break
				}
				case 'm': {
					this.saveWaypointsKml().then()
					break
				}
				case 'N': {
					this.exportAnnotationsTiles(OutputFormat.UTM).then()
					break
				}
				case 'n': {
					this.onAddAnnotation(AnnotationType.LANE)
					break
				}
				case 'q': {
					this.uiState.isAddConflictOrDeviceKeyPressed = true
					break
				}
				case 'r': {
					this.uiState.isConnectRightNeighborKeyPressed = true
					break
				}
				case 'S': {
					this.saveToFile(OutputFormat.LLA).then()
					break
				}
				case 's': {
					this.saveToFile(OutputFormat.UTM).then()
					break
				}
				case 'R': {
					this.resetTiltAndCompass()
					break
				}
				case 'T': {
					this.onAddAnnotation(AnnotationType.TERRITORY)
					break
				}
				case 't': {
					this.onAddAnnotation(AnnotationType.TRAFFIC_DEVICE)
					break
				}
				case 'U': {
					this.unloadPointCloudData()
					break
				}
				case 'V': {
					this.toggleCameraType()
					break
				}
				case 'X': {
					if (this.annotationManager.activeAnnotation && this.annotationManager.activeAnnotation.isRotatable)
						this.toggleTransformControlsRotationMode()
					break
				}
				default:
				// nothing to see here
			}
		}
	}

	// ANNOTATOR ONLY
	private onKeyUp = (event: KeyboardEvent): void => {
		if (event.defaultPrevented) return

        // TODO remove left/right/front/back neighbor stuff
		this.uiState.isControlKeyPressed = false
		this.uiState.isAddMarkerKeyPressed = false
		this.uiState.isAddConnectionKeyPressed = false
		this.uiState.isConnectLeftNeighborKeyPressed = false
		this.uiState.isConnectRightNeighborKeyPressed = false
		this.uiState.isConnectFrontNeighborKeyPressed = false
		this.uiState.isAddConflictOrDeviceKeyPressed = false
		this.uiState.isJoinAnnotationKeyPressed = false
		this.uiState.numberKeyPressed = null
		this.onShiftKeyUp()
	}

	// ANNOTATOR ONLY
	private onShiftKeyDown = (): void => {
		this.uiState.isShiftKeyPressed = true
		if (this.uiState.lastMousePosition)
			this.checkForImageScreenSelection(this.uiState.lastMousePosition)
	}

	// ANNOTATOR ONLY
	private onShiftKeyUp = (): void => {
		this.uiState.isShiftKeyPressed = false
		this.unHighlightImageScreenBox()
	}

	// ANNOTATOR ONLY
    // TODO REORG JOE move to AnnotationManager
	private delayHideTransform = (): void => {
		this.cancelHideTransform()
		this.hideTransform()
	}

	// ANNOTATOR ONLY
    // TODO REORG JOE move to AnnotationManager
	private hideTransform = (): void => {
		this.hideTransformControlTimer = window.setTimeout(this.cleanTransformControls, 1500)
	}

	// ANNOTATOR ONLY
    // TODO REORG JOE move to AnnotationManager
	private cancelHideTransform = (): void => {
		if (this.hideTransformControlTimer) {
			window.clearTimeout(this.hideTransformControlTimer)
		}
	}

	// ANNOTATOR ONLY
    // TODO REORG JOE move to AnnotationManager
	private cleanTransformControls = (): void => {
		this.cancelHideTransform()
		this.transformControls.detach()
		this.annotationManager.unhighlightMarkers()
		this.renderAnnotator()
	}

	/**
	 * Create orbit controls which enable translation, rotation and zooming of the scene.
	 */
	// ANNOTATOR ONLY
    // TODO REORG JOE SceneManager or something related to it can have viewport modes,
    // and would handle the camera. For now let's move this to SceneManager, and
    // let both apps control the position of the focus.
	private initAnnotatorOrbitControls(): void {
		this.annotatorOrbitControls = new OrbitControls(this.annotatorCamera, this.renderer.domElement)
		this.annotatorOrbitControls.minDistance = 0.1
		this.annotatorOrbitControls.maxDistance = 5000
		this.annotatorOrbitControls.keyPanSpeed = 100

		// Add listeners.

		this.annotatorOrbitControls.addEventListener('change', this.updateSkyPosition)

		// Update some UI if the camera panned -- that is it moved in relation to the model.
		this.annotatorOrbitControls.addEventListener('pan', this.displayCameraInfo)

		// If we are controlling the scene don't hide any transform object.
		this.annotatorOrbitControls.addEventListener('start', this.cancelHideTransform)

		// After the scene transformation is over start the timer to hide the transform object.
		this.annotatorOrbitControls.addEventListener('end', this.delayHideTransform)

		this.annotatorOrbitControls.addEventListener('start', () => {
			this.updateOrbitControls = true
			this.loop.addAnimationFn(() => this.updateOrbitControls)
		})

		this.annotatorOrbitControls.addEventListener('end', () => {
			this.updateOrbitControls = false
		})
	}

	// BEHOLDER
	private initFlyThroughOrbitControls(): void {
		this.flyThroughOrbitControls = new OrbitControls(this.flyThroughCamera, this.renderer.domElement)
		this.flyThroughOrbitControls.enabled = false
		this.flyThroughOrbitControls.minDistance = 10
		this.flyThroughOrbitControls.maxDistance = 5000
		this.flyThroughOrbitControls.minPolarAngle = 0
		this.flyThroughOrbitControls.maxPolarAngle = Math.PI / 2
		this.flyThroughOrbitControls.keyPanSpeed = 100
		this.flyThroughOrbitControls.enablePan = false

		this.flyThroughOrbitControls.addEventListener('change', this.updateSkyPosition)

		this.flyThroughOrbitControls.addEventListener('start', () => {
			this.updateOrbitControls = true
			this.loop.addAnimationFn(() => this.updateOrbitControls)
		})

		this.flyThroughOrbitControls.addEventListener('end', () => {
			this.updateOrbitControls = false
		})
	}

	// OBSOLETE :)
	private get orbitControls(): THREE.OrbitControls {
		if (this.uiState.isLiveMode) return this.flyThroughOrbitControls
		else return this.annotatorOrbitControls
	}

	/**
	 * Create Transform controls object. This allows for the translation of an object in the scene.
	 */
	// ANNOTATOR ONLY
    // TODO REORG JOE move to AnnotationManager
	private initTransformControls(): void {
		this.transformControls = new TransformControls(this.camera, this.renderer.domElement, false)
		this.transformControls.addEventListener('change', this.renderAnnotator)
		this.scene.add(this.transformControls)

		// Add listeners.

		// If we are interacting with the transform object don't hide it.
		this.transformControls.addEventListener('change', this.cancelHideTransform)

		// If we just clicked on a transform object don't hide it.
		this.transformControls.addEventListener('mouseDown', this.cancelHideTransform)

		// If we are done interacting with a transform object start hiding process.
		this.transformControls.addEventListener('mouseUp', this.delayHideTransform)

		// If the object attached to the transform object has changed, do something.
		this.transformControls.addEventListener('objectChange', this.annotationManager.updateActiveAnnotationMesh)
	}

	// ANNOTATOR ONLY
	private onDeleteActiveAnnotation(): void {
		// Delete annotation from scene
		if (this.annotationManager.deleteActiveAnnotation()) {
			log.info("Deleted selected annotation")
            // TODO JOE this will trigger state change which in turn updates the UI.
			this.deactivateLanePropUI()
			this.hideTransform()
			this.renderAnnotator()
		}
	}

	// ANNOTATOR ONLY
	private deleteAllAnnotations(): void {
		this.annotationManager.immediateAutoSave()
			.then(() => {
				this.annotationManager.unloadAllAnnotations()
			})
	}

	// Create an annotation, add it to the scene, and activate (highlight) it.
	// ANNOTATOR ONLY
	private onAddAnnotation(annotationType: AnnotationType): void {
		if (this.annotationManager.createAndAddAnnotation(annotationType, true)[0]) {
			log.info(`Added new ${AnnotationType[annotationType]} annotation`)
			this.deactivateAllAnnotationPropertiesMenus(annotationType)
			this.resetAllAnnotationPropertiesMenuElements()
			this.hideTransform()
		}
	}

	// Save all annotation data.
	// ANNOTATOR ONLY
	private saveToFile(format: OutputFormat): Promise<void> {
		// Attempt to insert a string representing the coordinate system format into the requested path, then save.
		const basePath = config.get('output.annotations.json.path')
		const i = basePath.indexOf('.json')
		const formattedPath = i >= 0
			? basePath.slice(0, i) + '-' + OutputFormat[format] + basePath.slice(i, basePath.length)
			: basePath
		log.info(`Saving annotations JSON to ${formattedPath}`)
		return this.annotationManager.saveAnnotationsToFile(formattedPath, format)
			.catch(error => log.warn("save to file failed: " + error.message))
	}

	private exportAnnotationsTiles(format: OutputFormat): Promise<void> {
		const basePath = config.get('output.annotations.tiles_dir')
		const scale = scale3DToSpatialTileScale(this.scaleProvider.utmTileScale)
		if (isNullOrUndefined(scale))
			return Promise.reject(Error(`1can't create export path because of a bad scale: ${this.scaleProvider.utmTileScale}`))
		const scaleString = spatialTileScaleToString(scale)
		if (isNullOrUndefined(scaleString))
			return Promise.reject(Error(`2can't create export path because of a bad scale: ${this.scaleProvider.utmTileScale}`))
		const dir = basePath + '/' + dateToString(new Date()) + scaleString
		log.info(`Exporting annotations tiles to ${dir}`)
		return this.annotationManager.exportAnnotationsTiles(dir, format)
			.catch(error => log.warn("export failed: " + error.message))
	}

	// Save lane waypoints only.
	// ANNOTATOR ONLY
	private saveWaypointsKml(): Promise<void> {
		const basePath = config.get('output.annotations.kml.path')
		log.info(`Saving waypoints KML to ${basePath}`)
		return this.annotationManager.saveToKML(basePath)
			.catch(err => log.warn('saveToKML failed: ' + err.message))
	}

	private loadTrajectoryFromOpenDialog(): Promise<void> {
		const { promise, resolve, reject }: PromiseReturn<void, Error> = createPromise<void, Error>()

		const options: Electron.OpenDialogOptions = {
			message: 'Load Trajectory File',
			properties: ['openFile'],
			filters: [{name: 'md', extensions: ['md']}],
		}

		const handler = (paths: string[]): void => {
			if (paths && paths.length)
				FlyThroughManager.loadFlyThroughTrajectories([ paths[0] ])
					.then(() => resolve())
					.catch(err => reject(err))
			else
				reject(Error('no trajectory path selected'))
		}

		dialog.showOpenDialog(options, handler)

		return promise
	}

	// ANNOTATOR ONLY
    // TODO REORG JOE remove?
	private addFront(): void {
		log.info("Adding connected annotation to the front")
		if (this.annotationManager.addConnectedLaneAnnotation(NeighborLocation.FRONT, NeighborDirection.SAME)) {
			Annotator.deactivateFrontSideNeighbours()
		}
		this.renderAnnotator()
	}

	// ANNOTATOR ONLY
    // TODO REORG JOE remove?
	private addLeftSame(): void {
		log.info("Adding connected annotation to the left - same direction")
		if (this.annotationManager.addConnectedLaneAnnotation(NeighborLocation.LEFT, NeighborDirection.SAME)) {
			Annotator.deactivateLeftSideNeighbours()
		}
		this.renderAnnotator()
	}

	// ANNOTATOR ONLY
    // TODO REORG JOE remove?
	private addLeftReverse(): void {
		log.info("Adding connected annotation to the left - reverse direction")
		if (this.annotationManager.addConnectedLaneAnnotation(NeighborLocation.LEFT, NeighborDirection.REVERSE)) {
			Annotator.deactivateLeftSideNeighbours()
		}
		this.renderAnnotator()
	}

	// ANNOTATOR ONLY
    // TODO REORG JOE remove?
	private addRightSame(): void {
		log.info("Adding connected annotation to the right - same direction")
		if (this.annotationManager.addConnectedLaneAnnotation(NeighborLocation.RIGHT, NeighborDirection.SAME)) {
			Annotator.deactivateRightSideNeighbours()
		}
		this.renderAnnotator()
	}

	// ANNOTATOR ONLY
    // TODO REORG JOE remove?
	private addRightReverse(): void {
		log.info("Adding connected annotation to the right - reverse direction")
		if (this.annotationManager.addConnectedLaneAnnotation(NeighborLocation.RIGHT, NeighborDirection.REVERSE)) {
			Annotator.deactivateRightSideNeighbours()
		}
		this.renderAnnotator()
	}

	// ANNOTATOR ONLY
    // TODO REORG JOE move to AnnotationManager
	private reverseLaneDirection(): void {
		log.info("Reverse lane direction.")
		const {result, existLeftNeighbour, existRightNeighbour}: { result: boolean, existLeftNeighbour: boolean, existRightNeighbour: boolean }
			= this.annotationManager.reverseLaneDirection()
		if (result) {
			if (existLeftNeighbour) {
				Annotator.deactivateLeftSideNeighbours()
			} else {
				Annotator.activateLeftSideNeighbours()
			}
			if (existRightNeighbour) {
				Annotator.deactivateRightSideNeighbours()
			} else {
				Annotator.activateRightSideNeighbours()
			}
			this.renderAnnotator()
		}
	}

    // TODO JOE handle DOM events the React way {{

	/**
	 * Bind functions events to interface elements
	 */
	// ANNOTATOR ONLY
	private bindLanePropertiesPanel(): void {
		const lcType = $('#lp_select_type')
		lcType.on('change', () => {
			lcType.blur()
			const activeAnnotation = this.annotationManager.getActiveLaneAnnotation()
			if (activeAnnotation === null)
				return
			log.info("Adding lane type: " + lcType.children("option").filter(":selected").text())
			activeAnnotation.type = +lcType.val()
		})

		const lcLeftType = $('#lp_select_left_type')
		lcLeftType.on('change', () => {
			lcLeftType.blur()
			const activeAnnotation = this.annotationManager.getActiveLaneAnnotation()
			if (activeAnnotation === null)
				return
			log.info("Adding left side type: " + lcLeftType.children("option").filter(":selected").text())
			activeAnnotation.leftLineType = +lcLeftType.val()
			activeAnnotation.updateVisualization()
		})

		const lcLeftColor = $('#lp_select_left_color')
		lcLeftColor.on('change', () => {
			lcLeftColor.blur()
			const activeAnnotation = this.annotationManager.getActiveLaneAnnotation()
			if (activeAnnotation === null)
				return
			log.info("Adding left side type: " + lcLeftColor.children("option").filter(":selected").text())
			activeAnnotation.leftLineColor = +lcLeftColor.val()
			activeAnnotation.updateVisualization()
		})

		const lcRightType = $('#lp_select_right_type')
		lcRightType.on('change', () => {
			lcRightType.blur()
			const activeAnnotation = this.annotationManager.getActiveLaneAnnotation()
			if (activeAnnotation === null)
				return
			log.info("Adding right side type: " + lcRightType.children("option").filter(":selected").text())
			activeAnnotation.rightLineType = +lcRightType.val()
			activeAnnotation.updateVisualization()
		})

		const lcRightColor = $('#lp_select_right_color')
		lcRightColor.on('change', () => {
			lcRightColor.blur()
			const activeAnnotation = this.annotationManager.getActiveLaneAnnotation()
			if (activeAnnotation === null)
				return
			log.info("Adding left side type: " + lcRightColor.children("option").filter(":selected").text())
			activeAnnotation.rightLineColor = +lcRightColor.val()
			activeAnnotation.updateVisualization()
		})

		const lcEntry = $('#lp_select_entry')
		lcEntry.on('change', () => {
			lcEntry.blur()
			const activeAnnotation = this.annotationManager.getActiveLaneAnnotation()
			if (activeAnnotation === null)
				return
			log.info("Adding entry type: " + lcEntry.children("option").filter(":selected").text())
			activeAnnotation.entryType = lcEntry.val()
		})

		const lcExit = $('#lp_select_exit')
		lcExit.on('change', () => {
			lcExit.blur()
			const activeAnnotation = this.annotationManager.getActiveLaneAnnotation()
			if (activeAnnotation === null)
				return
			log.info("Adding exit type: " + lcExit.children("option").filter(":selected").text())
			activeAnnotation.exitType = lcExit.val()
		})
	}

	// ANNOTATOR ONLY
	private bindLaneNeighborsPanel(): void {
		const lpAddLeftOpposite = document.getElementById('lp_add_left_opposite')
		if (lpAddLeftOpposite)
			lpAddLeftOpposite.addEventListener('click', () => {
				this.addLeftReverse()
			})
		else
			log.warn('missing element lp_add_left_opposite')

		const lpAddLeftSame = document.getElementById('lp_add_left_same')
		if (lpAddLeftSame)
			lpAddLeftSame.addEventListener('click', () => {
				this.addLeftSame()
			})
		else
			log.warn('missing element lp_add_left_same')

		const lpAddRightOpposite = document.getElementById('lp_add_right_opposite')
		if (lpAddRightOpposite)
			lpAddRightOpposite.addEventListener('click', () => {
				this.addRightReverse()
			})
		else
			log.warn('missing element lp_add_right_opposite')

		const lpAddRightSame = document.getElementById('lp_add_right_same')
		if (lpAddRightSame)
			lpAddRightSame.addEventListener('click', () => {
				this.addRightSame()
			})
		else
			log.warn('missing element lp_add_right_same')

		const lpAddFront = document.getElementById('lp_add_forward')
		if (lpAddFront)
			lpAddFront.addEventListener('click', () => {
				this.addFront()
			})
		else
			log.warn('missing element lp_add_forward')
	}

	// ANNOTATOR ONLY
	private bindConnectionPropertiesPanel(): void {
		const cpType = $('#cp_select_type')
		cpType.on('change', () => {
			cpType.blur()
			const activeAnnotation = this.annotationManager.getActiveConnectionAnnotation()
			if (activeAnnotation === null)
				return
			log.info("Adding connection type: " + cpType.children("options").filter(":selected").text())
			activeAnnotation.type = +cpType.val()
		})
	}

	// ANNOTATOR ONLY
	private bindTerritoryPropertiesPanel(): void {
		const territoryLabel = document.getElementById('input_label_territory')
		if (territoryLabel) {
			// Select all text when the input element gains focus.
			territoryLabel.addEventListener('focus', event => {
				(event.target as HTMLInputElement).select()
			})

			// Update territory label text on any change to input.
			territoryLabel.addEventListener('input', (event: Event) => {
				const activeAnnotation = this.annotationManager.getActiveTerritoryAnnotation()
				if (activeAnnotation)
					activeAnnotation.setLabel((event.target as HTMLInputElement).value)
			})

			// User is done editing: lose focus.
			territoryLabel.addEventListener('change', (event: Event) => {
				(event.target as HTMLInputElement).blur()
			})
		} else
			log.warn('missing element input_label_territory')
	}

	// ANNOTATOR ONLY
	private bindTrafficDevicePropertiesPanel(): void {
		const tpType = $('#tp_select_type')
		tpType.on('change', () => {
			tpType.blur()
			const activeAnnotation = this.annotationManager.getActiveTrafficDeviceAnnotation()
			if (activeAnnotation === null)
				return
			log.info("Adding traffic device type: " + tpType.children("option").filter(":selected").text())
			activeAnnotation.type = +tpType.val()
			activeAnnotation.updateVisualization()
			this.renderAnnotator()
		})
	}

	// ANNOTATOR ONLY
	private bindBoundaryPropertiesPanel(): void {
		const bpType = $('#bp_select_type')
		bpType.on('change', () => {
			bpType.blur()
			const activeAnnotation = this.annotationManager.getActiveBoundaryAnnotation()
			if (activeAnnotation === null)
				return
			log.info("Adding boundary type: " + bpType.children("options").filter(":selected").text())
			activeAnnotation.type = +bpType.val()
		})

		const bpColor = $('#bp_select_color')
		bpColor.on('change', () => {
			bpColor.blur()
			const activeAnnotation = this.annotationManager.getActiveBoundaryAnnotation()
			if (activeAnnotation === null)
				return
			log.info("Adding boundary color: " + bpColor.children("options").filter(":selected").text())
			activeAnnotation.color = +bpColor.val()
		})
	}

	// RYAN -- mostly Annotator specific
	// ANNOTATOR ONLY
	private bind(): void {
		this.bindLanePropertiesPanel()
		this.bindLaneNeighborsPanel()
		this.bindConnectionPropertiesPanel()
		this.bindTerritoryPropertiesPanel()
		this.bindTrafficDevicePropertiesPanel()
		this.bindBoundaryPropertiesPanel()

		const menuControlElement = document.getElementById('menu_control')
		if (menuControlElement)
			menuControlElement.style.visibility = 'visible'
		else
			log.warn('missing element menu_control')

		const menuButton = document.getElementById('menu_control_btn')
		if (menuButton)
			menuButton.addEventListener('click', () => {
				log.info("Menu icon clicked. Close/Open menu bar.")

				// RYAN UPDATED
				new RoadNetworkEditorActions().toggleUIMenuVisible()
				// this.displayMenu(MenuVisibility.TOGGLE)
			})
		else
			log.warn('missing element menu_control_btn')

		const toolsDelete = document.getElementById('tools_delete')
		if (toolsDelete)
			toolsDelete.addEventListener('click', () => {
				this.onDeleteActiveAnnotation()
			})
		else
			log.warn('missing element tools_delete')

		const toolsAddLane = document.getElementById('tools_add_lane')
		if (toolsAddLane)
			toolsAddLane.addEventListener('click', () => {
				this.onAddAnnotation(AnnotationType.LANE)
			})
		else
			log.warn('missing element tools_add_lane')

		const toolsAddTrafficDevice = document.getElementById('tools_add_traffic_device')
		if (toolsAddTrafficDevice)
			toolsAddTrafficDevice.addEventListener('click', () => {
				this.onAddAnnotation(AnnotationType.TRAFFIC_DEVICE)
			})
		else
			log.warn('missing element tools_add_traffic_device')

		const toolsLoadTrajectory = document.getElementById('tools_load_trajectory')
		if (toolsLoadTrajectory)
			toolsLoadTrajectory.addEventListener('click', () => {
				this.loadTrajectoryFromOpenDialog()
					.catch(err => log.warn('loadFromFile failed: ' + err.message))
			})
		else
			log.warn('missing element tools_load_trajectory')

		const toolsLoadImages = document.getElementById('tools_load_images')
		if (toolsLoadImages)
			toolsLoadImages.addEventListener('click', () => {
				this.imageManager.loadImagesFromOpenDialog()
					.catch(err => log.warn('loadImagesFromOpenDialog failed: ' + err.message))
			})
		else
			log.warn('missing element tools_load_images')

		const toolsLoadAnnotation = document.getElementById('tools_load_annotation')
		if (toolsLoadAnnotation)
			toolsLoadAnnotation.addEventListener('click', () => {
				const options: Electron.OpenDialogOptions = {
					message: 'Load Annotations File',
					properties: ['openFile'],
					filters: [{name: 'json', extensions: ['json']}],
				}
				const handler = (paths: string[]): void => {
					if (paths && paths.length)
						this.annotationManager.loadAnnotations(paths[0])
							.catch(err => log.warn('loadAnnotations failed: ' + err.message))
				}
				dialog.showOpenDialog(options, handler)
			})
		else
			log.warn('missing element tools_load_annotation')

		const toolsSave = document.getElementById('tools_save')
		if (toolsSave)
			toolsSave.addEventListener('click', () => {
				this.saveToFile(OutputFormat.UTM).then()
			})
		else
			log.warn('missing element tools_save')

		const toolsExportKml = document.getElementById('tools_export_kml')
		if (toolsExportKml)
			toolsExportKml.addEventListener('click', () => {
				this.saveWaypointsKml().then()
			})
		else
			log.warn('missing element tools_export_kml')

		const liveModePauseBtn = document.querySelector('#live_mode_pause')
		if (liveModePauseBtn)
			liveModePauseBtn.addEventListener('click', this.toggleLiveModePlay)
		else
			log.warn('missing element live_mode_pause')

		const liveAndRecordedToggleBtn = document.querySelector('#live_recorded_playback_toggle')
		if (liveAndRecordedToggleBtn)
			liveAndRecordedToggleBtn.addEventListener('click', this.toggleLiveAndRecordedPlay)
		else
			log.warn('missing element live_recorded_playback_toggle')

		const selectTrajectoryPlaybackFile = document.querySelector('#select_trajectory_playback_file')
		if (selectTrajectoryPlaybackFile)
			selectTrajectoryPlaybackFile.addEventListener('click', this.openTrajectoryPicker)
		else
			log.warn('missing element select_trajectory_playback_file')
	}

    // }}

	// Hang on to a reference to TrajectoryPicker so we can call it later.
	// ANNOTATOR ONLY
    // TODO REORG JOE remove trajectory picker stuff
	setOpenTrajectoryPickerFunction(theFunction: (cb: TrajectoryFileSelectedCallback) => void): void {
		this.openTrajectoryPickerFunction = theFunction
	}

	// ANNOTATOR ONLY
    // TODO REORG JOE remove trajectory picker stuff
	private openTrajectoryPicker = (): void => {
		if (this.openTrajectoryPickerFunction)
			this.openTrajectoryPickerFunction(this.trajectoryFileSelectedCallback)
	}

	render() {
		return (
			<React.Fragment>
				<div className="scene-container" ref={(el): HTMLDivElement => this.sceneContainer = el!}/>
				<TrajectoryPicker
                    // TODO REORG JOE remove trajectory picker stuff
					ref={(tp): TrajectoryPicker => this.trajectoryPickerRef = tp!}
				/>
                <AnnotationManager />
                {/* TODO JOE ref to the AnnotationManager*/}
                <SceneManager />
			</React.Fragment>
		)

	}

	componentDidMount() {

		this.mount()
			.then(() => this.setOpenTrajectoryPickerFunction(this.trajectoryPickerRef.openModal))

	}

	componentWillUnmount(): void {
		this.unmount()
	}



    // TODO JOE beholder uses trajectories
    // TODO REORG JOE remove trajectory picker stuff
	private trajectoryFileSelectedCallback = (path: string): void => {
		if (!this.uiState.isLiveMode) return

		FlyThroughManager.loadFlyThroughTrajectories([path])
			.then(() => {
				// Make sure that we are in flyThrough mode and that the animation is running.
				if (this.props.flyThroughState && !this.props.flyThroughState.enabled) {
					// this.toggleLiveAndRecordedPlay()
					FlyThroughManager.toggleLiveAndRecordedPlay()
				}

				FlyThroughManager.startFlyThrough()
				//this.startFlyThrough()

				//if (this.uiState.isLiveModePaused)
				if (!this.props.liveModeEnabled)
					console.log("WANTING TO RESUME LIVE MODE")
					// this.resumeLiveMode()
			})
			.catch(error => {
				log.error(`loadFlyThroughTrajectories failed: ${error}`)
				dialog.showErrorBox('Error loading trajectory', error.message)
			})
	}

    // ANNOTATOR ONLY JOE
	private expandAccordion(domId: string): void {
		if ( !this.props.uiMenuVisible ) return
		$(domId).accordion('option', {active: 0})
	}

    // ANNOTATOR ONLY JOE
	private collapseAccordion(domId: string): void {
		if ( !this.props.uiMenuVisible ) return
		$(domId).accordion('option', {active: false})
	}

    // TODO JOE this all will be controlled by React state + markup {{

    // ANNOTATOR ONLY JOE
	private resetAllAnnotationPropertiesMenuElements(): void {
		this.resetBoundaryProp()
		this.resetLaneProp()
		this.resetConnectionProp()
		this.resetTerritoryProp()
		this.resetTrafficDeviceProp()
	}

	/**
	 * Reset lane properties elements based on the current active lane
	 */
	// ANNOTATOR ONLY
	private resetLaneProp(): void {
		const activeAnnotation = this.annotationManager.getActiveLaneAnnotation()
		if (!activeAnnotation) return

		this.expandAccordion('#menu_lane')

		if (activeAnnotation.neighborsIds.left.length > 0) {
			Annotator.deactivateLeftSideNeighbours()
		} else {
			Annotator.activateLeftSideNeighbours()
		}

		if (activeAnnotation.neighborsIds.right.length > 0) {
			Annotator.deactivateRightSideNeighbours()
		} else {
			Annotator.activateRightSideNeighbours()
		}

		if (activeAnnotation.neighborsIds.front.length > 0) {
			Annotator.deactivateFrontSideNeighbours()
		} else {
			Annotator.activateFrontSideNeighbours()
		}

		const lpId = document.getElementById('lp_id_value')
		if (lpId)
			lpId.textContent = activeAnnotation.id.toString()
		else
			log.warn('missing element lp_id_value')
		activeAnnotation.updateLaneWidth()

		const lpSelectType = $('#lp_select_type')
		lpSelectType.removeAttr('disabled')
		lpSelectType.val(activeAnnotation.type.toString())

		const lpSelectLeft = $('#lp_select_left_type')
		lpSelectLeft.removeAttr('disabled')
		lpSelectLeft.val(activeAnnotation.leftLineType.toString())

		const lpSelectLeftColor = $('#lp_select_left_color')
		lpSelectLeftColor.removeAttr('disabled')
		lpSelectLeftColor.val(activeAnnotation.leftLineColor.toString())

		const lpSelectRight = $('#lp_select_right_type')
		lpSelectRight.removeAttr('disabled')
		lpSelectRight.val(activeAnnotation.rightLineType.toString())

		const lpSelectRightColor = $('#lp_select_right_color')
		lpSelectRightColor.removeAttr('disabled')
		lpSelectRightColor.val(activeAnnotation.rightLineColor.toString())

		const lpSelectEntry = $('#lp_select_entry')
		lpSelectEntry.removeAttr('disabled')
		lpSelectEntry.val(activeAnnotation.entryType.toString())

		const lpSelectExit = $('#lp_select_exit')
		lpSelectExit.removeAttr('disabled')
		lpSelectExit.val(activeAnnotation.exitType.toString())
	}

	/**
	 * Reset territory properties elements based on the current active territory
	 */
	// ANNOTATOR ONLY
	private resetTerritoryProp(): void {
		const activeAnnotation = this.annotationManager.getActiveTerritoryAnnotation()
		if (!activeAnnotation) return

		this.expandAccordion('#menu_territory')

		const territoryLabel = document.getElementById('input_label_territory')
		if (territoryLabel) {
			(territoryLabel as HTMLInputElement).value = activeAnnotation.getLabel()
		} else
			log.warn('missing element input_label_territory')
	}

	/**
	 * Reset traffic device properties elements based on the current active traffic device
	 */
	// ANNOTATOR ONLY
	private resetTrafficDeviceProp(): void {
		const activeAnnotation = this.annotationManager.getActiveTrafficDeviceAnnotation()
		if (!activeAnnotation) return

		this.expandAccordion('#menu_traffic_device')

		const tpId = document.getElementById('tp_id_value')
		if (tpId)
			tpId.textContent = activeAnnotation.id.toString()
		else
			log.warn('missing element tp_id_value')

		const tpSelectType = $('#tp_select_type')
		tpSelectType.removeAttr('disabled')
		tpSelectType.val(activeAnnotation.type.toString())
	}

	/**
	 * Reset boundary properties elements based on the current active boundary
	 */
	// ANNOTATOR ONLY
	private resetBoundaryProp(): void {
		const activeAnnotation = this.annotationManager.getActiveBoundaryAnnotation()
		if (!activeAnnotation) return

		this.expandAccordion('#menu_boundary')

		const bpId = document.getElementById('bp_id_value')
		if (bpId)
			bpId.textContent = activeAnnotation.id.toString()
		else
			log.warn('missing element bp_id_value')

		const bpSelectType = $('#bp_select_type')
		bpSelectType.removeAttr('disabled')
		bpSelectType.val(activeAnnotation.type.toString())

		const bpSelectColor = $('#bp_select_color')
		bpSelectColor.removeAttr('disabled')
		bpSelectColor.val(activeAnnotation.color.toString())
	}

	/**
	 * Reset connection properties elements based on the current active connection
	 */
	// ANNOTATOR ONLY
	private resetConnectionProp(): void {
		const activeAnnotation = this.annotationManager.getActiveConnectionAnnotation()
		if (!activeAnnotation) return

		this.expandAccordion('#menu_connection')

		const cpId = document.getElementById('cp_id_value')
		if (cpId)
			cpId.textContent = activeAnnotation.id.toString()
		else
			log.warn('missing element bp_id_value')

		const cpSelectType = $('#cp_select_type')
		cpSelectType.removeAttr('disabled')
		cpSelectType.val(activeAnnotation.type.toString())
	}

	// ANNOTATOR ONLY
	private deactivateAllAnnotationPropertiesMenus(exceptFor: AnnotationType = AnnotationType.UNKNOWN): void {
		if ( !this.props.uiMenuVisible ) return
		if (exceptFor !== AnnotationType.BOUNDARY) this.deactivateBoundaryProp()
		if (exceptFor !== AnnotationType.LANE) this.deactivateLanePropUI()
		if (exceptFor !== AnnotationType.CONNECTION) this.deactivateConnectionProp()
		if (exceptFor !== AnnotationType.TERRITORY) this.deactivateTerritoryProp()
		if (exceptFor !== AnnotationType.TRAFFIC_DEVICE) this.deactivateTrafficDeviceProp()
	}

	/**
	 * Deactivate lane properties menu panel
	 */
	// ANNOTATOR ONLY
    // TODO JOE this should be React markup with state controling the content
	private deactivateLanePropUI(): void {
		this.collapseAccordion('#menu_lane')

		Annotator.deactivateLeftSideNeighbours()
		Annotator.deactivateRightSideNeighbours()
		Annotator.deactivateFrontSideNeighbours()

		const lpId = document.getElementById('lp_id_value')
		if (lpId)
			lpId.textContent = 'UNKNOWN'
		else
			log.warn('missing element lp_id_value')
		const lpWidth = document.getElementById('lp_width_value')
		if (lpWidth)
			lpWidth.textContent = 'UNKNOWN'
		else
			log.warn('missing element lp_width_value')

		const laneProp1 = document.getElementById('lane_prop_1')
		if (laneProp1) {
			const selects = laneProp1.getElementsByTagName('select')
			for (let i = 0; i < selects.length; ++i) {
				selects.item(i).selectedIndex = 0
				selects.item(i).setAttribute('disabled', 'disabled')
			}
		} else
			log.warn('missing element lane_prop_1')
	}

	/**
	 * Deactivate boundary properties menu panel
	 */
	// ANNOTATOR ONLY
	private deactivateBoundaryProp(): void {
		this.collapseAccordion('#menu_boundary')

		const bpId = document.getElementById('bp_id_value')
		if (bpId)
			bpId.textContent = 'UNKNOWN'
		else
			log.warn('missing element bp_id_value')

		const bpType = document.getElementById('bp_select_type')
		if (bpType)
			bpType.setAttribute('disabled', 'disabled')
		else
			log.warn('missing element bp_select_type')

		const bpColor = document.getElementById('bp_select_color')
		if (bpColor)
			bpColor.setAttribute('disabled', 'disabled')
		else
			log.warn('missing element bp_select_color')

		const boundaryProp = document.getElementById('boundary_prop')
		if (boundaryProp) {
			const selects = boundaryProp.getElementsByTagName('select')
			for (let i = 0; i < selects.length; ++i) {
				selects.item(i).selectedIndex = 0
				selects.item(i).setAttribute('disabled', 'disabled')
			}
		} else
			log.warn('missing element boundary_prop')
	}

	/**
	 * Deactivate connection properties menu panel
	 */
	// ANNOTATOR ONLY
	private deactivateConnectionProp(): void {
		this.collapseAccordion('#menu_connection')

		const cpId = document.getElementById('cp_id_value')
		if (cpId)
			cpId.textContent = 'UNKNOWN'
		else
			log.warn('missing element cp_id_value')

		const cpType = document.getElementById('cp_select_type')
		if (cpType)
			cpType.setAttribute('disabled', 'disabled')
		else
			log.warn('missing element cp_select_type')

		const connectionProp = document.getElementById('connection_prop')
		if (connectionProp) {
			const selects = connectionProp.getElementsByTagName('select')
			for (let i = 0; i < selects.length; ++i) {
				selects.item(i).selectedIndex = 0
				selects.item(i).setAttribute('disabled', 'disabled')
			}
		} else
			log.warn('missing element boundary_prop')
	}

	/**
	 * Deactivate territory properties menu panel
	 */
	// ANNOTATOR ONLY
	private deactivateTerritoryProp(): void {
		this.collapseAccordion('#menu_territory')

		const territoryLabel = document.getElementById('input_label_territory')
		if (territoryLabel)
			(territoryLabel as HTMLInputElement).value = ''
		else
			log.warn('missing element input_label_territory')
	}

	/**
	 * Deactivate traffic device properties menu panel
	 */
	// ANNOTATOR ONLY
	private deactivateTrafficDeviceProp(): void {
		this.collapseAccordion('#menu_traffic_device')

		const tpId = document.getElementById('tp_id_value')
		if (tpId)
			tpId.textContent = 'UNKNOWN'
		else
			log.warn('missing element tp_id_value')

		const tpType = document.getElementById('tp_select_type')
		if (tpType)
			tpType.setAttribute('disabled', 'disabled')
		else
			log.warn('missing element tp_select_type')
	}

	/**
	 * Deactivate/activate left side neighbours
	 */
	// ANNOTATOR ONLY
	private static deactivateLeftSideNeighbours(): void {
		const lpAddLeftOpposite = document.getElementById('lp_add_left_opposite')
		if (lpAddLeftOpposite)
			lpAddLeftOpposite.setAttribute('disabled', 'disabled')
		else
			log.warn('missing element lp_add_left_opposite')

		const lpAddLeftSame = document.getElementById('lp_add_left_same')
		if (lpAddLeftSame)
			lpAddLeftSame.setAttribute('disabled', 'disabled')
		else
			log.warn('missing element lp_add_left_same')
	}

	// ANNOTATOR ONLY
	private static activateLeftSideNeighbours(): void {
		const lpAddLeftOpposite = document.getElementById('lp_add_left_opposite')
		if (lpAddLeftOpposite)
			lpAddLeftOpposite.removeAttribute('disabled')
		else
			log.warn('missing element lp_add_left_opposite')

		const lpAddLeftSame = document.getElementById('lp_add_left_same')
		if (lpAddLeftSame)
			lpAddLeftSame.removeAttribute('disabled')
		else
			log.warn('missing element lp_add_left_same')
	}

	/**
	 * Deactivate right side neighbours
	 */
	// ANNOTATOR ONLY
	private static deactivateRightSideNeighbours(): void {
		const lpAddRightOpposite = document.getElementById('lp_add_right_opposite')
		if (lpAddRightOpposite)
			lpAddRightOpposite.setAttribute('disabled', 'disabled')
		else
			log.warn('missing element lp_add_right_opposite')

		const lpAddRightSame = document.getElementById('lp_add_right_same')
		if (lpAddRightSame)
			lpAddRightSame.setAttribute('disabled', 'disabled')
		else
			log.warn('missing element lp_add_right_same')
	}

	// ANNOTATOR ONLY
	private static activateRightSideNeighbours(): void {
		const lpAddRightOpposite = document.getElementById('lp_add_right_opposite')
		if (lpAddRightOpposite)
			lpAddRightOpposite.removeAttribute('disabled')
		else
			log.warn('missing element lp_add_right_opposite')

		const lpAddRightSame = document.getElementById('lp_add_right_same')
		if (lpAddRightSame)
			lpAddRightSame.removeAttribute('disabled')
		else
			log.warn('missing element lp_add_right_same')
	}

	/**
	 * Deactivate/activate front side neighbours
	 */
	// ANNOTATOR ONLY
	private static deactivateFrontSideNeighbours(): void {
		const lpAddFront = document.getElementById('lp_add_forward')
		if (lpAddFront)
			lpAddFront.setAttribute('disabled', 'disabled')
		else
			log.warn('missing element lp_add_forward')
	}

	// ANNOTATOR ONLY
	private static activateFrontSideNeighbours(): void {
		const lpAddFront = document.getElementById('lp_add_forward')
		if (lpAddFront)
			lpAddFront.removeAttribute('disabled')
		else
			log.warn('missing element lp_add_forward')
	}

    // }}

	// Switch the camera between two views. Attempt to keep the scene framed in the same way after the switch.
	// BOTH
    // TODO REORG JOE move to SceneManager (maybe later CameraManager)
	private toggleCameraType(): void {
		let oldCamera: THREE.Camera
		let newCamera: THREE.Camera
		let newType: string
		if (this.camera === this.annotatorPerspectiveCam) {
			oldCamera = this.annotatorPerspectiveCam
			newCamera = this.annotatorOrthoCam
			newType = cameraTypeString.orthographic
		} else {
			oldCamera = this.annotatorOrthoCam
			newCamera = this.annotatorPerspectiveCam
			newType = cameraTypeString.perspective
		}

		// Copy over the camera position. When the next animate() runs, the new camera will point at the
		// same target as the old camera, since the target is maintained by OrbitControls. That takes
		// care of position and orientation, but not zoom. PerspectiveCamera and OrthographicCamera
		// calculate zoom differently. It would be nice to convert one to the other here.
		newCamera.position.set(oldCamera.position.x, oldCamera.position.y, oldCamera.position.z)
		this.annotatorCamera = newCamera

		this.onWindowResize()

		this.transformControls.setCamera(this.camera)
		this.annotatorOrbitControls.setCamera(this.camera)
		this.flyThroughOrbitControls.setCamera(this.camera)

		// RYAN UPDATED
		// this.statusWindow.setMessage(statusKey.cameraType, 'Camera: ' + newType)
		new StatusWindowActions().setMessage(StatusKey.CAMERA_TYPE, 'Camera: ' + newType)

		this.storage.setItem(preferenceKey.cameraPreference, newType)
		this.renderAnnotator()
	}

	// Toggle the visibility of data by cycling through the groups defined in layerGroups.
	// ANNOTATOR ONLY
    // TODO REORG JOE move to LayerManager
	private toggleLayerVisibility(): void {
		this.uiState.layerGroupIndex++
		if (!layerGroups[this.uiState.layerGroupIndex])
			this.uiState.layerGroupIndex = defaultLayerGroupIndex
		this.setLayerVisibility(layerGroups[this.uiState.layerGroupIndex], true)
	}

	// Ensure that some layers of the model are visible. Optionally hide the other layers.
	// BOTH
	// MOVED TO LayerManager
	private setLayerVisibility(show: Layer[], hideOthers: boolean = false): void {
		let updated = 0

		show.forEach(layer => {
			if (this.layerToggle.has(layer))
				// tslint:disable-next-line:no-unused-expression <-- work around a tslint bug
				this.layerToggle.get(layer).show() && updated++
			else
				log.error(`missing visibility toggle for ${layer}, ${Layer[layer]}`)
		})

		if (hideOthers) {
			const hide = lodash.difference(allLayers, show)
			hide.forEach(layer => {
				if (this.layerToggle.has(layer))
					// tslint:disable-next-line:no-unused-expression <-- work around a tslint bug
					this.layerToggle.get(layer).hide() && updated++
				else
					log.error(`missing visibility toggle for ${layer}, ${Layer[layer]}`)
			})
		}

		if (updated)
			this.renderAnnotator()
	}

    // TODO REORG JOE these are LayerManager/TileManager things

	// BOTH
	private hidePointCloud = (): boolean => {
		if (!this.uiState.isPointCloudVisible)
			return false
		this.decorations.forEach(d => d.visible = false)
		this.pointCloudTileManager.getPointClouds().forEach(pc => this.scene.remove(pc))
		if (this.pointCloudBoundingBox)
			this.scene.remove(this.pointCloudBoundingBox)
		this.uiState.isPointCloudVisible = false
		return true
	}

	// BOTH
	private showPointCloud = (): boolean => {
		if (this.uiState.isPointCloudVisible)
			return false
		this.decorations.forEach(d => d.visible = true)
		this.pointCloudTileManager.getPointClouds().forEach(pc => this.scene.add(pc))
		if (this.pointCloudBoundingBox)
			this.scene.add(this.pointCloudBoundingBox)
		this.uiState.isPointCloudVisible = true
		return true
	}

	private hideImageScreens = (): boolean => {
		if (!this.uiState.isImageScreensVisible)
			return false
		this.imageManager.hideImageScreens()
		this.uiState.isImageScreensVisible = false
		return true
	}

	// BOTH
	private showImageScreens = (): boolean => {
		if (this.uiState.isImageScreensVisible)
			return false
		this.imageManager.showImageScreens()
		this.uiState.isImageScreensVisible = true
		return true
	}

	// BOTH
	private hideAnnotations = (): boolean => {
		if (!this.uiState.isAnnotationsVisible)
			return false
		this.annotationManager.hideAnnotations()
		this.uiState.isAnnotationsVisible = false
		return true
	}

	// BOTH
	private showAnnotations = (): boolean => {
		if (this.uiState.isAnnotationsVisible)
			return false
		this.annotationManager.showAnnotations()
		this.uiState.isAnnotationsVisible = true
		return true
	}

    // }}

	// BEHOLDER ONLY
	private loadCarModel(): Promise<void> {
		return new Promise((resolve: () => void, reject: (reason?: Error) => void): void => {
			try {
				const manager = new THREE.LoadingManager()
				const loader = new THREE.OBJLoader(manager)
				loader.load(carModelOBJ, (object: THREE.Object3D) => {
					const boundingBox = new THREE.Box3().setFromObject(object)
					const boxSize = boundingBox.getSize().toArray()
					const modelLength = Math.max(...boxSize)
					const carLength = 4.5 // approx in meters
					const scaleFactor = carLength / modelLength
					this.carModel = object
					this.carModel.scale.setScalar(scaleFactor)
					this.carModel.visible = false
					this.carModel.traverse(child => {
						if (child instanceof THREE.Mesh)
							child.material = this.liveModeSettings.carModelMaterial
					})
					this.scene.add(object)
					resolve()
				})
			} catch (err) {
				reject(err)
			}
		})
	}

	// Move the camera and the car model through poses streamed from ZMQ.
	// See also runFlyThrough().
	// BEHOLDER
	private initClient(): void {
		if (this.liveSubscribeSocket) return

		this.liveSubscribeSocket = zmq.socket('sub')

		this.liveSubscribeSocket.on('message', (msg) => {
			// if (!this.uiState.isLiveMode) return
			// if (this.uiState.isLiveModePaused) return
			if(!this.props.liveModeEnabled || !this.props.playModeEnabled) return

			// RYAN UPDATED
			// if (this.flyThroughState.enabled) return
			if (this.props.flyThroughState && this.props.flyThroughState.enabled) return

			const state = Models.InertialStateMessage.decode(msg)
			if (
				state.pose &&
				state.pose.x != null && state.pose.y != null && state.pose.z != null &&
				state.pose.q0 != null && state.pose.q1 != null && state.pose.q2 != null && state.pose.q3 != null
			) {
				this.updateCarWithPose(state.pose as Models.PoseMessage)
			} else
				log.warn('got an InertialStateMessage without a pose')
		})

		const locationHost = config.get('location_server.host') || 'localhost'
		const locationPort = config.get('location_server.port') || '5564'
		this.liveSubscribeSocket.connect("tcp://" + locationHost + ":" + locationPort)
		this.liveSubscribeSocket.subscribe("")
	}

	// BOTH (NOT MOVED) REPLACED WITH redux action .setUIMenuVisibility()
	switchToMenu( menuId: string ): void {

		this.hideAllMenus()
		this.show( menuId )

	}

	// BOTH (not moved) REPLACED WITH redux action .setUIMenuVisibility()
	private hideAllMenus(): void {
		for ( const menu of Array.from( $('#menu .menu') ) ) {
			menu.classList.add('hidden')
		}
	}

	// BOTH (not moved) REPLACED WITH redux action .setUIMenuVisibility()
	private show( selector: string ): void {
		for ( const el of Array.from( $( selector ) ) ) {
			el.classList.remove('hidden')
		}
	}

	// Switch from interactive editing mode into a read-only, first-person view for displaying
	// live or recorded vehicle trajectories.
	// BEHOLDER!!!!!!!!
	private listen(): boolean {
		if (this.uiState.isLiveMode) return this.uiState.isLiveMode

		log.info('Listening for messages...')
		this.uiState.isLiveMode = true
		this.setLayerVisibility([Layer.POINT_CLOUD, Layer.ANNOTATIONS], true)
		if (this.gui)
			this.gui.close()
		if (this.axis)
			this.scene.remove(this.axis)
		if (this.compassRose)
			this.scene.remove(this.compassRose)
		if (this.grid)
			this.grid.visible = false

		this.annotatorOrbitControls.enabled = false
		this.flyThroughOrbitControls.enabled = true

		// The camera and the point cloud AOI track the car object, so add it to the scene
		// regardless of whether it is visible in the scene.
		this.carModel.add(this.camera) // follow/orbit around the car
		if (this.liveModeSettings.displayCarModel)
			this.carModel.visible = true

		if (this.pointCloudBoundingBox)
			this.pointCloudBoundingBox.material.visible = false

		// Start both types of playback, just in case. If fly-through is enabled it will preempt the live location client.
		FlyThroughManager.startFlyThrough()
		// this.startFlyThrough()
		this.locationServerStatusClient.connect()
		//this.resumeLiveMode()
		this.initClient()

		this.renderAnnotator()
		return this.uiState.isLiveMode
	}

	// Show or hide the menu as requested.
	// RYAN UPDATED (added by joe)
	// private displayMenu(visibility: MenuVisibility): void {
	// 	const menu = document.getElementById('menu')
	// 	if (menu)
	// 		switch (visibility) {
	// 			case MenuVisibility.HIDE:
	// 				menu.style.visibility = 'hidden'
	// 				break
	// 			case MenuVisibility.SHOW:
	// 				menu.style.visibility = 'visible'
	// 				break
	// 			case MenuVisibility.TOGGLE:
	// 				menu.style.visibility = menu.style.visibility === 'hidden' ? 'visible' : 'hidden'
	// 				break
	// 			default:
	// 				log.warn(`unhandled visibility option ${visibility} in displayMenu()`)
	// 		}
	// 	else
	// 		log.warn('missing element menu')
	// }

	// BOTH
    // TODO REORG JOE move to TileManager (for each tile layer)? Or have it in a single
    // place for all tile layers, f.e. something like LayerManager?
	private updateAoiHeading(rotationThreeJs: THREE.Quaternion | null): void {
		if (this.aoiState.enabled)
			this.aoiState.currentHeading = rotationThreeJs
				? new THREE.Vector3(-1, 0, 0).applyQuaternion(rotationThreeJs)
				: null
	}

	// BEHOLDER
    // TODO JOE I'm thinking that Kiosk will update the car, and the
    // SceneManager should pick up the state change and re-render.
	private updateCarWithPose(pose: Models.PoseMessage): void {
		const inputPosition = new THREE.Vector3(pose.x, pose.y, pose.z)
		const standardPosition = convertToStandardCoordinateFrame(inputPosition, CoordinateFrameType.STANDARD)
		const positionThreeJs = this.utmCoordinateSystem.utmToThreeJs(standardPosition.x, standardPosition.y, standardPosition.z)
		const inputRotation = new THREE.Quaternion(pose.q0, pose.q1, pose.q2, pose.q3)
		const standardRotation = cvtQuaternionToStandardCoordinateFrame(inputRotation, CoordinateFrameType.STANDARD)
		const rotationThreeJs = new THREE.Quaternion(standardRotation.y, standardRotation.z, standardRotation.x, standardRotation.w)
		rotationThreeJs.normalize()

		this.updateAoiHeading(rotationThreeJs)
		this.updateCurrentLocationStatusMessage(standardPosition)
		this.updateCarPose(positionThreeJs, rotationThreeJs)
	}

	componentWillReceiveProps(newProps) {
    	// BEHOLDER
		if(newProps.carPose && (newProps.carPose != this.props.carPose)) {
			// console.log("Updating updateCarWithPose from lifecycle")
			this.updateCarWithPose(newProps.carPose)
		}

	}


	// BOTH - statusWindowManager
	private updateCurrentLocationStatusMessage(positionUtm: THREE.Vector3): void {
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

	// BEHOLDER
	private updateCarPose(position: THREE.Vector3, rotation: THREE.Quaternion): void {
		this.carModel.position.set(position.x, position.y, position.z)
		this.carModel.setRotationFromQuaternion(rotation)
		// Bring the model close to the ground (approx height of the sensors)
		const p = this.carModel.getWorldPosition()
		this.carModel.position.set(p.x, p.y - 2, p.z)
	}

	// Print a message about how big our tiles are.
	// RELATED TO ABOVE -- statusWindowManager
	private updateTileManagerStats(): void {
		if (!this.settings.enableTileManagerStats) return
		// if (!this.statusWindow.isEnabled()) return
		if (!this.props.uiMenuVisible) return

		//RYAN UPDATED
		const message = `Loaded ${this.pointCloudTileManager.superTiles.size} point tiles; ${this.pointCloudTileManager.objectCount()} points`
		new StatusWindowActions().setMessage(StatusKey.TILE_MANAGER_POINT_STATS, message)

		if (this.settings.enableAnnotationTileManager) {
			const message2 = `Loaded ${this.annotationTileManager.superTiles.size} annotation tiles; ${this.annotationTileManager.objectCount()} annotations`
			new StatusWindowActions().setMessage(StatusKey.TILE_MANAGER_ANNOTATION_STATS, message2)
		}
	}

	// BOTH
    // TODO REORG JOE move decorations to a separate layer
	private onSetOrigin = (): void => {
		this.loadDecorations().then()
	}

	// Add some easter eggs to the scene if they are close enough.
	// BOTH
    // TODO REORG JOE move decorations to a separate layer
	private loadDecorations(): Promise<void> {
		return getDecorations()
			.then(decorations => {
				decorations.forEach(decoration => {
					const position = this.utmCoordinateSystem.lngLatAltToThreeJs(decoration.userData)
					const distanceFromOrigin = position.length()
					if (distanceFromOrigin < this.settings.maxDistanceToDecorations) {
						// Don't worry about rotation. The object is just floating in space.
						decoration.position.set(position.x, position.y, position.z)
						this.decorations.push(decoration)
						this.scene.add(decoration)
					}
				})
			})
	}

	// Display a UI element to tell the user what is happening with tile server. Error messages persist,
	// and success messages disappear after a time-out.
	// BOTH - STATUS WINDOW
	private onTileServiceStatusUpdate: (tileServiceStatus: boolean) => void = (tileServiceStatus: boolean) => {
		let message = 'Tile server status: '
		if (tileServiceStatus) {
			message += '<span class="statusOk">Available</span>'
			this.delayHideTileServiceStatus()
		} else {
			message += '<span class="statusError">Unavailable</span>'
			this.cancelHideTileServiceStatus()
		}
		// RYAN UPDATED
		// this.statusWindow.setMessage(statusKey.tileServer, message)
		new StatusWindowActions().setMessage(StatusKey.TILE_SERVER, message)
	}

	// BOTH STATUS WINDOW
	private delayHideTileServiceStatus = (): void => {
		this.cancelHideTileServiceStatus()
		this.hideTileServiceStatus()
	}

	// BOTH STATUS WINDOW
	private cancelHideTileServiceStatus = (): void => {
		if (this.serverStatusDisplayTimer)
			window.clearTimeout(this.serverStatusDisplayTimer)
	}

	// BOTH STATUS WINDOW
	private hideTileServiceStatus = (): void => {
		this.serverStatusDisplayTimer = window.setTimeout(() => {

			// RYAN UPDATED
			new StatusWindowActions().setMessage(StatusKey.TILE_SERVER, '')
			// this.statusWindow.setMessage(statusKey.tileServer, '')
		}, this.settings.timeToDisplayHealthyStatusMs)
	}

	// Display a UI element to tell the user what is happening with the location server.
	// Error messages persist,  and success messages disappear after a time-out.
	// BEHOLDER - with status window
	private onLocationServerStatusUpdate: (level: LocationServerStatusLevel, serverStatus: string)
			=> void = (level: LocationServerStatusLevel, serverStatus: string) => {
		// If we aren't listening then we don't care

		// RYAN UPDATED
		// if (!this.uiState.isLiveMode) return
		// if (this.flyThroughState.enabled) return
		if (!this.props.liveModeEnabled || this.props.flyThroughState && this.props.flyThroughState.enabled) return

		let message = 'Location status: '
		switch (level) {
			case LocationServerStatusLevel.INFO:
				message += '<span class="statusOk">' + serverStatus + '</span>'
				this.delayLocationServerStatus()
				break
			case LocationServerStatusLevel.WARNING:
				message += '<span class="statusWarning">' + serverStatus + '</span>'
				this.cancelHideLocationServerStatus()
				break
			case LocationServerStatusLevel.ERROR:
				message += '<span class="statusError">' + serverStatus + '</span>'
				this.cancelHideLocationServerStatus()
				break
			default:
				log.error('unknown LocationServerStatusLevel ' + LocationServerStatusLevel.ERROR)
		}
		// RYAN UPDATED
		new StatusWindowActions().setMessage(StatusKey.LOCATION_SERVER, message)
		// this.statusWindow.setMessage(statusKey.locationServer, message)
	}

	// BEHOLDER STATUS WINDOW
	private delayLocationServerStatus = (): void => {
		this.cancelHideLocationServerStatus()
		this.hideLocationServerStatus()
	}

	// BEHOLDER STATUS WINDOW
	private cancelHideLocationServerStatus = (): void => {
		if (this.locationServerStatusDisplayTimer)
			window.clearTimeout(this.locationServerStatusDisplayTimer)
	}

	// BEHOLDER STATUS WINDOW
	private hideLocationServerStatus = (): void => {
		this.locationServerStatusDisplayTimer = window.setTimeout(() => {
			// RYAN UPDATED
			// this.statusWindow.setMessage(statusKey.locationServer, '')
			new StatusWindowActions().setMessage(StatusKey.LOCATION_SERVER, '')
		}, this.settings.timeToDisplayHealthyStatusMs)
	}


}
