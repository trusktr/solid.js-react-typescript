/**
 *  Copyright 2017 Mapper Inc. Part of the mapper-annotator project.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */


const config = require('../config')
import * as $ from 'jquery'
import * as AsyncFile from "async-file";
const sprintf = require("sprintf-js").sprintf
import * as lodash from 'lodash'
import {Map} from 'immutable'
import LocalStorage from "./state/LocalStorage"
import {TransformControls} from 'annotator-entry-ui/controls/TransformControls'
import {OrbitControls} from 'annotator-entry-ui/controls/OrbitControls'
import {
	convertToStandardCoordinateFrame, CoordinateFrameType,
	cvtQuaternionToStandardCoordinateFrame
} from "./geometry/CoordinateFrame"
import {isTupleOfNumbers} from "./util/Validation"
import {StatusWindowController} from "./status/StatusWindowController"
import {TileManager} from 'annotator-entry-ui/tile/TileManager'
import {SuperTile} from "./tile/SuperTile"
import {RangeSearch} from "./model/RangeSearch"
import {BusyError, SuperTileUnloadAction} from "./tile/TileManager"
import {getCenter, getSize} from "./geometry/ThreeHelpers"
import {AxesHelper} from "./controls/AxesHelper"
import {CompassRose} from "./controls/CompassRose"
import {AnnotationManager, OutputFormat} from 'annotator-entry-ui/AnnotationManager'
import {Annotation, AnnotationId} from 'annotator-entry-ui/annotations/AnnotationBase'
import {NeighborLocation, NeighborDirection, Lane} from 'annotator-entry-ui/annotations/Lane'
import {Connection} from "./annotations/Connection"
import {TrafficSign} from "./annotations/TrafficSign"
import {Boundary} from "./annotations/Boundary"
import * as EM from 'annotator-entry-ui/ErrorMessages'
import * as TypeLogger from 'typelogger'
import {getValue} from "typeguard"
import {isNull, isUndefined} from "util"
import * as MapperProtos from '@mapperai/mapper-models'
import Models = MapperProtos.mapper.models
import * as THREE from 'three'
import {Socket} from 'zmq'
import {LocationServerStatusClient, LocationServerStatusLevel} from "./status/LocationServerStatusClient";
const  watch = require('watch')

declare global {
	namespace THREE {
		const OBJLoader: any
	}
}

const statsModule = require("stats.js")
const datModule = require("dat.gui/build/dat.gui")
const {dialog} = require('electron').remote
const zmq = require('zmq')
const OBJLoader = require('three-obj-loader')
OBJLoader(THREE)

// tslint:disable-next-line:no-any
TypeLogger.setLoggerOutput(console as any)
const log = TypeLogger.getLogger(__filename)
const root = $("#root")

function noop(): void {
	return
}

const cameraCenter = new THREE.Vector2(0, 0)

const statusKey = {
	currentLocationLla: 'currentLocationLla',
	currentLocationUtm: 'currentLocationUtm',
	flyThrough: 'flyThrough',
	tileServer: 'tileServer',
	locationServer: 'locationServer',
	cameraType: 'cameraType',
	tileManagerStats: 'tileManagerStats',
}

const preferenceKey = {
	cameraPreference: 'cameraPreference',
}

const cameraTypeString = {
	orthographic: 'orthographic',
	perspective: 'perspective',
}

enum MenuVisibility {
	HIDE = 0,
	SHOW,
	TOGGLE
}

enum ModelVisibility {
	ALL_VISIBLE = 0,
	HIDE_SUPER_TILES,
	HIDE_SUPER_TILES_AND_POINT_CLOUD,
	HIDE_SUPER_TILES_AND_ANNOTATIONS,
}

interface AnnotatorSettings {
	background: string
	cameraOffset: THREE.Vector3
	lightOffset: THREE.Vector3
	orthoCameraHeight: number // ortho camera uses world units (which we treat as meters) to define its frustum
	defaultFpsRendering: number
	fpsRendering: number
	estimateGroundPlane: boolean
	tileGroundPlaneScale: number // ground planes don't meet at the edges: scale them up a bit so they are more likely to intersect a raycaster
	generateVoxelsOnPointLoad: boolean
	drawBoundingBox: boolean
	enableTileManagerStats: boolean
	superTileBboxMaterial: THREE.Material // for visualizing available, but unpopulated, super tiles
	superTileBboxColor: THREE.Color
	aoiBboxColor: THREE.Color
	aoiFullSize: THREE.Vector3 // the dimensions of an AOI box, which will be constructed around a center point
	aoiHalfSize: THREE.Vector3 // half the dimensions of an AOI box
	timeBetweenErrorDialogsMs: number
	timeToDisplayHealthyStatusMs: number
}

interface FlyThroughSettings {
	enabled: boolean
	startPoseIndex: number
	endPoseIndex: number
	currentPoseIndex: number
}

interface LiveModeSettings {
	carModelMaterial: THREE.Material
	cameraOffset: THREE.Vector3
	cameraOffsetDelta: number
	fps: number
}

interface UiState {
	modelVisibility: ModelVisibility
	lockBoundaries: boolean
	lockLanes: boolean
	isSuperTilesVisible: boolean
	isPointCloudVisible: boolean
	isAnnotationsVisible: boolean
	isControlKeyPressed: boolean
	isShiftKeyPressed: boolean
	isAddMarkerKeyPressed: boolean
	isAddConnectionKeyPressed: boolean
	isMouseButtonPressed: boolean
	numberKeyPressed: number | null
	// Live mode enables trajectory play-back with minimal user input. The trajectory comes from either a pre-recorded
	// file (if this.flyThroughSettings.enabled is true) or messages on a live socket.
	isLiveMode: boolean
	isKioskMode: boolean // hides window chrome and turns on live mode permanently, with even less user input
	lastPointCloudLoadedErrorModalMs: number // timestamp when an error modal was last displayed
	lastCameraCenterPoint: THREE.Vector3 | null // point in three.js coordinates where camera center line has recently intersected ground plane
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
export class Annotator {
	private storage: LocalStorage // persistent state for UI settings
	private uiState: UiState
	private aoiState: AoiState
	private statusWindow: StatusWindowController // a place to print status messages
	private scene: THREE.Scene // where objects are rendered in the UI; shared with AnnotationManager
	private perspectiveCamera: THREE.PerspectiveCamera
	private orthographicCamera: THREE.OrthographicCamera
	private camera: THREE.Camera
	private renderer: THREE.WebGLRenderer
	private raycasterPlane: THREE.Raycaster // used to compute where the waypoints will be dropped
	private raycasterMarker: THREE.Raycaster // used to compute which marker is active for editing
	private raycasterSuperTiles: THREE.Raycaster // used to select a pending super tile for loading
	private raycasterAnnotation: THREE.Raycaster // used to highlight annotations for selection
	private carModel: THREE.Object3D // displayed during live mode, moving along a trajectory
	private tileManager: TileManager
	private plane: THREE.Mesh // an arbitrary horizontal (XZ) reference plane for the UI
	private grid: THREE.GridHelper // visible grid attached to the reference plane
	private axis: THREE.Object3D | null // highlights the origin and primary axes of the three.js coordinate system
	private compassRose: THREE.Object3D | null // indicates the direction of North
	private light: THREE.SpotLight
	private stats: Stats
	private orbitControls: THREE.OrbitControls // controller for moving the camera about the scene
	private transformControls: any // controller for translating an object within the scene
	private hideTransformControlTimer: NodeJS.Timer
	private serverStatusDisplayTimer: NodeJS.Timer
	private locationServerStatusDisplayTimer: NodeJS.Timer
	private annotationManager: AnnotationManager
	private pendingSuperTileBoxes: THREE.Mesh[] // bounding boxes of super tiles that exist but have not been loaded
	private highlightedSuperTileBox: THREE.Mesh | null // pending super tile which is currently active in the UI
	private superTileGroundPlanes: Map<string, THREE.Mesh[]> // super tile key -> all of the super tile's ground planes
	private allGroundPlanes: THREE.Mesh[] // ground planes for all tiles, denormalized from superTileGroundPlanes
	private pointCloudBoundingBox: THREE.BoxHelper | null // just a box drawn around the point cloud
	private liveSubscribeSocket: Socket
	private hovered: THREE.Object3D | null // a lane vertex which the user is interacting with
	private settings: AnnotatorSettings
	private flyThroughTrajectoryPoses: Models.PoseMessage[]
	private flyThroughSettings: FlyThroughSettings
	private liveModeSettings: LiveModeSettings
	private locationServerStatusClient: LocationServerStatusClient
	private gui: any

	constructor() {
		this.storage = new LocalStorage()
		this.settings = {
			background: config.get('startup.background_color') || '#082839',
			cameraOffset: new THREE.Vector3(0, 400, 200),
			lightOffset: new THREE.Vector3(0, 1500, 200),
			orthoCameraHeight: 100, // enough to view ~1 city block of data
			defaultFpsRendering: parseInt(config.get('startup.render.fps'), 10) || 60,
			fpsRendering: 0,
			estimateGroundPlane: !!config.get('annotator.add_points_to_estimated_ground_plane'),
			tileGroundPlaneScale: 1.05,
			generateVoxelsOnPointLoad: !!config.get('annotator.generate_voxels_on_point_load'),
			drawBoundingBox: !!config.get('annotator.draw_bounding_box'),
			enableTileManagerStats: !!config.get('tile_manager.stats_display.enable'),
			superTileBboxMaterial: new THREE.MeshBasicMaterial({color: 0x774400, wireframe: true}),
			superTileBboxColor: new THREE.Color(0xff0000),
			aoiBboxColor: new THREE.Color(0x00ff00),
			aoiFullSize: new THREE.Vector3(30, 30, 30),
			aoiHalfSize: new THREE.Vector3(15, 15, 15),
			timeBetweenErrorDialogsMs: 30000,
			timeToDisplayHealthyStatusMs: 10000,
		}
		const aoiSize: [number, number, number] = config.get('annotator.area_of_interest.size')
		if (isTupleOfNumbers(aoiSize, 3)) {
			this.settings.aoiFullSize = new THREE.Vector3(aoiSize[0], aoiSize[1], aoiSize[2])
			this.settings.aoiHalfSize = this.settings.aoiFullSize.clone().divideScalar(2)
		} else if (aoiSize) {
			log.warn(`invalid annotator.area_of_interest.size config: ${aoiSize}`)
		}
		this.settings.fpsRendering = this.settings.defaultFpsRendering
		this.uiState = {
			modelVisibility: ModelVisibility.ALL_VISIBLE,
			lockBoundaries: false,
			lockLanes: false,
			isSuperTilesVisible: true,
			isPointCloudVisible: true,
			isAnnotationsVisible: true,
			isControlKeyPressed: false,
			isShiftKeyPressed: false,
			isAddMarkerKeyPressed: false,
			isAddConnectionKeyPressed: false,
			isMouseButtonPressed: false,
			numberKeyPressed: null,
			isLiveMode: false,
			isKioskMode: !!config.get('startup.kiosk_mode'),
			lastPointCloudLoadedErrorModalMs: 0,
			lastCameraCenterPoint: null,
		}
		this.aoiState = {
			enabled: !!config.get('annotator.area_of_interest.enable'),
			focalPoint: null,
			boundingBoxes: [],
			currentHeading: null,
		}
		this.statusWindow = new StatusWindowController()
		this.hovered = null
		this.raycasterPlane = new THREE.Raycaster()
		this.raycasterPlane.params.Points!.threshold = 0.1
		this.raycasterMarker = new THREE.Raycaster()
		this.raycasterSuperTiles = new THREE.Raycaster()
		this.raycasterAnnotation = new THREE.Raycaster()
		// Initialize super tile that will load the point clouds
		this.tileManager = new TileManager(
			this.settings.generateVoxelsOnPointLoad,
			this.onSuperTileLoad,
			this.onSuperTileUnload,
			this.onTileServiceStatusUpdate
		)
		this.pendingSuperTileBoxes = []
		this.highlightedSuperTileBox = null
		this.superTileGroundPlanes = Map()
		this.allGroundPlanes = []
		this.pointCloudBoundingBox = null
		this.locationServerStatusClient = new LocationServerStatusClient(this.onLocationServerStatusUpdate)

		this.flyThroughSettings = {
			enabled: false,
			startPoseIndex: 0,
			endPoseIndex: 0,
			currentPoseIndex: 0,
		}
		this.liveModeSettings = {
			carModelMaterial: new THREE.MeshPhongMaterial({
				color: 0x002233,
				specular: 0x222222,
				shininess: 0,
			}),
			cameraOffset: new THREE.Vector3(30, 10, 0),
			cameraOffsetDelta: 1,
			fps: parseFloat(config.get('fly_through.render.fps')) || 10
		}

		const watchForRebuilds: boolean = config.get('startup.watch_for_rebuilds.enable') || false
		if (watchForRebuilds) {
			// Watch for rebuilds and exit if we get rebuilt.
			// This relies on a script or something else to restart after we exit
			const self = this
			watch.createMonitor(
				'/tmp',
				{
					filter: function (f): boolean {
						return f === '/tmp/visualizer-rebuilt.flag'
					}
				},
				function (monitor): void {
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

	exitApp(): void {
		const remote = require('electron').remote
		let w = remote.getCurrentWindow()
		w.close()
	}

	/**
	 * Create the 3D Scene and add some basic objects. It also initializes
	 * several event listeners.
	 */
	initScene(): Promise<void> {
		const self = this
		log.info(`Building scene`)

		const [width, height]: Array<number> = this.getContainerSize()

		this.perspectiveCamera = new THREE.PerspectiveCamera(70, width / height, 0.1, 10000)
		this.orthographicCamera = new THREE.OrthographicCamera(1, 1, 1, 1, 0, 1000)
		this.setOrthographicCameraDimensions(width, height)

		// Create scene and camera
		this.scene = new THREE.Scene()
		if (this.storage.getItem(preferenceKey.cameraPreference, cameraTypeString.perspective) === cameraTypeString.orthographic)
			this.camera = this.orthographicCamera
		else
			this.camera = this.perspectiveCamera

		// Add some lights
		this.scene.add(new THREE.AmbientLight(0xf0f0f0))
		this.light = new THREE.SpotLight(0xffffff, 1.5)
		this.light.castShadow = true
		this.light.shadow = new THREE.SpotLightShadow(new THREE.PerspectiveCamera(70, 1, 200, 2000))
		this.light.shadow.mapSize.width = 1024
		this.light.shadow.bias = -0.000222
		this.light.shadow.mapSize.height = 1024
		this.scene.add(this.light)

		// Add a "ground plane" to facilitate annotations
		const planeGeometry = new THREE.PlaneGeometry(2000, 2000)
		planeGeometry.rotateX(-Math.PI / 2)
		const planeMaterial = new THREE.ShadowMaterial()
		this.plane = new THREE.Mesh(planeGeometry, planeMaterial)
		this.scene.add(this.plane)

		// Add grid on top of the plane
		this.grid = new THREE.GridHelper(200, 100)
		this.grid.material.opacity = 0.25
		this.grid.material.transparent = true
		this.scene.add(this.grid)

		const axesHelperLength = parseFloat(config.get('annotator.axes_helper_length')) || 0
		if (axesHelperLength > 0) {
			this.axis = AxesHelper(axesHelperLength)
			this.scene.add(this.axis)
		} else
			this.axis = null

		const compassRoseLength = parseFloat(config.get('annotator.compass_rose_length')) || 0
		if (compassRoseLength > 0) {
			this.compassRose = CompassRose(compassRoseLength)
			this.compassRose.rotateX(Math.PI / -2)
			this.scene.add(this.compassRose)
		} else
			this.compassRose = null

		// Init empty annotation. This will have to be changed
		// to work in response to a menu, panel or keyboard event.
		this.annotationManager = new AnnotationManager(this.scene)

		// Create GL Renderer
		this.renderer = new THREE.WebGLRenderer({antialias: true})
		this.renderer.setClearColor(new THREE.Color(this.settings.background))
		this.renderer.setPixelRatio(window.devicePixelRatio)
		this.renderer.setSize(width, height)
		this.renderer.shadowMap.enabled = true
		root.append(this.renderer.domElement)

		// Create stats widget to display frequency of rendering
		if (config.get('startup.show_stats_module')) {
			this.stats = new statsModule()
			root.append(this.stats.dom)
		}

		// Give the status window a place to draw in.
		const statusElementId = 'status_window'
		const elem = document.getElementById(statusElementId)
		if (elem)
			this.statusWindow
				.setContainer(elem)
				.setEnabled(!!config.get('startup.show_status_panel'))
		else
			log.warn('missing element ' + statusElementId)

		// Initialize all control objects.
		this.initOrbitControls()
		this.initTransformControls()

		// Move everything into position.
		this.setStage(0, 0, 0)

		// Add panel to change the settings
		if (config.get('startup.show_color_picker')) {
			this.gui = new datModule.GUI()
			this.gui.addColor(this.settings, 'background').onChange((value: any) => {
				this.renderer.setClearColor(new THREE.Color(value))
			})
			this.gui.add(this.uiState, 'lockBoundaries').onChange((value: boolean) => {
				if (value && this.annotationManager.activeAnnotation instanceof Boundary)
					this.annotationManager.unsetActiveAnnotation()
			})
			this.gui.add(this.uiState, 'lockLanes').onChange((value: boolean) => {
				if (value && this.annotationManager.activeAnnotation instanceof Lane)
					this.annotationManager.unsetActiveAnnotation()
			})
			this.gui.domElement.className = 'threeJs_gui'
		}

		// Set up for auto-save
		const body = $(document.body)
		body.focusin((): void => {
			self.annotationManager.enableAutoSave()
		})
		body.focusout((): void => {
			self.annotationManager.disableAutoSave()
		})

		// Add listeners
		window.addEventListener('beforeunload', this.onBeforeUnload)
		window.addEventListener('resize', this.onWindowResize)
		window.addEventListener('keydown', this.onKeyDown)
		window.addEventListener('keyup', this.onKeyUp)

		this.renderer.domElement.addEventListener('mousemove', this.checkForActiveMarker)
		this.renderer.domElement.addEventListener('mousemove', this.checkForSuperTileSelection)
		this.renderer.domElement.addEventListener('mouseup', this.checkForAnnotationSelection)
		this.renderer.domElement.addEventListener('mouseup', this.addAnnotationMarker)
		this.renderer.domElement.addEventListener('mouseup', this.addLaneConnection)
		this.renderer.domElement.addEventListener('mouseup', () => {this.uiState.isMouseButtonPressed = false})
		this.renderer.domElement.addEventListener('mousedown', () => {this.uiState.isMouseButtonPressed = true})
		this.renderer.domElement.addEventListener('click', this.clickSuperTileBox)

		// Bind events
		if (!this.uiState.isKioskMode)
			this.bind()
		Annotator.deactivateLaneProp()
		Annotator.deactivateBoundaryProp()
		Annotator.deactivateTrafficSignProp()

		this.displayMenu(
			config.get('startup.show_menu') && !this.uiState.isKioskMode
				? MenuVisibility.SHOW
				: MenuVisibility.HIDE
		)

		return this.loadCarModel()
			.then(() => this.loadUserData())
			.then(() => {
				if (this.uiState.isKioskMode) this.toggleListen()
				// Initialize socket for use when "live mode" operation is on
				this.initClient()
			})
	}

	// Load up any data which configuration has asked for on start-up.
	private loadUserData(): Promise<void> {
		const annotationsPath = config.get('startup.annotations_path')
		let annotationsResult: Promise<void>
		if (annotationsPath) {
			log.info('loading pre-configured annotations ' + annotationsPath)
			annotationsResult = this.loadAnnotations(annotationsPath)
		} else {
			annotationsResult = Promise.resolve()
		}

		const pointCloudDir: string = config.get('startup.point_cloud_directory')
		const pointCloudBbox: [number, number, number, number, number, number] = config.get('startup.point_cloud_bounding_box')
		let pointCloudResult: Promise<void>
		if (pointCloudDir) {
			if (pointCloudBbox)
				log.warn(`don't set startup.point_cloud_directory and startup.point_cloud_bounding_box config options at the same time`)
			pointCloudResult = annotationsResult
				.then(() => {
					log.info('loading pre-configured data set ' + pointCloudDir)
					return this.loadPointCloudDataFromDirectory(pointCloudDir)
				})
		} else if (pointCloudBbox) {
			pointCloudResult = annotationsResult
				.then(() => {
					log.info('loading pre-configured bounding box ' + pointCloudBbox)
					return this.loadPointCloudDataFromConfigBoundingBox(pointCloudBbox)
				})
		} else {
			pointCloudResult = annotationsResult
		}

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
					return this.loadFlyThroughTrajectories(trajectoryPaths)
				})
		} else {
			trajectoryResult = pointCloudResult
		}

		return trajectoryResult
	}

	/**
	 * Start THREE.js rendering loop.
	 */
	animate = (): void => {
		setTimeout(() => {
			requestAnimationFrame(this.animate)
		}, 1000 / this.settings.fpsRendering)

		if (this.aoiState.enabled)
			this.updatePointCloudAoi()
		this.render()
		if (this.stats) this.stats.update()
		this.orbitControls.update()
		this.transformControls.update()
	}

	private loadFlyThroughTrajectories(paths: string[]): Promise<void> {
		return Promise.all(paths.map(path => AsyncFile.readFile(path)))
			.then(buffers => {
				this.flyThroughTrajectoryPoses = []
				buffers.forEach(buffer => {
					const msg = Models.TrajectoryMessage.decode(buffer)
					const poses = msg.states
						.filter(state =>
							state && state.pose
							&& state.pose.x !== null && state.pose.y !== null && state.pose.z !== null
							&& state.pose.q0 !== null && state.pose.q1 !== null && state.pose.q2 !== null && state.pose.q3 !== null
						)
						.map(state => state.pose! as Models.PoseMessage)
					this.flyThroughTrajectoryPoses = this.flyThroughTrajectoryPoses.concat(poses)
				})
				if (this.flyThroughTrajectoryPoses.length) {
					this.flyThroughSettings.endPoseIndex = this.flyThroughTrajectoryPoses.length
					this.flyThroughSettings.enabled = true
					log.info(`loaded ${this.flyThroughSettings.endPoseIndex} trajectory poses`)
				} else {
					throw Error('failed to load trajectory poses')
				}
			})
			.catch(err => {
				log.error(err.message)
				dialog.showErrorBox('Fly-through Load Error', err.message)
			})
	}

	// Move the camera and the car model through poses loaded from a file on disk.
	// See also initClient().
	private runFlythrough(): void {
		if (!this.uiState.isLiveMode) return
		if (!this.flyThroughSettings.enabled) return

		setTimeout(() => {
			this.runFlythrough()
		}, 1000 / this.liveModeSettings.fps)

		if (this.flyThroughSettings.currentPoseIndex >= this.flyThroughSettings.endPoseIndex)
			this.flyThroughSettings.currentPoseIndex = this.flyThroughSettings.startPoseIndex
		const pose = this.flyThroughTrajectoryPoses[this.flyThroughSettings.currentPoseIndex]
		this.statusWindow.setMessage(statusKey.flyThrough, `Pose ${this.flyThroughSettings.currentPoseIndex + 1} of ${this.flyThroughSettings.endPoseIndex}`)

		this.updateCarWithPose(pose)

		this.flyThroughSettings.currentPoseIndex++
	}

	/**
	 * Render the THREE.js scene from the camera's position.
	 */
	private render = (): void => {
		this.renderer.render(this.scene, this.camera)
	}

	/**
	 * Move all visible elements into position, centered on a coordinate.
	 */
	private setStage(x: number, y: number, z: number, resetCamera: boolean = true): void {
		this.plane.geometry.center()
		this.plane.geometry.translate(x, y, z)
		this.grid.geometry.center()
		this.grid.geometry.translate(x, y, z)
		if (resetCamera) {
			this.light.position.set(x + this.settings.lightOffset.x, y + this.settings.lightOffset.y, z + this.settings.lightOffset.z)
			this.camera.position.set(x + this.settings.cameraOffset.x, y + this.settings.cameraOffset.y, z + this.settings.cameraOffset.z)
			this.orbitControls.target.set(x, y, z)
		}
	}

	/**
	 * Set some point as the center of the visible world.
	 */
	private setStageByVector(point: THREE.Vector3, resetCamera: boolean = true): void {
		this.setStage(point.x, point.y, point.z, resetCamera)
	}

	/**
	 * Set the stage at the bottom center of TileManager's point cloud.
	 */
	private setStageByPointCloud(resetCamera: boolean): void {
		const focalPoint = this.tileManager.centerPoint()
		if (focalPoint)
			this.setStageByVector(focalPoint, resetCamera)
	}

	/**
	 * 	Display the compass rose just outside the bounding box of the point cloud.
	 */
	private setCompassRoseByPointCloud(): void {
		if (!this.compassRose) return
		const boundingBox = this.tileManager.getPointCloudBoundingBox()
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
	private focusOnPointCloud(): void {
		const center = this.tileManager.centerPoint()
		if (center) {
			this.orbitControls.target.set(center.x, center.y, center.z)
			this.displayCameraInfo()
		} else {
			log.warn('point cloud has not been initialized')
		}
	}

	/**
	 * 	Set the camera directly above the current target, looking down.
	 */
	private resetTiltAndCompass(): void {
		const distanceCameraToTarget = this.camera.position.distanceTo(this.orbitControls.target)
		this.camera.position.x = this.orbitControls.target.x
		this.camera.position.y = this.orbitControls.target.y + distanceCameraToTarget
		this.camera.position.z = this.orbitControls.target.z
	}

	// Given a path to a directory that contains point cloud tiles, load them and add them to the scene.
	private loadPointCloudDataFromDirectory(pathToTiles: string): Promise<void> {
		log.info('loadPointCloudDataFromDirectory')
		return this.tileManager.loadFromDirectory(pathToTiles, CoordinateFrameType.STANDARD)
			.then(loaded => {if (loaded) this.pointCloudLoadedSideEffects()})
			.catch(err => this.pointCloudLoadedError(err))
	}

	// Load tiles within a bounding box and add them to the scene.
	private loadPointCloudDataFromConfigBoundingBox(bbox: number[]): Promise<void> {
		if (!isTupleOfNumbers(bbox, 6)) {
			this.pointCloudLoadedError(Error('invalid point cloud bounding box config'))
			return Promise.resolve()
		} else {
			const p1 = new THREE.Vector3(bbox[0], bbox[1], bbox[2])
			const p2 = new THREE.Vector3(bbox[3], bbox[4], bbox[5])
			return this.loadPointCloudDataFromMapServer([{minPoint: p1, maxPoint: p2}])
		}
	}

	// Load tiles within a bounding box and add them to the scene.
	private loadPointCloudDataFromMapServer(searches: RangeSearch[], loadAllPoints: boolean = false, resetCamera: boolean = true): Promise<void> {
		return this.tileManager.loadFromMapServer(searches, CoordinateFrameType.STANDARD, loadAllPoints)
			.then(loaded => {if (loaded) this.pointCloudLoadedSideEffects(resetCamera)})
			.catch(err => this.pointCloudLoadedError(err))
	}

	// Do some house keeping after loading a point cloud, such as drawing decorations
	// and centering the stage and the camera on the point cloud.
	private pointCloudLoadedSideEffects(resetCamera: boolean = true): void {
		if (!this.annotationManager.setOriginWithInterface(this.tileManager))
			log.warn(`annotations origin ${this.annotationManager.getOrigin()} does not match tile's origin ${this.tileManager.getOrigin()}`)

		if (!this.uiState.isPointCloudVisible)
			this.setModelVisibility(ModelVisibility.ALL_VISIBLE)

		if (this.settings.generateVoxelsOnPointLoad) {
			this.computeVoxelsHeights() // This is based on pre-loaded annotations
			this.tileManager.generateVoxels()
		}

		this.renderEmptySuperTiles()
		this.updatePointCloudBoundingBox()
		this.setCompassRoseByPointCloud()
		this.setStageByPointCloud(resetCamera)
	}

	private pointCloudLoadedError(err: Error): void {
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
				dialog.showErrorBox('Point Cloud Load Error', err.message)
				this.uiState.lastPointCloudLoadedErrorModalMs = now
			}
		}
	}

	/**
	 * 	Compute corresponding height for each voxel based on near by annotations
	 */
	private computeVoxelsHeights(): void {
		if (this.annotationManager.laneAnnotations.length === 0)
			log.error(`Unable to compute voxels height, there are no annotations.`)

		const voxels: Set<THREE.Vector3> = this.tileManager.voxelsDictionary
		const voxelSize: number = this.tileManager.voxelsConfig.voxelSize
		const annotationCutoffDistance: number = 1.2 * 1.2 // 1.2 meters radius
		this.tileManager.voxelsHeight = []
		for (let voxel of voxels) {
			let x: number = voxel.x * voxelSize
			let y: number = voxel.y * voxelSize
			let z: number = voxel.z * voxelSize
			let minDistance: number = Number.MAX_VALUE
			let minDistanceHeight: number = y   // in case there is no annotation close enough
                                                // these voxels will be all colored the same
			for (let annotation of this.annotationManager.laneAnnotations) {
				for (let wayPoint of annotation.denseWaypoints) {
					let dx: number = wayPoint.x - x
					let dz: number = wayPoint.z - z
					let distance = dx * dx + dz * dz
					if (distance < minDistance) {
						minDistance = distance
						minDistanceHeight = wayPoint.y
					}
					if (minDistance < annotationCutoffDistance) {
						break
					}
				}
				if (minDistance < annotationCutoffDistance) {
					break
				}
			}
			let height: number = y - minDistanceHeight
			// TODO: Remove this voxel filtering. For CES only
			if (height < 2.0 && minDistance < annotationCutoffDistance) {
				this.tileManager.voxelsHeight.push(-1)
			} else {
				this.tileManager.voxelsHeight.push(height)
			}
		}
	}

	/**
	 * 	Incrementally load the point cloud for a single super tile.
	 */
	private loadSuperTileData(superTile: SuperTile): Promise<void> {
		if (!this.uiState.isPointCloudVisible)
			this.setModelVisibility(ModelVisibility.ALL_VISIBLE)
		return this.tileManager.loadFromSuperTile(superTile)
			.then(() => {
				this.updatePointCloudBoundingBox()
				this.setCompassRoseByPointCloud()
				this.setStageByPointCloud(false)
			})
	}

	private loadAllSuperTileData(): void {
		if (this.uiState.isLiveMode) return

		log.info('loading all super tiles')
		const promises = this.pendingSuperTileBoxes.map(box =>
			this.loadSuperTileData(box.userData as SuperTile)
		)
		Promise.all(promises)
			.then(() => {
				this.unHighlightSuperTileBox()
				this.pendingSuperTileBoxes.forEach(box => this.scene.remove(box))
				this.pendingSuperTileBoxes = []
			})
	}

	private unloadPointCloudData(): void {
		log.info("unloadPointCloudData")
		if (this.tileManager.unloadAllPoints()) {
			this.unHighlightSuperTileBox()
			this.pendingSuperTileBoxes.forEach(box => this.scene.remove(box))
			if (this.pointCloudBoundingBox)
				this.scene.remove(this.pointCloudBoundingBox)
		} else {
			log.warn('unloadPointCloudData failed')
		}
	}

	/**
	 * 	Display a bounding box for each super tile that exists but doesn't have points loaded in memory.
	 */
	private renderEmptySuperTiles(): void {
		this.tileManager.superTiles.forEach(st => this.superTileToBoundingBox(st!))

		if (this.uiState.isLiveMode)
			this.hideSuperTiles()
	}

	// When TileManager loads a super tile, update Annotator's parallel data structure.
	private onSuperTileLoad: (superTile: SuperTile) => void =
		(superTile: SuperTile) => {
			this.loadTileGroundPlanes(superTile)
			this.updateTileManagerStats()

			if (superTile.pointCloud)
				this.scene.add(superTile.pointCloud)
			else
				log.error('onSuperTileLoad() got a super tile with no point cloud')
		}

	// When TileManager unloads a super tile, update Annotator's parallel data structure.
	private onSuperTileUnload: (superTile: SuperTile, action: SuperTileUnloadAction) => void =
		(superTile: SuperTile, action: SuperTileUnloadAction) => {
			this.unloadTileGroundPlanes(superTile)
			this.updateTileManagerStats()

			if (superTile.pointCloud)
				this.scene.remove(superTile.pointCloud)
			else
				log.error('onSuperTileUnload() got a super tile with no point cloud')

			switch (action) {
				case SuperTileUnloadAction.Unload:
					this.superTileToBoundingBox(superTile)
					break
				case SuperTileUnloadAction.Delete:
					const name = superTile.key()
					this.pendingSuperTileBoxes = this.pendingSuperTileBoxes.filter(bbox => bbox.name !== name)
					if (this.highlightedSuperTileBox && this.highlightedSuperTileBox.name === name)
						this.unHighlightSuperTileBox()
					break
				default:
					log.error('unknown SuperTileUnloadAction: ' + action)
			}
		}

	// Construct a set of 2D planes, each of which approximates the ground plane within a tile.
	// This assumes that each ground plane is locally flat and normal to gravity.
	// This assumes that the ground planes in neighboring tiles are close enough that the discrete
	// jumps between them won't matter much.
	private loadTileGroundPlanes(superTile: SuperTile): void {
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
				const origin = this.tileManager.utmVectorToThreeJs(tile.index.origin)
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

	private unloadTileGroundPlanes(superTile: SuperTile): void {
		if (!this.superTileGroundPlanes.has(superTile.key())) return

		const groundPlanes = this.superTileGroundPlanes.get(superTile.key())!

		this.superTileGroundPlanes = this.superTileGroundPlanes.remove(superTile.key())
		this.allGroundPlanes = lodash.flatten(this.superTileGroundPlanes.valueSeq().toArray())
		groundPlanes.forEach(plane => this.scene.remove(plane))
	}

	private superTileToBoundingBox(superTile: SuperTile): void {
		if (!superTile.pointCloud) {
			const size = getSize(superTile.threeJsBoundingBox)
			const center = getCenter(superTile.threeJsBoundingBox)
			const geometry = new THREE.BoxGeometry(size.x, size.y, size.z)
			const box = new THREE.Mesh(geometry, this.settings.superTileBboxMaterial.clone())
			box.geometry.translate(center.x, center.y, center.z)
			box.userData = superTile
			box.name = superTile.key()
			this.scene.add(box)
			this.pendingSuperTileBoxes.push(box)
		}
	}

	private hideSuperTiles(): void {
		this.unHighlightSuperTileBox()
		this.pendingSuperTileBoxes.forEach(box => (box.material as THREE.MeshBasicMaterial).visible = false)
		this.uiState.isSuperTilesVisible = false
	}

	private showSuperTiles(): void {
		this.pendingSuperTileBoxes.forEach(box => (box.material as THREE.MeshBasicMaterial).visible = true)
		this.uiState.isSuperTilesVisible = true
	}

	/**
	 * 	Draw a box around the data. Useful for debugging.
	 */
	private updatePointCloudBoundingBox(): void {
		if (this.settings.drawBoundingBox) {
			if (this.pointCloudBoundingBox) {
				this.scene.remove(this.pointCloudBoundingBox)
				this.pointCloudBoundingBox = null
			}

			const bbox = this.tileManager.getPointCloudBoundingBox()
			if (bbox) {
				// BoxHelper wants an Object3D, but a three.js bounding box is a Box3, which is not an Object3D.
				// Maybe BoxHelper isn't so helpful after all. But guess what? It will take a Box3 anyway and
				// do the right thing with it.
				// tslint:disable-next-line:no-any
				this.pointCloudBoundingBox = new THREE.BoxHelper(bbox as any, this.settings.superTileBboxColor)
				this.scene.add(this.pointCloudBoundingBox)
			}
		}
	}

	// Find the point in the scene that is most interesting to a human user.
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
		// The only use of Control at the moment is to enable model rotation in OrbitControls. Updating AOI is useful
		// mainly while panning across the model. Disable it during rotation for better rendering performance.
		if (this.uiState.isControlKeyPressed) return
		if (this.uiState.modelVisibility === ModelVisibility.HIDE_SUPER_TILES_AND_POINT_CLOUD) return

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

			this.loadPointCloudDataFromMapServer(
				threeJsSearches.map(threeJs => {
					return {
						minPoint: this.tileManager.threeJsToUtm(threeJs.minPoint),
						maxPoint: this.tileManager.threeJsToUtm(threeJs.maxPoint),
					}
				}),
				true,
				false
			)
				.catch(err => {log.warn(err.message)})
		}
	}

	// Display some info in the UI about where the camera is pointed.
	private displayCameraInfo = (): void => {
		if (this.uiState.isLiveMode) return
		if (!this.statusWindow.isEnabled()) return

		const currentPoint = this.currentPointOfInterest()
		if (currentPoint) {
			const oldPoint = this.uiState.lastCameraCenterPoint
			const newPoint = currentPoint.clone().round()
			const samePoint = oldPoint && oldPoint.x === newPoint.x && oldPoint.y === newPoint.y && oldPoint.z === newPoint.z
			if (!samePoint) {
				this.uiState.lastCameraCenterPoint = newPoint
				const utm = this.tileManager.threeJsToUtm(newPoint)
				this.updateCurrentLocationStatusMessage(utm)
			}
		}
	}

	/**
	 * Load annotations from file. Add all annotations to the annotation manager
	 * and to the scene.
	 * Center the stage and the camera on the annotations model.
	 */
	private loadAnnotations(fileName: string): Promise<void> {
		log.info('Loading annotations')
		if (!this.uiState.isAnnotationsVisible)
			this.setModelVisibility(ModelVisibility.ALL_VISIBLE)
		return this.annotationManager.loadAnnotationsFromFile(fileName)
			.then(focalPoint => {
				if (!this.tileManager.setOriginWithInterface(this.annotationManager))
					log.warn(`annotations origin ${this.annotationManager.getOrigin()} does not match tiles origin ${this.tileManager.getOrigin()}`)
				if (focalPoint)
					this.setStageByVector(focalPoint)
			})
			.catch(err => {
				log.error(err.message)
				dialog.showErrorBox('Annotation Load Error', err.message)
			})
	}

	private getMouseCoordinates = (event: MouseEvent): THREE.Vector2 => {
		const mouse = new THREE.Vector2()
		mouse.x = ( event.clientX / this.renderer.domElement.clientWidth ) * 2 - 1
		mouse.y = -( event.clientY / this.renderer.domElement.clientHeight ) * 2 + 1
		return mouse
	}

	/**
	 * Create a new lane annotation.
	 */
	private addLaneAnnotation(): boolean {
		// Can't create a new lane if the current active annotation doesn't have any markers (because if we did
		// that annotation wouldn't be selectable and it would be lost)
		if (this.annotationManager.activeAnnotation &&
			!this.annotationManager.activeAnnotation.isValid()) {
			return false
		}
		// This creates a new lane and add it to the scene for display
		return this.annotationManager.changeActiveAnnotation(
			this.annotationManager.addLaneAnnotation()
		)
	}

	private addBoundaryAnnotation(): boolean {
		// Can't create a new boundary if the current active annotation doesn't have any markers (because if we did
		// that annotation wouldn't be selectable and it would be lost)
		if (this.annotationManager.activeAnnotation &&
			!this.annotationManager.activeAnnotation.isValid()) {
			return false
		}
		// This creates a new lane and add it to the scene for display
		return this.annotationManager.changeActiveAnnotation(
			this.annotationManager.addBoundaryAnnotation()
		)
	}

	private addTrafficSignAnnotation(): boolean {
		// Can't create a new lane if the current active annotation doesn't have any markers (because if we did
		// that annotation wouldn't be selectable and it would be lost)
		if (this.annotationManager.activeAnnotation &&
			!this.annotationManager.activeAnnotation.isValid()) {
			return false
		}
		return this.annotationManager.changeActiveAnnotation(
			this.annotationManager.addTrafficSignAnnotation()
		)
	}

	/**
	 * If the mouse was clicked while pressing the "a" key, drop an annotation marker.
	 */
	private addAnnotationMarker = (event: MouseEvent): void => {
		if (!this.uiState.isAddMarkerKeyPressed) return
		if (!this.annotationManager.activeAnnotation) return

		const mouse = this.getMouseCoordinates(event)

		// If the click intersects the first marker of a ring-shaped annotation, close the annotation and return.
		if (this.annotationManager.activeAnnotation.markersFormRing) {
			this.raycasterMarker.setFromCamera(mouse, this.camera)
			const markers = this.annotationManager.activeMarkers()
			if (markers.length && this.raycasterMarker.intersectObject(markers[0]).length) {
				if (this.annotationManager.completeActiveAnnotation())
					this.annotationManager.unsetActiveAnnotation()
				return
			}
		}

		this.raycasterPlane.setFromCamera(mouse, this.camera)
		let intersections: THREE.Intersection[]

		// Find a 3D point where to place the new marker.
		if (this.annotationManager.activeAnnotation.snapToGround)
			intersections = this.intersectWithGround(this.raycasterPlane)
		else
			intersections = this.intersectWithPointCloud(this.raycasterPlane)

		if (intersections.length) {
			const firstPoint = intersections[0].point
			if (this.annotationManager.getActiveLaneAnnotation())
				this.annotationManager.addLaneMarker(firstPoint)
			else if (this.annotationManager.getActiveBoundaryAnnotation())
				this.annotationManager.addBoundaryMarker(firstPoint)
			else if (this.annotationManager.getActiveTrafficSignAnnotation())
				this.annotationManager.addTrafficSignMarker(firstPoint)
		}
	}

	/**
	 * If the mouse was clicked while pressing the "c" key, add new lane connection
	 * between current active lane and the "clicked" lane
	 */
	private addLaneConnection = (event: MouseEvent): void => {
		if (!this.uiState.isAddConnectionKeyPressed) return
		// reject connection if active annotation is not a lane
		const activeLane = this.annotationManager.getActiveLaneAnnotation()
		if (!activeLane) {
			log.info("No lane annotation is active.")
			return
		}

		// get clicked object
		const mouse = this.getMouseCoordinates(event)
		this.raycasterAnnotation.setFromCamera(mouse, this.camera)
		const intersects = this.raycasterAnnotation.intersectObjects(this.annotationManager.annotationObjects, true)
		if (intersects.length === 0) {
			return
		}
		const object = intersects[0].object.parent

		// check if clicked object is an inactive lane
		const inactive = this.annotationManager.checkForInactiveAnnotation(object as THREE.Object3D)
		if (!(inactive && inactive instanceof Lane)) {
			log.warn(`Clicked object is not an inactive lane.`)
			return
		}

		// fine lane order based on distances between end points: active --> inactive lane or inactive --> active lane
		const inactiveToActive = inactive.markers[inactive.markers.length - 1].position.distanceTo(activeLane.markers[0].position)
		const activeToInactive = activeLane.markers[activeLane.markers.length - 1].position.distanceTo(inactive.markers[0].position)

		const fromUID = activeToInactive < inactiveToActive ? activeLane.id : inactive.id
		const toUID = activeToInactive < inactiveToActive ? inactive.id : activeLane.id

		// add connection
		if (!this.annotationManager.addRelation(fromUID, toUID, 'front')) {
			log.warn(`Lane connection failed.`)
			return
		}

		// update UI panel
		if (activeLane.id === fromUID)
			Annotator.deactivateFrontSideNeighbours()
	}

	private isAnnotationLocked(annotation: Annotation): boolean {
		if (annotation instanceof Lane && this.uiState.lockLanes)
			return true
		if (annotation instanceof Boundary && this.uiState.lockBoundaries)
			return true
		return false
	}

	/**
	 * Check if we clicked an annotation. If so, make it active for editing
	 */
	private checkForAnnotationSelection = (event: MouseEvent): void => {
		if (this.uiState.isLiveMode) return
		if (this.uiState.isControlKeyPressed) return
		if (this.uiState.isAddMarkerKeyPressed) return
		if (this.uiState.isAddConnectionKeyPressed) return

		const mouse = this.getMouseCoordinates(event)
		this.raycasterAnnotation.setFromCamera(mouse, this.camera)
		const intersects = this.raycasterAnnotation.intersectObjects(this.annotationManager.annotationObjects, true)

		if (intersects.length > 0) {
			const object = intersects[0].object.parent
			const inactive = this.annotationManager.checkForInactiveAnnotation(object as THREE.Object3D)

			// We clicked an inactive annotation, make it active
			if (inactive) {
				if (this.isAnnotationLocked(inactive))
					return

				this.cleanTransformControls()
				this.annotationManager.changeActiveAnnotation(inactive)
				if (inactive instanceof Lane)
					this.resetLaneProp()
				else if (inactive instanceof  Boundary)
					this.resetBoundaryProp()
				else if (inactive instanceof TrafficSign)
					this.resetTrafficSignProp()
				else if (inactive instanceof Connection)
					noop() // Connection doesn't have any menus to maintain; this keeps the compiler from complaining.
				else
					log.warn(`unknown annotation type ${inactive}`)
			}
		}
	}

	/**
	 * Check if the mouse is on top of an editable lane marker. If so, attach the
	 * marker to the transform control for editing.
	 */
	private checkForActiveMarker = (event: MouseEvent): void => {
		// If the mouse is down we might be dragging a marker so avoid
		// picking another marker
		if (this.uiState.isMouseButtonPressed) return
		if (this.uiState.isControlKeyPressed) return
		if (this.uiState.isAddMarkerKeyPressed) return
		if (this.uiState.isAddConnectionKeyPressed) return

		const mouse = this.getMouseCoordinates(event)
		this.raycasterMarker.setFromCamera(mouse, this.camera)
		const intersects = this.raycasterMarker.intersectObjects(this.annotationManager.activeMarkers())

		if (intersects.length > 0) {
			const marker = intersects[0].object as THREE.Mesh
			if (this.hovered !== marker) {
				this.cleanTransformControls()

				let moveableMarkers: Array<THREE.Mesh>
				if (this.uiState.numberKeyPressed === null) {
					moveableMarkers = [marker]
				} else {
					const neighbors = this.annotationManager.neighboringLaneMarkers(marker, this.uiState.numberKeyPressed)
					this.annotationManager.highlightMarkers(neighbors)
					neighbors.unshift(marker)
					moveableMarkers = neighbors
				}

				this.renderer.domElement.style.cursor = 'pointer'
				this.hovered = marker
				// HOVER ON
				this.transformControls.attach(moveableMarkers)
				this.cancelHideTransform()
			}
		} else {
			if (this.hovered !== null) {
				// HOVER OFF
				this.renderer.domElement.style.cursor = 'auto'
				this.hovered = null
				this.delayHideTransform()
			}
		}
	}

	// Unselect whatever is selected in the UI:
	//  - an active control point
	//  - a selected annotation
	private escapeSelection(): void {
		if (this.transformControls.isAttached())
			this.cleanTransformControls()
		else if (this.annotationManager.activeAnnotation)
			this.annotationManager.unsetActiveAnnotation()
	}

	private intersectWithGround(raycaster: THREE.Raycaster): THREE.Intersection[] {
		let intersections: THREE.Intersection[]
		if (this.settings.estimateGroundPlane || !this.tileManager.pointCount()) {
			if (this.allGroundPlanes.length)
				intersections = raycaster.intersectObjects(this.allGroundPlanes)
			else
				intersections = raycaster.intersectObject(this.plane)
		} else {
			intersections = raycaster.intersectObjects(this.tileManager.getPointClouds())
		}
		return intersections
	}

	private intersectWithPointCloud(raycaster: THREE.Raycaster): THREE.Intersection[] {
		return raycaster.intersectObjects(this.tileManager.getPointClouds())
	}

	private checkForSuperTileSelection = (event: MouseEvent): void => {
		if (this.uiState.isLiveMode) return
		if (this.uiState.isMouseButtonPressed) return
		if (this.uiState.isAddMarkerKeyPressed) return
		if (this.uiState.isAddConnectionKeyPressed) return
		if (!this.uiState.isSuperTilesVisible) return

		const mouse = this.getMouseCoordinates(event)
		this.raycasterSuperTiles.setFromCamera(mouse, this.camera)
		const intersects = this.raycasterSuperTiles.intersectObjects(this.pendingSuperTileBoxes)

		if (!intersects.length) {
			this.unHighlightSuperTileBox()
		} else {
			const first = intersects[0].object as THREE.Mesh

			if (this.highlightedSuperTileBox && this.highlightedSuperTileBox.id !== first.id)
				this.unHighlightSuperTileBox()

			if (!this.highlightedSuperTileBox)
				this.highlightSuperTileBox(first)
		}
	}

	private clickSuperTileBox = (event: MouseEvent): void => {
		if (this.uiState.isLiveMode) return
		if (!this.highlightedSuperTileBox) return
		if (!this.uiState.isSuperTilesVisible) return

		const mouse = this.getMouseCoordinates(event)
		this.raycasterSuperTiles.setFromCamera(mouse, this.camera)
		const intersects = this.raycasterSuperTiles.intersectObject(this.highlightedSuperTileBox)

		if (intersects.length > 0) {
			const superTile = this.highlightedSuperTileBox.userData as SuperTile
			this.pendingSuperTileBoxes = this.pendingSuperTileBoxes.filter(box => box !== this.highlightedSuperTileBox)
			this.scene.remove(this.highlightedSuperTileBox)
			this.unHighlightSuperTileBox()
			this.loadSuperTileData(superTile).then()
		}
	}

	// Draw the box in a more solid form to indicate that it is active.
	private highlightSuperTileBox(superTileBox: THREE.Mesh): void {
		if (this.uiState.isLiveMode) return
		if (!this.uiState.isShiftKeyPressed) return

		const material = superTileBox.material as THREE.MeshBasicMaterial
		material.wireframe = false
		material.transparent = true
		material.opacity = 0.5
		this.highlightedSuperTileBox = superTileBox
	}

	// Draw the box as a simple wireframe like all the other boxes.
	private unHighlightSuperTileBox(): void {
		if (!this.highlightedSuperTileBox) return

		const material = this.highlightedSuperTileBox.material as THREE.MeshBasicMaterial
		material.wireframe = true
		material.transparent = false
		material.opacity = 1.0
		this.highlightedSuperTileBox = null
	}

	/*
	 * Make a best effort to save annotations before exiting. There is no guarantee the
	 * promise will complete, but it seems to work in practice.
	 */
	private onBeforeUnload: (e: BeforeUnloadEvent) => void = (_: BeforeUnloadEvent) => {
		this.annotationManager.immediateAutoSave().then()
	}

	/**
	 * Get the size of the canvas
	 * @returns {[number,number]}
	 */
	private getContainerSize = (): Array<number> => {
		return getValue(() => [root.width(), root.height()], [0, 0])
	}

	private onWindowResize = (): void => {
		if (!this.camera) {
			return
		}

		const [width, height]: Array<number> = this.getContainerSize()

		this.perspectiveCamera.aspect = width / height
		this.perspectiveCamera.updateProjectionMatrix()

		this.setOrthographicCameraDimensions(width, height)

		this.renderer.setSize(width, height)
	}

	// Scale the ortho camera frustum along with window dimensions to preserve a 1:1
	// proportion for model width:height.
	private setOrthographicCameraDimensions(width: number, height: number): void {
		const orthoWidth = this.settings.orthoCameraHeight * (width / height)
		const orthoHeight = this.settings.orthoCameraHeight
		this.orthographicCamera.left = orthoWidth / -2
		this.orthographicCamera.right = orthoWidth / 2
		this.orthographicCamera.top = orthoHeight / 2
		this.orthographicCamera.bottom = orthoHeight / -2
		this.orthographicCamera.updateProjectionMatrix()
	}

	/**
	 * Handle keyboard events
	 */
	private onKeyDown = (event: KeyboardEvent): void => {
		if (event.defaultPrevented) return

		if (this.uiState.isLiveMode)
			this.onKeyDownLiveMode(event)
		else
			this.onKeyDownInteractiveMode(event)
	}

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

	private onKeyDownInteractiveMode = (event: KeyboardEvent): void => {
		if (event.repeat) {
			noop()
		} else if (event.keyCode >= 49 && event.keyCode <= 57) { // digits 1 to 9
			this.uiState.numberKeyPressed = parseInt(event.key, 10)
		} else {
			switch (event.key) {
				case 'Backspace': {
					this.deleteActiveAnnotation()
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
					this.uiState.isShiftKeyPressed = true
					break
				}
				case 'A': {
					this.annotationManager.immediateAutoSave()
						.then(() => this.annotationManager.unloadAllAnnotations())
					break
				}
				case 'a': {
					this.uiState.isAddMarkerKeyPressed = true
					break
				}
				case 'b': {
					this.addBoundary()
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
				case 'e': {
					this.addRightReverse()
					break
				}
				case 'F': {
					this.reverseLaneDirection()
					break
				}
				case 'f': {
					this.addFront()
					break
				}
				case 'h': {
					this.toggleModelVisibility()
					break
				}
				case 'k': {
					this.addLeftReverse()
					break
				}
				case 'L': {
					this.loadAllSuperTileData()
					break
				}
				case 'l': {
					this.addLeftSame()
					break
				}
				case 'm': {
					this.saveWaypointsKml().then()
					break
				}
				case 'n': {
					this.addLane()
					break
				}
				case 'o': {
					this.toggleListen()
					break
				}
				case 'r': {
					this.addRightSame()
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
				case 't': {
					this.addTrafficSign()
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
				case 'v': {
					this.toggleVoxelsAndPointClouds()
					break
				}
				default:
				// nothing to see here
			}
		}
	}

	private onKeyUp = (): void => {
		this.uiState.isControlKeyPressed = false
		this.uiState.isShiftKeyPressed = false
		this.uiState.isAddMarkerKeyPressed = false
		this.uiState.isAddConnectionKeyPressed = false
		this.uiState.numberKeyPressed = null
	}

	private delayHideTransform = (): void => {
		this.cancelHideTransform()
		this.hideTransform()
	}

	private hideTransform = (): void => {
		this.hideTransformControlTimer = setTimeout(() => this.cleanTransformControls(), 1500)
	}

	private cancelHideTransform = (): void => {
		if (this.hideTransformControlTimer) {
			clearTimeout(this.hideTransformControlTimer)
		}
	}

	private cleanTransformControls = (): void => {
		this.cancelHideTransform()
		this.transformControls.detach()
		this.annotationManager.unhighlightMarkers()
	}

	/**
	 * Create orbit controls which enable translation, rotation and zooming of the scene.
	 */
	private initOrbitControls(): void {
		this.orbitControls = new OrbitControls(this.camera, this.renderer.domElement)
		this.orbitControls.minDistance = -Infinity
		this.orbitControls.keyPanSpeed = 100

		// Add listeners.

		// Render the scene again if we translated, rotated or zoomed.
		this.orbitControls.addEventListener('change', this.render)

		// Update some UI if the camera panned -- that is it moved in relation to the model.
		this.orbitControls.addEventListener('pan', this.displayCameraInfo)

		// If we are controlling the scene don't hide any transform object.
		this.orbitControls.addEventListener('start', this.cancelHideTransform)

		// After the scene transformation is over start the timer to hide the transform object.
		this.orbitControls.addEventListener('end', this.delayHideTransform)
	}

	/**
	 * Create Transform controls object. This allows for the translation of an object in the scene.
	 */
	private initTransformControls(): void {
		this.transformControls = new TransformControls(this.camera, this.renderer.domElement, false)
		this.transformControls.addEventListener('change', this.render)
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

	/**
	 * Functions to bind
	 */
	private deleteActiveAnnotation(): void {
		// Delete annotation from scene
		this.annotationManager.deleteActiveLaneFromPath()
		if (this.annotationManager.deleteActiveAnnotation()) {
			log.info("Deleted selected annotation")
			Annotator.deactivateLaneProp()
			this.hideTransform()
		}
	}

	private addLane(): void {
		// Add lane to scene
		if (this.addLaneAnnotation()) {
			log.info("Added new lane annotation")
			Annotator.deactivateBoundaryProp()
			Annotator.deactivateTrafficSignProp()
			this.resetLaneProp()
			this.hideTransform()
		}
	}

	private addBoundary(): void {
		// Add lane to scene
		if (this.addBoundaryAnnotation()) {
			log.info("Added new boundary annotation")
			Annotator.deactivateLaneProp()
			Annotator.deactivateTrafficSignProp()
			this.resetBoundaryProp()
			this.hideTransform()
		}
	}

	private addTrafficSign(): void {
		// Add lane to scene
		if (this.addTrafficSignAnnotation()) {
			log.info("Added new traffic sign annotation")
			Annotator.deactivateLaneProp()
			Annotator.deactivateBoundaryProp()
			this.resetTrafficSignProp()
			this.hideTransform()
		}
	}

	// Save all annotation data.
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

	// Save lane waypoints only.
	private saveWaypointsKml(): Promise<void> {
		const basePath = config.get('output.annotations.kml.path')
		log.info(`Saving waypoints KML to ${basePath}`)
		return this.annotationManager.saveToKML(basePath)
			.catch(err => log.warn('saveToKML failed: ' + err.message))
	}

	private loadFromFile(): Promise<void> {
		const pathElectron = dialog.showOpenDialog({
			properties: ['openDirectory']
		})

		if (!(pathElectron && pathElectron[0]))
			return Promise.resolve()

		if (this.tileManager.getPointClouds().length)
			log.warn('you should probably unload the existing point cloud before loading another')
		log.info('Loading point cloud from ' + pathElectron[0])
		return this.loadPointCloudDataFromDirectory(pathElectron[0])
	}

	private addFront(): void {
		log.info("Adding connected annotation to the front")
		if (this.annotationManager.addConnectedLaneAnnotation(NeighborLocation.FRONT, NeighborDirection.SAME)) {
			Annotator.deactivateFrontSideNeighbours()
		}
	}

	private addLeftSame(): void {
		log.info("Adding connected annotation to the left - same direction")
		if (this.annotationManager.addConnectedLaneAnnotation(NeighborLocation.LEFT, NeighborDirection.SAME)) {
			Annotator.deactivateLeftSideNeighbours()
		}
	}

	private addLeftReverse(): void {
		log.info("Adding connected annotation to the left - reverse direction")
		if (this.annotationManager.addConnectedLaneAnnotation(NeighborLocation.LEFT, NeighborDirection.REVERSE)) {
			Annotator.deactivateLeftSideNeighbours()
		}
	}

	private addRightSame(): void {
		log.info("Adding connected annotation to the right - same direction")
		if (this.annotationManager.addConnectedLaneAnnotation(NeighborLocation.RIGHT, NeighborDirection.SAME)) {
			Annotator.deactivateRightSideNeighbours()
		}
	}

	private addRightReverse(): void {
		log.info("Adding connected annotation to the right - reverse direction")
		if (this.annotationManager.addConnectedLaneAnnotation(NeighborLocation.RIGHT, NeighborDirection.REVERSE)) {
			Annotator.deactivateRightSideNeighbours()
		}
	}

	private reverseLaneDirection(): void {
		log.info("Reverse lane direction.")
		let {result, existLeftNeighbour, existRightNeighbour} = this.annotationManager.reverseLaneDirection()
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
		}
	}

	/**
	 * Bind functions events to interface elements
	 */
	private bindLanePropertiesPanel(): void {
		const lcType = $('#lp_select_type')
		lcType.on('change', () => {
			const activeAnnotation = this.annotationManager.getActiveLaneAnnotation()
			if (activeAnnotation === null)
				return
			log.info("Adding lane type: " + lcType.children("option").filter(":selected").text())
			activeAnnotation.type = +lcType.val()
		})

		const lcLeftType = $('#lp_select_left_type')
		lcLeftType.on('change', () => {
			const activeAnnotation = this.annotationManager.getActiveLaneAnnotation()
			if (activeAnnotation === null)
				return
			log.info("Adding left side type: " + lcLeftType.children("option").filter(":selected").text())
			activeAnnotation.leftLineType = +lcLeftType.val()
			activeAnnotation.updateVisualization()
		})

		const lcLeftColor = $('#lp_select_left_color')
		lcLeftColor.on('change', () => {
			const activeAnnotation = this.annotationManager.getActiveLaneAnnotation()
			if (activeAnnotation === null)
				return
			log.info("Adding left side type: " + lcLeftColor.children("option").filter(":selected").text())
			activeAnnotation.leftLineColor = +lcLeftColor.val()
			activeAnnotation.updateVisualization()
		})

		const lcRightType = $('#lp_select_right_type')
		lcRightType.on('change', () => {
			const activeAnnotation = this.annotationManager.getActiveLaneAnnotation()
			if (activeAnnotation === null)
				return
			log.info("Adding right side type: " + lcRightType.children("option").filter(":selected").text())
			activeAnnotation.rightLineType = +lcRightType.val()
			activeAnnotation.updateVisualization()
		})

		const lcRightColor = $('#lp_select_right_color')
		lcRightColor.on('change', () => {
			const activeAnnotation = this.annotationManager.getActiveLaneAnnotation()
			if (activeAnnotation === null)
				return
			log.info("Adding left side type: " + lcRightColor.children("option").filter(":selected").text())
			activeAnnotation.rightLineColor = +lcRightColor.val()
			activeAnnotation.updateVisualization()
		})

		const lcEntry = $('#lp_select_entry')
		lcEntry.on('change', () => {
			const activeAnnotation = this.annotationManager.getActiveLaneAnnotation()
			if (activeAnnotation === null)
				return
			log.info("Adding entry type: " + lcEntry.children("option").filter(":selected").text())
			activeAnnotation.entryType = lcEntry.val()
		})

		const lcExit = $('#lp_select_exit')
		lcExit.on('change', () => {
			const activeAnnotation = this.annotationManager.getActiveLaneAnnotation()
			if (activeAnnotation === null)
				return
			log.info("Adding exit type: " + lcExit.children("option").filter(":selected").text())
			activeAnnotation.exitType = lcExit.val()
		})
	}

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

	private bindRelationsPanel(): void {
		const lcSelectFrom = document.getElementById('lc_select_from')
		if (lcSelectFrom)
			lcSelectFrom.addEventListener('mousedown', () => {
				// Get ids
				const ids = this.annotationManager.getValidIds()
				// Add ids
				const selectbox = $('#lc_select_from')
				selectbox.empty()
				let list = ''
				for (let j = 0; j < ids.length; j++) {
					list += "<option value=" + ids[j] + ">" + ids[j] + "</option>"
				}
				selectbox.html(list)
			})
		else
			log.warn('missing element lc_select_from')

		const lcSelectTo = document.getElementById('lc_select_to')
		if (lcSelectTo)
			lcSelectTo.addEventListener('mousedown', () => {
				// Get ids
				const ids = this.annotationManager.getValidIds()
				// Add ids
				const selectbox = $('#lc_select_to')
				selectbox.empty()
				let list = ''
				for (let j = 0; j < ids.length; j++) {
					list += "<option value=" + ids[j] + ">" + ids[j] + "</option>"
				}
				selectbox.html(list)
			})
		else
			log.warn('missing element lc_select_to')

		const lcAdd = document.getElementById('lc_add')
		if (lcAdd)
			lcAdd.addEventListener('click', () => {
				const lcTo: AnnotationId = Number($('#lc_select_to').val())
				const lcFrom: AnnotationId = Number($('#lc_select_from').val())
				const lcRelation = $('#lc_select_relation').val()

				if (lcTo === null || lcFrom === null) {
					dialog.showErrorBox(EM.ET_RELATION_ADD_FAIL,
						"You have to select both lanes to be connected.")
					return
				}

				if (lcTo === lcFrom) {
					dialog.showErrorBox(EM.ET_RELATION_ADD_FAIL,
						"You can't connect a lane to itself. The 2 ids should be unique.")
					return
				}

				log.info("Trying to add " + lcRelation + " relation from " + lcFrom + " to " + lcTo)
				if (this.annotationManager.addRelation(lcFrom, lcTo, lcRelation)) {
					this.resetLaneProp()
				}
			})
		else
			log.warn('missing element lc_add')
	}

	private bindTrafficSignPropertiesPanel(): void {
		const tpType = $('#tp_select_type')
		tpType.on('change', () => {
			const activeAnnotation = this.annotationManager.getActiveTrafficSignAnnotation()
			if (activeAnnotation === null)
				return
			log.info("Adding traffic sign type: " + tpType.children("option").filter(":selected").text())
			activeAnnotation.type = +tpType.val()
		})
	}

	private bindBoundaryPropertiesPanel(): void {
		const bpType = $('#bp_select_type')
		bpType.on('change', () => {
			const activeAnnotation = this.annotationManager.getActiveBoundaryAnnotation()
			if (activeAnnotation === null)
				return
			log.info("Adding boundary type: " + bpType.children("options").filter(":selected").text())
			activeAnnotation.type = +bpType.val()
		})

		const bpColor = $('#bp_select_color')
		bpColor.on('change', () => {
			const activeAnnotation = this.annotationManager.getActiveBoundaryAnnotation()
			if (activeAnnotation === null)
				return
			log.info("Adding boundary color: " + bpColor.children("options").filter(":selected").text())
			activeAnnotation.color = +bpColor.val()
		})
	}

	private bind(): void {
		this.bindLanePropertiesPanel()
		this.bindLaneNeighborsPanel()
		this.bindRelationsPanel()
		this.bindTrafficSignPropertiesPanel()
		this.bindBoundaryPropertiesPanel()

		const menuControlElement = document.getElementById('menu_control')
		if (menuControlElement)
			menuControlElement.style.visibility = 'visible'
		else
			log.warn('missing element menu_control')

		const menuButton = document.getElementById('menu_control_btn')
		if (menuButton)
			menuButton.addEventListener('click', () => {
				if (this.uiState.isLiveMode) {
					log.info("Disable live location mode first to access the menu.")
				} else {
					log.info("Menu icon clicked. Close/Open menu bar.")
					this.displayMenu(MenuVisibility.TOGGLE)
				}
			})
		else
			log.warn('missing element menu_control_btn')

		const liveLocationControlButton = document.getElementById('live_location_control_btn')
		if (liveLocationControlButton)
			liveLocationControlButton.addEventListener('click', () => {
				this.toggleListen()
			})
		else
			log.warn('missing element live_location_control_btn')

		const statusWindowControlButton = document.getElementById('status_window_control_btn')
		if (statusWindowControlButton)
			statusWindowControlButton.addEventListener('click', () => {
				this.toggleStatusWindow()
			})
		else
			log.warn('missing element status_window_control_btn')

		const toolsDelete = document.getElementById('tools_delete')
		if (toolsDelete)
			toolsDelete.addEventListener('click', () => {
				this.deleteActiveAnnotation()
			})
		else
			log.warn('missing element tools_delete')

		const toolsAddLane = document.getElementById('tools_add_lane')
		if (toolsAddLane)
			toolsAddLane.addEventListener('click', () => {
				this.addLane()
			})
		else
			log.warn('missing element tools_add_lane')

		const toolsAddTrafficSign = document.getElementById('tools_add_traffic_sign')
		if (toolsAddTrafficSign)
			toolsAddTrafficSign.addEventListener('click', () => {
				this.addTrafficSign()
			})
		else
			log.warn('missing element tools_add_traffic_sign')

		const toolsLoad = document.getElementById('tools_load')
		if (toolsLoad)
			toolsLoad.addEventListener('click', () => {
				this.loadFromFile()
					.catch(err => log.warn('loadFromFile failed: ' + err.message))
			})
		else
			log.warn('missing element tools_load')

		const toolsLoadAnnotation = document.getElementById('tools_load_annotation')
		if (toolsLoadAnnotation)
			toolsLoadAnnotation.addEventListener('click', () => {
				const pathElectron = dialog.showOpenDialog({
					filters: [{name: 'json', extensions: ['json']}]
				})

				if (isUndefined(pathElectron))
					return

				log.info('Loading annotations from ' + pathElectron[0])
				this.loadAnnotations(pathElectron[0])
					.catch(err => log.warn('loadAnnotations failed: ' + err.message))
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

		const trAdd = $('#tr_add')
		trAdd.on('click', () => {
			log.info("Add/remove lane to/from car path.")
			if (this.annotationManager.addLaneToPath()) {
				if (trAdd.text() === "Add") {
					trAdd.text("Remove")
				} else {
					trAdd.text("Add")
				}
			}
		})

		const trShow = $('#tr_show')
		trShow.on('click', () => {
			log.info("Show/hide car path.")
			if (!this.annotationManager.showPath()) {
				return
			}

			// Change button text only if showPath succeed
			if (trShow.text() === "Show") {
				trShow.text("Hide")
			} else {
				trShow.text("Show")
			}
		})

		const savePath = $('#save_path')
		savePath.on('click', () => {
			log.info("Save car path to file.")
			this.annotationManager.saveCarPath(config.get('output.trajectory.csv.path'))
		})
	}

	/**
	 * Reset lane properties elements based on the current active lane
	 */
	private resetLaneProp(): void {
		const activeAnnotation = this.annotationManager.getActiveLaneAnnotation()
		if (activeAnnotation === null) {
			return
		}

		if (activeAnnotation.neighborsIds.left != null) {
			Annotator.deactivateLeftSideNeighbours()
		} else {
			Annotator.activateLeftSideNeighbours()
		}

		if (activeAnnotation.neighborsIds.right != null) {
			Annotator.deactivateRightSideNeighbours()
		} else {
			Annotator.activateRightSideNeighbours()
		}

		if (activeAnnotation.neighborsIds.front.length !== 0) {
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

		const lcSelectTo = $('#lc_select_to')
		lcSelectTo.empty()
		lcSelectTo.removeAttr('disabled')

		const lcSelectFrom = $('#lc_select_from')
		lcSelectFrom.empty()
		lcSelectFrom.removeAttr('disabled')

		const lcSelectRelation = $('#lc_select_relation')
		lcSelectRelation.removeAttr('disabled')

		const lpAddRelation = $('#lc_add')
		lpAddRelation.removeAttr('disabled')

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

		const trAdd = $('#tr_add')
		trAdd.removeAttr('disabled')
		if (this.annotationManager.laneIndexInPath(activeAnnotation.uuid) === -1) {
			trAdd.text("Add")
		} else {
			trAdd.text("Remove")
		}

		const trShow = $('#tr_show')
		trShow.removeAttr('disabled')
	}

	/**
	 * Reset traffic sign properties elements based on the current active traffic sign
	 */
	private resetTrafficSignProp(): void {
		const activeAnnotation = this.annotationManager.getActiveTrafficSignAnnotation()
		if (activeAnnotation === null) {
			return
		}

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
	private resetBoundaryProp(): void {
		const activeAnnotation = this.annotationManager.getActiveBoundaryAnnotation()
		if (activeAnnotation === null) {
			return
		}

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
	 * Deactivate lane properties menu panel
	 */
	private static deactivateLaneProp(): void {
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

		const laneConn = document.getElementById('lane_conn')
		if (laneConn) {
			const selects = laneConn.getElementsByTagName('select')
			for (let i = 0; i < selects.length; ++i) {
				selects.item(i).setAttribute('disabled', 'disabled')
			}
		} else
			log.warn('missing element lane_conn')

		const lcAdd = document.getElementById('lc_add')
		if (lcAdd)
			lcAdd.setAttribute('disabled', 'disabled')
		else
			log.warn('missing element lc_add')

		const trAdd = document.getElementById('tr_add')
		if (trAdd)
			trAdd.setAttribute('disabled', 'disabled')
		else
			log.warn('missing element tr_add')
	}

	/**
	 * Deactivate boundary properties menu panel
	 */
	private static deactivateBoundaryProp(): void {
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
	}

	/**
	 * Deactivate traffic sign properties menu panel
	 */
	private static deactivateTrafficSignProp(): void {
		// TODO
	}

	/**
	 * Deactivate/activate left side neighbours
	 */
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
	private static deactivateFrontSideNeighbours(): void {
		const lpAddFront = document.getElementById('lp_add_forward')
		if (lpAddFront)
			lpAddFront.setAttribute('disabled', 'disabled')
		else
			log.warn('missing element lp_add_forward')
	}

	private static activateFrontSideNeighbours(): void {
		const lpAddFront = document.getElementById('lp_add_forward')
		if (lpAddFront)
			lpAddFront.removeAttribute('disabled')
		else
			log.warn('missing element lp_add_forward')
	}

	// Switch the camera between two views. Attempt to keep the scene framed in the same way after the switch.
	private toggleCameraType(): void {
		let oldCamera: THREE.Camera
		let newCamera: THREE.Camera
		let newType: string
		if (this.camera === this.perspectiveCamera) {
			oldCamera = this.perspectiveCamera
			newCamera = this.orthographicCamera
			newType = cameraTypeString.orthographic
		} else {
			oldCamera = this.orthographicCamera
			newCamera = this.perspectiveCamera
			newType = cameraTypeString.perspective
		}

		// Copy over the camera position. When the next animate() runs, the new camera will point at the
		// same target as the old camera, since the target is maintained by OrbitControls. That takes
		// care of position and orientation, but not zoom. PerspectiveCamera and OrthographicCamera
		// calculate zoom differently. It would be nice to convert one to the other here.
		newCamera.position.set(oldCamera.position.x, oldCamera.position.y, oldCamera.position.z)
		this.camera = newCamera

		this.transformControls.setCamera(this.camera)
		{
			// tslint:disable-next-line:no-any
			(this.orbitControls as any).setCamera(this.camera)
		}
		this.statusWindow.setMessage(statusKey.cameraType, 'Camera: ' + newType)
		this.storage.setItem(preferenceKey.cameraPreference, newType)
	}

	// In normal edit mode, toggles through the states defined in ModelVisibility:
	// - all visible
	// - super tile wire frames hidden
	// - super tile wire frames hidden; point cloud hidden
	// - super tile wire frames hidden; annotations hidden
	private toggleModelVisibility(): void {
		let newState = this.uiState.modelVisibility + 1
		if (!ModelVisibility[newState])
			newState = ModelVisibility.ALL_VISIBLE
		this.setModelVisibility(newState)
	}

	private setModelVisibility(newState: ModelVisibility): void {
		if (this.uiState.isLiveMode) return

		this.uiState.modelVisibility = newState
		switch (this.uiState.modelVisibility) {
			case ModelVisibility.HIDE_SUPER_TILES:
				log.info('hiding super tiles')
				this.hideSuperTiles()
				this.showPointCloud()
				this.showAnnotations()
				break
			case ModelVisibility.HIDE_SUPER_TILES_AND_POINT_CLOUD:
				log.info('hiding point cloud')
				this.hideSuperTiles()
				this.hidePointCloud()
				this.showAnnotations()
				break
			case ModelVisibility.HIDE_SUPER_TILES_AND_ANNOTATIONS:
				log.info('hiding annotations')
				this.hideSuperTiles()
				this.showPointCloud()
				this.hideAnnotations()
				break
			default:
				log.info('showing all objects')
				this.showSuperTiles()
				this.showPointCloud()
				this.showAnnotations()
				break
		}
	}

	private hidePointCloud(): void {
		this.tileManager.getPointClouds().forEach(pc => this.scene.remove(pc))
		if (this.pointCloudBoundingBox)
			this.scene.remove(this.pointCloudBoundingBox)
		this.uiState.isPointCloudVisible = false
	}

	private showPointCloud(): void {
		this.tileManager.getPointClouds().forEach(pc => this.scene.add(pc))
		if (this.pointCloudBoundingBox)
			this.scene.add(this.pointCloudBoundingBox)
		this.uiState.isPointCloudVisible = true
	}

	private hideAnnotations(): void {
		this.annotationManager.hideAnnotations()
		this.uiState.isAnnotationsVisible = false
	}

	private showAnnotations(): void {
		this.annotationManager.showAnnotations()
		this.uiState.isAnnotationsVisible = true
	}

	private loadCarModel(): Promise<void> {
		return new Promise((resolve: () => void, reject: (reason?: Error) => void): void => {
			try {
				const manager = new THREE.LoadingManager()
				const loader = new THREE.OBJLoader(manager)
				const car = require('../annotator-assets/models/BMW_X5_4.obj')
				loader.load(car, (object: THREE.Object3D) => {
					const boundingBox = new THREE.Box3().setFromObject(object)
					const boxSize = boundingBox.getSize().toArray()
					const modelLength = Math.max(...boxSize)
					const carLength = 4.5 // approx in meters
					const scaleFactor = carLength / modelLength
					this.carModel = object
					this.carModel.scale.set(scaleFactor, scaleFactor, scaleFactor)
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
	// See also runFlythrough().
	private initClient(): void {
		this.liveSubscribeSocket = zmq.socket('sub')

		this.liveSubscribeSocket.on('message', (msg) => {
			if (!this.uiState.isLiveMode) return
			if (this.flyThroughSettings.enabled) return

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

	/**
	 * Toggle whether or not to listen for live-location updates.
	 * Returns the updated state of live-location mode.
	 */
	private toggleListen(): void {
		let hideMenu
		if (this.uiState.isLiveMode) {
			hideMenu = this.stopListening()
		} else {
			hideMenu = this.listen()
		}
		this.displayMenu(hideMenu ? MenuVisibility.HIDE : MenuVisibility.SHOW)
	}

	private listen(): boolean {
		if (this.uiState.isLiveMode) return this.uiState.isLiveMode

		log.info('Listening for messages...')
		this.annotationManager.setLiveMode()
		this.uiState.isLiveMode = true
		this.setModelVisibility(ModelVisibility.ALL_VISIBLE)
		if (this.axis)
			this.scene.remove(this.axis)
		if (this.compassRose)
			this.scene.remove(this.compassRose)
		this.grid.visible = false
		this.orbitControls.enabled = false
		this.camera.matrixAutoUpdate = false
		this.hideSuperTiles()
		if (this.pointCloudBoundingBox)
			this.pointCloudBoundingBox.material.visible = false
		this.carModel.visible = true
		this.settings.fpsRendering = this.liveModeSettings.fps
		if (this.flyThroughSettings.enabled) {
			this.flyThroughSettings.currentPoseIndex = this.flyThroughSettings.startPoseIndex
			this.runFlythrough()
		} else {
			this.locationServerStatusClient.connect()
		}

		return this.uiState.isLiveMode
	}

	private stopListening(): boolean {
		if (!this.uiState.isLiveMode) return this.uiState.isLiveMode

		log.info('Stopped listening for messages...')
		this.annotationManager.unsetLiveMode()
		this.uiState.isLiveMode = false
		this.setModelVisibility(ModelVisibility.ALL_VISIBLE)
		if (this.axis)
			this.scene.add(this.axis)
		if (this.compassRose)
			this.scene.add(this.compassRose)
		this.grid.visible = true
		this.orbitControls.enabled = true
		this.camera.matrixAutoUpdate = true
		this.carModel.visible = false
		this.showSuperTiles()
		if (this.pointCloudBoundingBox)
			this.pointCloudBoundingBox.material.visible = true
		this.settings.fpsRendering = this.settings.defaultFpsRendering
		this.statusWindow.setMessage(statusKey.flyThrough, '')
		this.updateAoiHeading(null)

		return this.uiState.isLiveMode
	}

	// Toggle whether to display the status window.
	private toggleStatusWindow(): void {
		this.statusWindow.setEnabled(!this.statusWindow.isEnabled())
	}

	// Show or hide the menu as requested.
	private displayMenu(visibility: MenuVisibility): void {
		const menu = document.getElementById('menu')
		if (menu)
			switch (visibility) {
				case MenuVisibility.HIDE:
					menu.style.visibility = 'hidden'
					break
				case MenuVisibility.SHOW:
					menu.style.visibility = 'visible'
					break
				case MenuVisibility.TOGGLE:
					menu.style.visibility = menu.style.visibility === 'hidden' ? 'visible' : 'hidden'
					break
				default:
					log.warn(`unhandled visibility option ${visibility} in displayMenu()`)
			}
		else
			log.warn('missing element menu')
	}

	private updateAoiHeading(rotationThreeJs: THREE.Quaternion | null): void {
		if (this.aoiState.enabled)
			this.aoiState.currentHeading = rotationThreeJs
				? new THREE.Vector3(-1, 0, 0).applyQuaternion(rotationThreeJs)
				: null
	}

	private updateCarWithPose(pose: Models.PoseMessage): void {
		const inputPosition = new THREE.Vector3(pose.x, pose.y, pose.z)
		const standardPosition = convertToStandardCoordinateFrame(inputPosition, CoordinateFrameType.STANDARD)
		const positionThreeJs = this.tileManager.utmToThreeJs(standardPosition.x, standardPosition.y, standardPosition.z)
		const inputRotation = new THREE.Quaternion(pose.q0, pose.q1, pose.q2, pose.q3)
		const standardRotation = cvtQuaternionToStandardCoordinateFrame(inputRotation, CoordinateFrameType.STANDARD)
		const rotationThreeJs = new THREE.Quaternion(standardRotation.y, standardRotation.z, standardRotation.x, standardRotation.w)
		rotationThreeJs.normalize()

		this.updateAoiHeading(rotationThreeJs)
		this.updateCurrentLocationStatusMessage(standardPosition)
		this.updateCarPose(positionThreeJs, rotationThreeJs)
		this.updateCameraPose()

	}

	private updateCurrentLocationStatusMessage(positionUtm: THREE.Vector3): void {
		const positionLla = this.tileManager.utmVectorToLngLatAlt(positionUtm)
		const messageLla = sprintf('LLA: %.4fE %.4fN %.1falt', positionLla.x, positionLla.y, positionLla.z)
		this.statusWindow.setMessage(statusKey.currentLocationLla, messageLla)
		const messageUtm = sprintf('UTM %s: %dE %dN %.1falt', this.tileManager.utmZoneString(), positionUtm.x, positionUtm.y, positionUtm.z)
		this.statusWindow.setMessage(statusKey.currentLocationUtm, messageUtm)
	}

	private updateCarPose(position: THREE.Vector3, rotation: THREE.Quaternion): void {
		this.carModel.position.set(position.x, position.y, position.z)
		this.carModel.setRotationFromQuaternion(rotation)
		// Bring the model close to the ground (approx height of the sensors)
		const p = this.carModel.getWorldPosition()
		this.carModel.position.set(p.x, p.y - 2, p.z)
	}

	private updateCameraPose(): void {
		const p = this.carModel.getWorldPosition().clone()
		const offset = this.liveModeSettings.cameraOffset.clone()
		offset.applyQuaternion(this.carModel.quaternion)
		offset.add(p)
		this.camera.position.set(offset.x, offset.y, offset.z)
		this.camera.lookAt(p)
		this.camera.updateMatrix()
	}

	/**
	 * Switch between voxel and point cloud rendering.
	 * TODO: We might be able to do this by setting the 'visible' parameter of the
	 * corresponding 3D objects.
	 */
	private toggleVoxelsAndPointClouds(): void {
		if (this.uiState.isPointCloudVisible) {
			this.hidePointCloud()
			this.tileManager.voxelsMeshGroup.forEach(mesh => {
				this.scene.add(mesh)
			})
		} else {
			this.showPointCloud()
			this.tileManager.voxelsMeshGroup.forEach(mesh => {
				this.scene.remove(mesh)
			})
		}
	}

	// Print a message about how big our tiles are.
	private updateTileManagerStats(): void {
		if (!this.settings.enableTileManagerStats) return
		if (!this.statusWindow.isEnabled()) return

		const message = `Loaded ${this.tileManager.superTiles.size} super tiles; ${this.tileManager.pointCount()} points`
		this.statusWindow.setMessage(statusKey.tileManagerStats, message)
	}

	// Display a UI element to tell the user what is happening with tile server. Error messages persist,
	// and success messages disappear after a time-out.
	private onTileServiceStatusUpdate: (tileServiceStatus: boolean) => void = (tileServiceStatus: boolean) => {
		let message = 'Tile server status: '
		if (tileServiceStatus) {
			message += '<span class="statusOk">Available</span>'
			this.delayHideTileServiceStatus()
		} else {
			message += '<span class="statusError">Unavailable</span>'
			this.cancelHideTileServiceStatus()
		}
		this.statusWindow.setMessage(statusKey.tileServer, message)
	}

	private delayHideTileServiceStatus = (): void => {
		this.cancelHideTileServiceStatus()
		this.hideTileServiceStatus()
	}

	private cancelHideTileServiceStatus = (): void => {
		if (this.serverStatusDisplayTimer)
			clearTimeout(this.serverStatusDisplayTimer)
	}

	private hideTileServiceStatus = (): void => {
		this.serverStatusDisplayTimer = setTimeout(() => {
			this.statusWindow.setMessage(statusKey.tileServer, '')
		}, this.settings.timeToDisplayHealthyStatusMs)
	}

	// Display a UI element to tell the user what is happening with the location server.
	// Error messages persist,  and success messages disappear after a time-out.
	private onLocationServerStatusUpdate: (level: LocationServerStatusLevel, serverStatus: string)
			=> void = (level: LocationServerStatusLevel, serverStatus: string) => {
		// If we aren't listening then we don't care
		if (!this.uiState.isLiveMode) return
		if (this.flyThroughSettings.enabled) return

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
		this.statusWindow.setMessage(statusKey.locationServer, message)
	}

	private delayLocationServerStatus = (): void => {
		this.cancelHideLocationServerStatus()
		this.hideLocationServerStatus()
	}

	private cancelHideLocationServerStatus = (): void => {
		if (this.locationServerStatusDisplayTimer)
			clearTimeout(this.locationServerStatusDisplayTimer)
	}

	private hideLocationServerStatus = (): void => {
		this.locationServerStatusDisplayTimer = setTimeout(() => {
			this.statusWindow.setMessage(statusKey.locationServer, '')
		}, this.settings.timeToDisplayHealthyStatusMs)
	}

}

export const annotator = new Annotator()
