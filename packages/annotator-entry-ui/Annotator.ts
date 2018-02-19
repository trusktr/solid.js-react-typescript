/**
 *  Copyright 2017 Mapper Inc. Part of the mapper-annotator project.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

const config = require('../config')
import * as $ from 'jquery'
import * as AsyncFile from "async-file";
const vsprintf = require("sprintf-js").vsprintf
import {TransformControls} from 'annotator-entry-ui/controls/TransformControls'
import {OrbitControls} from 'annotator-entry-ui/controls/OrbitControls'
import {
	convertToStandardCoordinateFrame, CoordinateFrameType,
	cvtQuaternionToStandardCoordinateFrame
} from "./geometry/CoordinateFrame"
import {isTupleOfNumbers} from "./util/Validation"
import {StatusWindowController} from "./status/StatusWindowController"
import {TileManager}  from 'annotator-entry-ui/tile/TileManager'
import {SuperTile} from "./tile/SuperTile"
import {RangeSearch} from "./model/RangeSearch"
import {BusyError} from "./tile/TileManager"
import {getCenter, getSize} from "./geometry/ThreeHelpers"
import {AxesHelper} from "./controls/AxesHelper"
import {CompassRose} from "./controls/CompassRose"
import {AnnotationManager, OutputFormat} from 'annotator-entry-ui/AnnotationManager'
import {AnnotationId} from 'annotator-entry-ui/annotations/AnnotationBase'
import {NeighborLocation, NeighborDirection, Lane} from 'annotator-entry-ui/annotations/Lane'
import {Connection} from "./annotations/Connection"
import {TrafficSign} from "./annotations/TrafficSign"
import * as EM from 'annotator-entry-ui/ErrorMessages'
import * as TypeLogger from 'typelogger'
import {getValue} from "typeguard"
import {isNullOrUndefined, isUndefined} from "util"
import * as MapperProtos from '@mapperai/mapper-models'
import Models = MapperProtos.mapper.models
import * as THREE from 'three'
import {Socket} from 'zmq'

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
	carPosition: 'carPosition',
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
	defaultFpsRendering: number
	fpsRendering: number
	estimateGroundPlane: boolean
	generateVoxelsOnPointLoad: boolean
	drawBoundingBox: boolean
	superTileBboxMaterial: THREE.Material // for visualizing available, but unpopulated, super tiles
	superTileBboxColor: THREE.Color
	aoiBboxColor: THREE.Color
	aoiHalfSize: THREE.Vector3 // half the dimensions of an AOI box, which will be constructed around a center point
}

interface FlyThroughSettings {
	enabled: boolean
	startPoseIndex: number
	endPoseIndex: number
	currentPoseIndex: number
	cameraOffset: THREE.Vector3
	cameraOffsetDelta: number
	fps: number
}

interface UiState {
	modelVisibility: ModelVisibility
	isSuperTilesVisible: boolean
	isPointCloudVisible: boolean
	isAnnotationsVisible: boolean
	isControlKeyPressed: boolean
	isShiftKeyPressed: boolean
	isAddMarkerKeyPressed: boolean
	isAddTrafficSignMarkerKeyPressed: boolean
	isLastTrafficSignMarkerKeyPressed: boolean
	isMouseButtonPressed: boolean
	numberKeyPressed: number | null
	isLiveMode: boolean // enables a trajectory fly-through, while allowing minimal user input
	isKioskMode: boolean // turns on live mode permanently, with even less user input
}

// Area of Interest: where to load point clouds
interface AoiState {
	enabled: boolean // enable auto-loading points around the AOI
	focalPoint: THREE.Vector3 | null, // cached value for the center of the AOI
	boundingBox: THREE.BoxHelper | null // a box drawn around the current area of interest
}

/**
 * The Annotator class is in charge of rendering the 3d Scene that includes the point clouds
 * and the annotations. It also handles the mouse and keyboard events needed to select
 * and modify the annotations.
 */
export class Annotator {
	private uiState: UiState
	private aoiState: AoiState
	private statusWindow: StatusWindowController // a place to print status messages
	private scene: THREE.Scene // where objects are rendered in the UI; shared with AnnotationManager
	private camera: THREE.PerspectiveCamera
	private renderer: THREE.WebGLRenderer
	private raycasterPlane: THREE.Raycaster // used to compute where the waypoints will be dropped
	private raycasterMarker: THREE.Raycaster // used to compute which marker is active for editing
	private raycasterSuperTiles: THREE.Raycaster // used to select a pending super tile for loading
	private carModel: THREE.Object3D // displayed during live mode, moving along a preset trajectory
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
	private annotationManager: AnnotationManager
	private pendingSuperTileBoxes: THREE.Mesh[] // bounding boxes of super tiles that exist but have not been loaded
	private highlightedSuperTileBox: THREE.Mesh | null // pending super tile which is currently active in the UI
	private pointCloudBoundingBox: THREE.BoxHelper | null // just a box drawn around the point cloud
	private liveSubscribeSocket: Socket
	private hovered: THREE.Object3D | null // a lane vertex which the user is interacting with
	private settings: AnnotatorSettings
	private flythroughTrajectory: Models.TrajectoryMessage
	private flythroughSettings: FlyThroughSettings
	private gui: any

	constructor() {
		this.settings = {
			background: config.get('startup.background_color') || '#082839',
			cameraOffset: new THREE.Vector3(0, 400, 200),
			lightOffset: new THREE.Vector3(0, 1500, 200),
			defaultFpsRendering: parseInt(config.get('startup.render.fps'), 10) || 60,
			fpsRendering: 0,
			estimateGroundPlane: !!config.get('annotator.add_points_to_estimated_ground_plane'),
			generateVoxelsOnPointLoad: !!config.get('annotator.generate_voxels_on_point_load'),
			drawBoundingBox: !!config.get('annotator.draw_bounding_box'),
			superTileBboxMaterial: new THREE.MeshBasicMaterial({color: 0x774400, wireframe: true}),
			superTileBboxColor: new THREE.Color(0xff0000),
			aoiBboxColor: new THREE.Color(0x00ff00),
			aoiHalfSize: new THREE.Vector3(15, 15, 15)
		}
		const aoiSize: [number, number, number] = config.get('annotator.area_of_interest.size')
		if (isTupleOfNumbers(aoiSize, 3))
			this.settings.aoiHalfSize = new THREE.Vector3(aoiSize[0] / 2, aoiSize[1] / 2, aoiSize[2] / 2)
		else if (aoiSize)
			log.warn(`invalid annotator.area_of_interest.size config: ${aoiSize}`)
		this.settings.fpsRendering = this.settings.defaultFpsRendering
		this.uiState = {
			modelVisibility: ModelVisibility.ALL_VISIBLE,
			isSuperTilesVisible: true,
			isPointCloudVisible: true,
			isAnnotationsVisible: true,
			isControlKeyPressed: false,
			isShiftKeyPressed: false,
			isAddMarkerKeyPressed: false,
			isAddTrafficSignMarkerKeyPressed: false,
			isLastTrafficSignMarkerKeyPressed: false,
			isMouseButtonPressed: false,
			numberKeyPressed: null,
			isLiveMode: false,
			isKioskMode: !!config.get('startup.kiosk_mode'),
		}
		this.aoiState = {
			enabled: !!config.get('annotator.area_of_interest.enable'),
			focalPoint: null,
			boundingBox: null,
		}
		this.statusWindow = new StatusWindowController()
		this.hovered = null
		this.raycasterPlane = new THREE.Raycaster()
		this.raycasterPlane.params.Points!.threshold = 0.1
		this.raycasterMarker = new THREE.Raycaster()
		this.raycasterSuperTiles = new THREE.Raycaster()
		// Initialize super tile that will load the point clouds
		this.tileManager = new TileManager(this.onSuperTileUnload)
		this.pendingSuperTileBoxes = []
		this.highlightedSuperTileBox = null
		this.pointCloudBoundingBox = null

		this.flythroughSettings = {
			enabled: false,
			startPoseIndex: 0,
			endPoseIndex: Number.MAX_VALUE,
			currentPoseIndex: 0,
			cameraOffset: new THREE.Vector3(12, 10, 0),
			cameraOffsetDelta: 1,
			fps: parseFloat(config.get('fly_through.render.fps')) || 10
		}

		// Initialize socket for use when "live mode" operation is on
		this.initClient()
	}

	/**
	 * Create the 3D Scene and add some basic objects. It also initializes
	 * several event listeners.
	 */
	initScene(): Promise<void> {
		const self = this
		log.info(`Building scene`)

		const [width, height]: Array<number> = this.getContainerSize()

		// Create scene and camera
		this.scene = new THREE.Scene()
		this.camera = new THREE.PerspectiveCamera(70, width / height, 0.1, 10000)
		this.scene.add(this.camera)

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
		planeMaterial.opacity = 0.2
		this.plane = new THREE.Mesh(planeGeometry, planeMaterial)
		this.plane.receiveShadow = true
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

		// Point cloud is empty. It will be populated later.
		this.scene.add(this.tileManager.pointCloud)

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
		this.renderer.domElement.addEventListener('mouseup', this.addLaneAnnotationMarker)
		this.renderer.domElement.addEventListener('mouseup', this.addTrafficSignAnnotationMarker)
		this.renderer.domElement.addEventListener('mouseup', this.checkForAnnotationSelection)
		this.renderer.domElement.addEventListener('mousemove', this.checkForSuperTileSelection)
		this.renderer.domElement.addEventListener('click', this.clickSuperTileBox)
		this.renderer.domElement.addEventListener('mouseup', () => {this.uiState.isMouseButtonPressed = false})
		this.renderer.domElement.addEventListener('mousedown', () => {this.uiState.isMouseButtonPressed = true})

		// Bind events
		if (!this.uiState.isKioskMode)
			this.bind()
		Annotator.deactivateLaneProp()

		this.displayMenu(
			config.get('startup.show_menu') && !this.uiState.isKioskMode
				? MenuVisibility.SHOW
				: MenuVisibility.HIDE
		)

		return this.loadCarModel()
			.then(() => this.loadUserData())
			.then(() => {if (this.uiState.isKioskMode) this.toggleListen()})
	}

	// Load up any data which configuration has asked for on start-up.
	loadUserData(): Promise<void> {
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

		let trajectoryResult: Promise<void>
		const trajectoryPath = config.get('fly_through.trajectory_path')
		if (trajectoryPath) {
			trajectoryResult = pointCloudResult
				.then(() => {
					log.info('loading pre-configured trajectory ' + trajectoryPath)
					return this.loadFlythroughTrajectory(trajectoryPath)
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

	private loadFlythroughTrajectory(filename: string): Promise<void>  {
		return AsyncFile.readFile(filename)
			.then(buffer => Models.TrajectoryMessage.decode(buffer))
			.then(msg => {
				log.info('Number of trajectory poses: ' + msg.states.length)
				this.flythroughSettings.enabled = true
				this.flythroughTrajectory = msg
				if (this.flythroughSettings.endPoseIndex >= this.flythroughTrajectory.states.length) {
					this.flythroughSettings.endPoseIndex = this.flythroughTrajectory.states.length
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
		if (!this.uiState.isLiveMode) {
			return
		}

		setTimeout(() => {
			this.runFlythrough()
		}, 1000 / this.flythroughSettings.fps)

		if (this.flythroughSettings.currentPoseIndex >= this.flythroughSettings.endPoseIndex) {
			this.flythroughSettings.currentPoseIndex = this.flythroughSettings.startPoseIndex
		}
		const state = this.flythroughTrajectory.states[this.flythroughSettings.currentPoseIndex]

		// Move the car and the camera
		if (
			state && state.pose
			&& state.pose.x !== null && state.pose.y !== null && state.pose.z !== null
			&& state.pose.q0 !== null && state.pose.q1 !== null && state.pose.q2 !== null && state.pose.q3 !== null
		) {
			const inputPosition = new THREE.Vector3(state.pose.x, state.pose.y, state.pose.z)
			const standardPosition = convertToStandardCoordinateFrame(inputPosition, CoordinateFrameType.STANDARD)
			const positionThreeJs = this.tileManager.utmToThreeJs(standardPosition.x, standardPosition.y, standardPosition.z)
			const inputRotation = new THREE.Quaternion(state.pose.q0, state.pose.q1, state.pose.q2, state.pose.q3)
			const standardRotation = cvtQuaternionToStandardCoordinateFrame(inputRotation, CoordinateFrameType.STANDARD)
			const rotationThreeJs = new THREE.Quaternion(standardRotation.y, standardRotation.z, standardRotation.x, standardRotation.w)
			rotationThreeJs.normalize()

			this.updateCarStatus(standardPosition)
			this.updateCarPose(positionThreeJs, rotationThreeJs)
			this.updateCameraPose()
		}

		this.flythroughSettings.currentPoseIndex++
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
	private setStage(x: number, y: number, z: number, resetCamera: boolean = true, gridYValue: number | null = null): void {
		this.plane.geometry.center()
		this.plane.geometry.translate(x, y, z)
		this.grid.geometry.center()
		this.grid.geometry.translate(x, y, z)
		if (!isNullOrUndefined(gridYValue)) {
			this.plane.position.y = gridYValue
			this.grid.position.y = gridYValue
		}
		if (resetCamera) {
			this.light.position.set(x + this.settings.lightOffset.x, y + this.settings.lightOffset.y, z + this.settings.lightOffset.z)
			this.camera.position.set(x + this.settings.cameraOffset.x, y + this.settings.cameraOffset.y, z + this.settings.cameraOffset.z)
			this.orbitControls.target.set(x, y, z)
		}
	}

	/**
	 * Set some point as the center of the visible world.
	 */
	private setStageByVector(point: THREE.Vector3, resetCamera: boolean = true, gridYValue: number | null = null): void {
		this.setStage(point.x, point.y, point.z, resetCamera, gridYValue)
	}

	/*
	 * Set the stage at the bottom center of TileManager's point cloud.
	 */
	private setStageByPointCloud(resetCamera: boolean): void {
		const focalPoint = this.tileManager.centerPoint()
		if (focalPoint) {
			const groundPlaneYIndex = this.settings.estimateGroundPlane
				? this.tileManager.estimateGroundPlaneYIndex()
				: null
			const gridYValue = isNullOrUndefined(groundPlaneYIndex)
				? null
				: groundPlaneYIndex - focalPoint.y
			this.setStageByVector(focalPoint, resetCamera, gridYValue)
		}
	}

	// Display the compass rose just outside the bounding box of the point cloud.
	private setCompassRoseByPointCloud(): void {
		if (!this.compassRose) return
		const boundingBox = this.tileManager.boundingBox()
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
		if (center)
			this.orbitControls.target.set(center.x, center.y, center.z)
		else
			log.warn('point cloud has not been initialized')
	}

	// Set the camera directly above the current target, looking down.
	private resetTiltAndCompass(): void {
		const distanceCameraToTarget = this.camera.position.clone().sub(this.orbitControls.target).length()
		this.camera.position.x = this.orbitControls.target.x
		this.camera.position.y = this.orbitControls.target.y + distanceCameraToTarget
		this.camera.position.z = this.orbitControls.target.z
	}

	// Given a path to a directory that contains point cloud tiles, load them and add them to the scene.
	private loadPointCloudDataFromDirectory(pathToTiles: string): Promise<void> {
		log.info('loadPointCloudDataFromDirectory')
		return this.tileManager.loadFromDirectory(pathToTiles, CoordinateFrameType.STANDARD)
			.then(() => this.pointCloudLoadedSideEffects())
			.catch(err => Annotator.pointCloudLoadedError(err))
	}

	// Load tiles within a bounding box and add them to the scene.
	private loadPointCloudDataFromConfigBoundingBox(bbox: number[]): Promise<void> {
		if (!isTupleOfNumbers(bbox, 6)) {
			Annotator.pointCloudLoadedError(Error('invalid point cloud bounding box config'))
			return Promise.resolve()
		} else {
			const p1 = new THREE.Vector3(bbox[0], bbox[1], bbox[2])
			const p2 = new THREE.Vector3(bbox[3], bbox[4], bbox[5])
			return this.loadPointCloudDataFromMapServer({minPoint: p1, maxPoint: p2})
		}
	}

	// Load tiles within a bounding box and add them to the scene.
	private loadPointCloudDataFromMapServer(search: RangeSearch, loadAllPoints: boolean = false, resetCamera: boolean = true): Promise<void> {
		return this.tileManager.loadFromMapServer(search, CoordinateFrameType.STANDARD, loadAllPoints)
			.then(() => this.pointCloudLoadedSideEffects(resetCamera))
			.catch(err => Annotator.pointCloudLoadedError(err))
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

	private static pointCloudLoadedError(err: Error): void {
		if (err instanceof BusyError) {
			log.warn(err.message)
		} else {
			log.error(err.message)
			dialog.showErrorBox('Point Cloud Load Error', err.message)
		}
	}

	// Compute corresponding height for each voxel based on near by annotations
	private computeVoxelsHeights(): void {
		if (this.annotationManager.laneAnnotations.length === 0)
			log.error(`Unable to compute voxels height, there are no annotations.`)

		let voxels: Set<THREE.Vector3> = this.tileManager.voxelsDictionary
		let voxelSize: number = this.tileManager.voxelSize
		let annotationCutoffDistance: number = 1.2 * 1.2 // 1.2 meters radius
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

	// Incrementally load the point cloud for a single super tile.
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
		this.tileManager.unloadAllPoints()
		this.unHighlightSuperTileBox()
		this.pendingSuperTileBoxes.forEach(box => this.scene.remove(box))
		if (this.pointCloudBoundingBox)
			this.scene.remove(this.pointCloudBoundingBox)
	}

	// Display a bounding box for each super tile that exists but doesn't have points loaded in memory.
	private renderEmptySuperTiles(): void {
		this.tileManager.superTiles.forEach(st => this.superTileToBoundingBox(st!))

		if (this.uiState.isLiveMode)
			this.hideSuperTiles()
	}

	// When TileManager unloads a super tile, update Annotator's parallel data structure.
	private onSuperTileUnload: (superTile: SuperTile) => void = (superTile: SuperTile) => {
		this.superTileToBoundingBox(superTile)
	}

	private superTileToBoundingBox(superTile: SuperTile): void {
		if (!superTile.hasPointCloud) {
			const size = getSize(superTile.threeJsBoundingBox)
			const center = getCenter(superTile.threeJsBoundingBox)
			const geometry = new THREE.BoxGeometry(size.x, size.y, size.z)
			const box = new THREE.Mesh(geometry, this.settings.superTileBboxMaterial)
			box.geometry.translate(center.x, center.y, center.z)
			box.userData = superTile
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

	// Draw a box around the data. Useful for debugging.
	private updatePointCloudBoundingBox(): void {
		if (this.settings.drawBoundingBox) {
			if (this.pointCloudBoundingBox)
				this.scene.remove(this.pointCloudBoundingBox)
			this.pointCloudBoundingBox = new THREE.BoxHelper(this.tileManager.pointCloud, this.settings.superTileBboxColor)
			this.scene.add(this.pointCloudBoundingBox)
		}
	}

	// Track where the camera is pointing. Set the AOI for loading point clouds.
	private updatePointCloudAoi(): void {
		this.raycasterPlane.setFromCamera(cameraCenter, this.camera)
		const intersections = this.raycasterPlane.intersectObject(this.plane)
		if (intersections.length > 0) {
			const oldPoint = this.aoiState.focalPoint
			const newPoint = intersections[0].point.round()
			const samePoint = oldPoint && oldPoint.x === newPoint.x && oldPoint.y === newPoint.y && oldPoint.z === newPoint.z
			if (!samePoint) {
				this.aoiState.focalPoint = newPoint
				this.updatePointCloudAoiBoundingBox()
			}
		} else {
			if (this.aoiState.focalPoint !== null) {
				this.aoiState.focalPoint = null
				this.updatePointCloudAoiBoundingBox()
			}
		}
	}

	// Create a bounding box around the current AOI and optionally display it.
	// Then load the points in and around the AOI.
	private updatePointCloudAoiBoundingBox(): void {
		if (this.settings.drawBoundingBox && this.aoiState.boundingBox) {
			this.scene.remove(this.aoiState.boundingBox)
			this.aoiState.boundingBox = null
		}

		if (this.aoiState.focalPoint) {
			const minCorner = this.aoiState.focalPoint.clone().sub(this.settings.aoiHalfSize)
			const maxCorner = this.aoiState.focalPoint.clone().add(this.settings.aoiHalfSize)

			if (this.settings.drawBoundingBox) {
				const geom = new THREE.Geometry()
				geom.vertices.push(minCorner, maxCorner)
				this.aoiState.boundingBox = new THREE.BoxHelper(new THREE.Points(geom), this.settings.aoiBboxColor)
				this.scene.add(this.aoiState.boundingBox)
			}

			this.loadPointCloudDataFromMapServer(
				{
					minPoint: this.tileManager.threeJsToUtm(minCorner),
					maxPoint: this.tileManager.threeJsToUtm(maxCorner),
				},
				true,
				false
			)
				.catch(err => {log.warn(err.message)})
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
	 * If the mouse was clicked while pressing the "a" key, drop a lane marker.
	 */
	private addLaneAnnotationMarker = (event: MouseEvent): void => {
		if (this.uiState.isAddMarkerKeyPressed === false) {
			return
		}

		const mouse = this.getMouseCoordinates(event)
		this.raycasterPlane.setFromCamera(mouse, this.camera)
		let intersections
		if (this.settings.estimateGroundPlane || !this.tileManager.pointCloud) {
			intersections = this.raycasterPlane.intersectObject(this.plane)
		} else {
			intersections = this.raycasterPlane.intersectObject(this.tileManager.pointCloud)
		}

		if (intersections.length > 0) {
			// Remember x-z is the horizontal plane, y is the up-down axis
			this.annotationManager.addLaneMarker(intersections[0].point)
		}
	}

	private addTrafficSignAnnotationMarker = (event: MouseEvent): void => {
		if (this.uiState.isAddTrafficSignMarkerKeyPressed === false && this.uiState.isLastTrafficSignMarkerKeyPressed === false) {
			return
		}

		const mouse = this.getMouseCoordinates(event)
		this.raycasterPlane.setFromCamera(mouse, this.camera)
		let intersections = this.raycasterPlane.intersectObject(this.tileManager.pointCloud)

		if (intersections.length > 0) {
			this.annotationManager.addTrafficSignMarker(intersections[0].point, this.uiState.isLastTrafficSignMarkerKeyPressed)
		}
	}

	/**
	 * Check if we clicked an annotation. If so, make it active for editing
	 */
	private checkForAnnotationSelection = (event: MouseEvent): void => {
		if (this.uiState.isLiveMode) return
		if (this.uiState.isControlKeyPressed) return

		const mouse = this.getMouseCoordinates(event)
		this.raycasterMarker.setFromCamera(mouse, this.camera)
		const intersects = this.raycasterMarker.intersectObjects(this.annotationManager.annotationMeshes)

		if (intersects.length > 0) {
			const object = intersects[0].object
			const inactive = this.annotationManager.checkForInactiveAnnotation(object as THREE.Mesh)

			// We clicked an inactive annotation, make it active
			if (inactive) {
				this.cleanTransformControls()
				this.annotationManager.changeActiveAnnotation(inactive)
				if (inactive instanceof Lane)
					this.resetLaneProp()
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
		if (this.uiState.isMouseButtonPressed) {
			return
		}
		if (this.uiState.isControlKeyPressed) return

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

	private checkForSuperTileSelection = (event: MouseEvent): void => {
		if (this.uiState.isLiveMode) return
		if (this.uiState.isMouseButtonPressed) return
		if (this.uiState.isAddMarkerKeyPressed) return
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

		this.camera.aspect = width / height
		this.camera.updateProjectionMatrix()
		this.renderer.setSize(width, height)
	}

	/**
	 * Handle keyboard events
	 */
	private onKeyDown = (event: KeyboardEvent): void => {
		if (this.uiState.isLiveMode)
			this.onKeyDownLiveMode(event)
		else
			this.onKeyDownInteractiveMode(event)
	}

	private onKeyDownLiveMode = (event: KeyboardEvent): void => {
		switch (event.keyCode) {
			case 37: { // left arrow
				this.flythroughSettings.cameraOffset.x += this.flythroughSettings.cameraOffsetDelta
				break
			}
			case 38: { // up arrow
				this.flythroughSettings.cameraOffset.y += this.flythroughSettings.cameraOffsetDelta
				break
			}
			case 39: { // right arrow
				this.flythroughSettings.cameraOffset.x -= this.flythroughSettings.cameraOffsetDelta
				break
			}
			case 40: { // down arrow
				this.flythroughSettings.cameraOffset.y -= this.flythroughSettings.cameraOffsetDelta
				break
			}
			default:
			// nothing to do here
		}
	}

	private onKeyDownInteractiveMode = (event: KeyboardEvent): void => {
		if (event.keyCode >= 49 && event.keyCode <= 57) { // digits 1 to 9
			this.uiState.numberKeyPressed = parseInt(event.key, 10)
		} else {
			switch (event.key) {
				case 'Control': {
					this.uiState.isControlKeyPressed = true
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
				case 'c': {
					this.focusOnPointCloud()
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
				case 'q': {
					this.uiState.isAddTrafficSignMarkerKeyPressed = true
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
				case 'v': {
					this.toggleVoxelsAndPointClouds()
					break
				}
				case 'w': {
					this.uiState.isLastTrafficSignMarkerKeyPressed = true
					break
				}
				case 'z': {
					this.deleteActiveAnnotation()
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
		this.uiState.isAddTrafficSignMarkerKeyPressed = false
		this.uiState.isLastTrafficSignMarkerKeyPressed = false
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

		// If we are controlling the scene don't hide any transform object.
		this.orbitControls.addEventListener('start', () => {
			this.cancelHideTransform()
		})

		// After the scene transformation is over start the timer to hide the transform object.
		this.orbitControls.addEventListener('end', () => {
			this.delayHideTransform()
		})
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
		this.transformControls.addEventListener('change', () => {
			this.cancelHideTransform()
		})

		// If we just clicked on a transform object don't hide it.
		this.transformControls.addEventListener('mouseDown', () => {
			this.cancelHideTransform()
		})

		// If we are done interacting with a transform object start hiding process.
		this.transformControls.addEventListener('mouseUp', () => {
			this.delayHideTransform()
		})

		// If the object attached to the transform object has changed, do something.
		this.transformControls.addEventListener('objectChange', () => {
			this.annotationManager.updateActiveAnnotationMesh()
		})
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
			this.resetLaneProp()
			this.hideTransform()
		}
	}

	private addTrafficSign(): void {
		// Add lane to scene
		if (this.addTrafficSignAnnotation()) {
			log.info("Added new traffic sign annotation")
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

		if (this.tileManager.hasGeometry)
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

	private bind(): void {
		this.bindLanePropertiesPanel()
		this.bindLaneNeighborsPanel()
		this.bindRelationsPanel()
		this.bindTrafficSignPropertiesPanel()

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
	private resetLaneProp(): void  {
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
	private resetTrafficSignProp(): void  {
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
				this.showSuperTiles()
				this.showPointCloud()
				this.showAnnotations()
				break
		}
	}

	private hidePointCloud(): void {
		this.scene.remove(this.tileManager.pointCloud)
		if (this.pointCloudBoundingBox)
			this.scene.remove(this.pointCloudBoundingBox)
		this.uiState.isPointCloudVisible = false
	}

	private showPointCloud(): void {
		this.scene.add(this.tileManager.pointCloud)
		if (this.pointCloudBoundingBox)
			this.scene.add(this.pointCloudBoundingBox)
		this.uiState.isPointCloudVisible = true
	}

	private hideAnnotations(): void {
		// this.annotationManager.hideAnnotations() // todo
		this.uiState.isAnnotationsVisible = false
	}

	private showAnnotations(): void {
		// this.annotationManager.showAnnotations() // todo
		this.uiState.isAnnotationsVisible = true
	}

	private loadCarModel(): Promise<void> {
		return new Promise((resolve: () => void, reject: (reason?: Error) => void): void => {
			try {
				const manager = new THREE.LoadingManager()
				const loader = new (THREE as any).OBJLoader(manager)
				const car = require('../annotator-assets/models/BMW_X5_4.obj')
				loader.load(car, (object: any) => {
					const boundingBox = new THREE.Box3().setFromObject(object)
					const boxSize = boundingBox.getSize().toArray()
					const modelLength = Math.max(...boxSize)
					const carLength = 4.5 // approx in meters
					const scaleFactor = carLength / modelLength
					this.carModel = object
					this.carModel.scale.set(scaleFactor, scaleFactor, scaleFactor)
					this.carModel.visible = false
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

			const state = Models.InertialStateMessage.decode(msg)
			if (
				state.pose &&
				state.pose.x != null && state.pose.y != null && state.pose.z != null &&
				state.pose.q0 != null && state.pose.q1 != null && state.pose.q2 != null && state.pose.q3 != null
			) {
				log.info("Received message: " + state.pose.timestamp)

				// Move the car and the camera
				const position = this.tileManager.utmToThreeJs(state.pose.x, state.pose.y, state.pose.z)

				const rotation = new THREE.Quaternion(state.pose.q0, -state.pose.q1, -state.pose.q2, state.pose.q3)
				rotation.normalize()

				this.updateCarStatus(position)
				this.updateCarPose(position, rotation)
				this.updateCameraPose()
			} else
				log.warn('got an InertialStateMessage without a pose')
		})

		this.liveSubscribeSocket.connect("tcp://localhost:5564")
		this.liveSubscribeSocket.subscribe("")
	}

	/**
	 * Toggle whether or not to listen for live-location updates.
	 * Returns the updated state of live-location mode.
	 */
	private toggleListen(): void {
		let hideMenu
		if (this.uiState.isLiveMode) {
			this.annotationManager.unsetLiveMode()
			hideMenu = this.stopListening()
		} else {
			this.annotationManager.setLiveMode()
			hideMenu = this.listen()
		}
		this.displayMenu(hideMenu ? MenuVisibility.HIDE : MenuVisibility.SHOW)
	}

	private listen(): boolean {
		if (this.uiState.isLiveMode) return this.uiState.isLiveMode

		log.info('Listening for messages...')
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
		this.settings.fpsRendering = this.flythroughSettings.fps
		if (this.flythroughSettings.enabled) {
			this.flythroughSettings.currentPoseIndex = this.flythroughSettings.startPoseIndex
			this.runFlythrough()
		}

		return this.uiState.isLiveMode
	}

	private stopListening(): boolean {
		if (!this.uiState.isLiveMode) return this.uiState.isLiveMode

		log.info('Stopped listening for messages...')
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
		this.statusWindow.setMessage(statusKey.carPosition, '')

		return this.uiState.isLiveMode
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

	private updateCarStatus(positionUtm: THREE.Vector3): void {
		const message = vsprintf('UTM: %.1fE %.1fN %.1falt', positionUtm.toArray())
		this.statusWindow.setMessage(statusKey.carPosition, message)
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
		const offset = this.flythroughSettings.cameraOffset.clone()
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
			this.scene.remove(this.tileManager.pointCloud)
			this.tileManager.voxelsMeshGroup.forEach( mesh => {
				this.scene.add(mesh)
			})
			this.uiState.isPointCloudVisible = false
		} else {
			this.scene.add(this.tileManager.pointCloud)
			this.tileManager.voxelsMeshGroup.forEach( mesh => {
				this.scene.remove(mesh)
			})
			this.uiState.isPointCloudVisible = true
		}
	}
}

export const annotator = new Annotator()
