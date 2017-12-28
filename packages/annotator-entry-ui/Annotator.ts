/**
 *  Copyright 2017 Mapper Inc. Part of the mapper-annotator project.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

const config = require('../config')
import * as $ from 'jquery'
import {TransformControls} from 'annotator-entry-ui/controls/TransformControls'
import {OrbitControls} from 'annotator-entry-ui/controls/OrbitControls'
import {CoordinateFrameType, TileManager}  from 'annotator-entry-ui/TileUtils'
import * as AnnotationUtils from 'annotator-entry-ui/AnnotationUtils'
import {NeighborLocation, NeighborDirection, LaneId} from 'annotator-entry-ui/LaneAnnotation'
import {OutputFormat} from "annotator-entry-ui/AnnotationUtils"
import * as EM from 'annotator-entry-ui/ErrorMessages'
import * as TypeLogger from 'typelogger'
import {getValue} from "typeguard"
import {isUndefined} from "util"
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

enum MenuVisibility {
	HIDE = 0,
	SHOW,
	TOGGLE
}

interface AnnotatorSettings {
	background: string
	cameraOffset: THREE.Vector3
	lightOffset: THREE.Vector3
	fpsRendering: number
}

/**
 * The Annotator class is in charge of rendering the 3d Scene that includes the point clouds
 * and the annotations. It also handles the mouse and keyboard events needed to select
 * and modify the annotations.
 */
class Annotator {
	scene: THREE.Scene
	camera: THREE.PerspectiveCamera
	renderer: THREE.WebGLRenderer
	raycasterPlane: THREE.Raycaster
	raycasterMarker: THREE.Raycaster
	raycasterAnnotation: THREE.Raycaster
	carModel: THREE.Object3D
	tileManager: TileManager
	plane: THREE.Mesh
	grid: THREE.GridHelper
	axis: THREE.AxisHelper
	light: THREE.SpotLight
	stats: Stats
	orbitControls: THREE.OrbitControls
	transformControls: any
	hideTransformControlTimer: NodeJS.Timer
	annotationManager: AnnotationUtils.AnnotationManager
	isAddMarkerKeyPressed: boolean
	isMouseButtonPressed: boolean
	isLiveMode: boolean
	liveSubscribeSocket: Socket
	hovered: THREE.Object3D | null
	settings: AnnotatorSettings
	gui: any

	constructor() {
		this.isAddMarkerKeyPressed = false
		this.isMouseButtonPressed = false

		this.settings = {
			background: "#082839",
			cameraOffset: new THREE.Vector3(10, 30, 10),
			lightOffset: new THREE.Vector3(0, 1500, 200),
			fpsRendering: 60
		}
		this.hovered = null
		// THe raycaster is used to compute where the waypoints will be dropped
		this.raycasterPlane = new THREE.Raycaster()
		this.raycasterPlane.params.Points!.threshold = 0.1
		// THe raycaster is used to compute which marker is active for editing
		this.raycasterMarker = new THREE.Raycaster()
		// THe raycaster is used to compute which selection should be active for editing
		this.raycasterAnnotation = new THREE.Raycaster()
		// Initialize super tile that will load the point clouds
		this.tileManager = new TileManager()

		this.isLiveMode = false

		// Initialize socket for use when "live mode" operation is on
		this.initClient()
	}

	/**
	 * Create the 3D Scene and add some basic objects. It also initializes
	 * several event listeners.
	 */
	initScene(): void {
		const self = this
		log.info(`Building scene`)

		const [width, height]: Array<number> = this.getContainerSize()

		// Create scene and camera
		this.scene = new THREE.Scene()
		this.camera = new THREE.PerspectiveCamera(70, width / height, 0.1, 10010)
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
		this.grid.position.y = -0.5
		this.grid.material.opacity = 0.25
		this.grid.material.transparent = true
		this.scene.add(this.grid)
		this.axis = new THREE.AxisHelper(1)
		this.scene.add(this.axis)

		// Init empty annotation. This will have to be changed
		// to work in response to a menu, panel or keyboard event.
		this.annotationManager = new AnnotationUtils.AnnotationManager()

		// Create GL Renderer
		this.renderer = new THREE.WebGLRenderer({antialias: true})
		this.renderer.setClearColor(new THREE.Color(this.settings.background))
		this.renderer.setPixelRatio(window.devicePixelRatio)
		this.renderer.setSize(width, height)
		this.renderer.shadowMap.enabled = true

		// Create stats widget to display frequency of rendering
		this.stats = new statsModule()
		root.append(this.renderer.domElement)
		root.append(this.stats.dom)

		// Initialize all control objects.
		this.initOrbitControls()
		this.initTransformControls()

		// Move everything into position.
		this.setStage(0, 0, 0)

		// Add panel to change the settings
		this.gui = new datModule.GUI()
		this.gui.addColor(this.settings, 'background').onChange((value: any) => {
			this.renderer.setClearColor(new THREE.Color(value))
		})
		this.gui.domElement.className = 'threeJs_gui'

		// Set up for auto-save
		const body = $(document.body)
		body.focusin((): void => {
			self.annotationManager.enableAutoSave()
		})
		body.focusout((): void => {
			self.annotationManager.disableAutoSave()
		})

		// Add listeners
		window.addEventListener('beforeunload', this.onBeforeunload)
		window.addEventListener('resize', this.onWindowResize)
		window.addEventListener('keydown', this.onKeyDown)
		window.addEventListener('keyup', this.onKeyUp)

		this.renderer.domElement.addEventListener('mousemove', this.checkForActiveMarker)
		this.renderer.domElement.addEventListener('mouseup', this.addLaneAnnotationMarker)
		this.renderer.domElement.addEventListener('mouseup', this.checkForAnnotationSelection)
		this.renderer.domElement.addEventListener('mouseup', () => {
			this.isMouseButtonPressed = false
		})
		this.renderer.domElement.addEventListener('mousedown', () => {
			this.isMouseButtonPressed = true
		})

		this.loadCarModel()

		// Bind events
		this.bind()
		Annotator.deactivateLaneProp()

		this.displayMenu(config.get('startup.show_menu') ? MenuVisibility.SHOW : MenuVisibility.HIDE)

		const pointCloudDir = config.get('startup.point_cloud_directory')
		if (pointCloudDir) {
			log.info('loading pre-configured data set ' + pointCloudDir)
			this.loadPointCloudData(pointCloudDir)
				.catch(err => log.warn('loadFromFile failed: ' + err.message))
		}
	}

	/**
	 * Start THREE.js rendering loop.
	 */
	animate = (): void => {
		setTimeout(() => {
			requestAnimationFrame(this.animate)
		}, 1000 / this.settings.fpsRendering)

		this.render()
		this.stats.update()
		this.orbitControls.update()
		this.transformControls.update()
	}

	/**
	 * Render the THREE.js scene from the camera's position.
	 */
	render = (): void => {
		this.renderer.render(this.scene, this.camera)
	}

	/**
	 * Move all visible elements into position, centered on a coordinate.
	 */
	private setStage(x: number, y: number, z: number): void {
		this.axis.geometry.center()
		this.axis.geometry.translate(x, y, z)
		this.plane.geometry.center()
		this.plane.geometry.translate(x, y, z)
		this.grid.geometry.center()
		this.grid.geometry.translate(x, y, z)
		this.grid.position.y -= 0.01
		this.light.position.set(x + this.settings.lightOffset.x, y + this.settings.lightOffset.y, z + this.settings.lightOffset.z)
		this.camera.position.set(x + this.settings.cameraOffset.x, y + this.settings.cameraOffset.y, z + this.settings.cameraOffset.z)
		this.orbitControls.target.set(x, y, z)
	}

	/**
	 * Set some point as the center of the visible world.
	 */
	private setStageByVector(point: THREE.Vector3): void {
		this.setStage(point.x, point.y, point.z)
	}

	/**
	 * Set the point cloud as the center of the visible world.
	 */
	private focusOnPointCloud(): void {
		const center = this.tileManager.centerPoint()
		if (center) this.setStageByVector(center)
		else log.warn('point cloud has not been initialized')
	}

	/**
	 * Given a path to a directory that contains point cloud tiles, load them and add them to the scene.
	 * Center the stage and the camera on the point cloud.
	 */
	loadPointCloudData(pathToTiles: string): Promise<void> {
		log.info('loading dataset')
		return this.tileManager.loadFromDataset(pathToTiles, CoordinateFrameType.CAMERA)
			.then(focalPoint => {
				if (!this.annotationManager.setOriginWithInterface(this.tileManager)) {
					log.warn(`annotations origin ${this.annotationManager.getOrigin()} does not match tile's origin ${this.tileManager.getOrigin()}`)
				}
				this.scene.add(this.tileManager.pointCloud)
				if (focalPoint)
					this.setStageByVector(focalPoint)
			})
	}

	unloadPointCloudData(): void {
		log.info("unloadPointCloudData")
		this.tileManager.unloadAllPoints()
	}

	/**
	 * Load annotations from file. Add all annotations to the annotation manager
	 * and to the scene.
	 * Center the stage and the camera on the annotations model.
	 */
	async loadAnnotations(fileName: string): Promise<void> {
		try {
			log.info('Loading annotations')
			const focalPoint = await this.annotationManager.loadAnnotationsFromFile(fileName, this.scene)
			if (!this.tileManager.setOriginWithInterface(this.annotationManager)) {
				log.warn(`annotations origin ${this.annotationManager.getOrigin()} does not match tiles origin ${this.tileManager.getOrigin()}`)
			}
			if (focalPoint) this.setStageByVector(focalPoint)
		} catch (err) {
			log.warn(err.message)
			dialog.showErrorBox("Annotation Load Error",
				"Annotator failed to load annotation file.")
		}
	}

	/**
	 * Create a new lane annotation.
	 */
	private addLaneAnnotation(): boolean {
		if (this.annotationManager.activeAnnotationIndex >= 0 &&
			this.annotationManager.activeMarkers.length === 0) {
			return false
		}
		// This creates a new lane and add it to the scene for display
		return !!(
			this.annotationManager.addLaneAnnotation(this.scene) &&
			this.annotationManager.makeLastAnnotationActive()
		)
	}

	private getMouseCoordinates = (event: MouseEvent): THREE.Vector2 => {
		const mouse = new THREE.Vector2()
		mouse.x = ( event.clientX / this.renderer.domElement.clientWidth ) * 2 - 1
		mouse.y = -( event.clientY / this.renderer.domElement.clientHeight ) * 2 + 1
		return mouse
	}

	/**
	 * Used in combination with "keyA". If the mouse was clicked while pressing
	 * the "a" key, drop a lane marker.
	 */
	private addLaneAnnotationMarker = (event: MouseEvent): void => {
		if (this.isAddMarkerKeyPressed === false) {
			return
		}

		const mouse = this.getMouseCoordinates(event)
		this.raycasterPlane.setFromCamera(mouse, this.camera)
		let intersections

		if (this.tileManager.pointCloud === null) {
			intersections = this.raycasterPlane.intersectObject(this.plane)
		} else {
			intersections = this.raycasterPlane.intersectObject(this.tileManager.pointCloud)
		}

		if (intersections.length > 0) {
			// Remember x-z is the horizontal plane, y is the up-down axis
			const x = intersections[0].point.x
			const y = intersections[0].point.y
			const z = intersections[0].point.z
			this.annotationManager.addLaneMarker(x, y, z)
		}
	}

	/**
	 * Check if we clicked an annotation. If so, make it active for editing
	 */
	private checkForAnnotationSelection = (event: MouseEvent): void => {
		if (this.isLiveMode) return

		const mouse = this.getMouseCoordinates(event)
		this.raycasterAnnotation.setFromCamera(mouse, this.camera)
		const intersects = this.raycasterMarker.intersectObjects(this.annotationManager.annotationMeshes)

		if (intersects.length > 0) {
			const object = intersects[0].object
			const index = this.annotationManager.checkForInactiveAnnotation(object as any)

			// We clicked an inactive annotation, make it active
			if (index >= 0) {
				this.annotationManager.changeActiveAnnotation(index)
				this.resetLaneProp()
			}
		}
	}

	/**
	 * Check if the mouse is on top of an editable lane marker. If so, attach the
	 * marker to the transform control for editing.
	 */
	private checkForActiveMarker = (event: MouseEvent) => {
		// If the mouse is down we might be dragging a marker so avoid
		// picking another marker
		if (this.isMouseButtonPressed) {
			return
		}
		const mouse = this.getMouseCoordinates(event)

		this.raycasterMarker.setFromCamera(mouse, this.camera)

		const intersects = this.raycasterMarker.intersectObjects(this.annotationManager.activeMarkers)

		if (intersects.length > 0) {
			const object = intersects[0].object
			const plane = new THREE.Plane()
			plane.setFromNormalAndCoplanarPoint(this.camera.getWorldDirection(plane.normal), object.position)

			if (this.hovered !== object) {
				this.renderer.domElement.style.cursor = 'pointer'
				this.hovered = object
				// HOVER ON
				this.transformControls.attach(this.hovered)
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

	/*
	 * Make a best effort to save annotations before exiting. There is no guarantee the
	 * promise will complete, but it seems to work in practice.
	 */
	private onBeforeunload: (e: BeforeUnloadEvent) => void = (_: BeforeUnloadEvent) => {
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
		switch (event.code) {
			case 'KeyA': {
				this.isAddMarkerKeyPressed = true
				break
			}
			case 'KeyC': {
				this.focusOnPointCloud()
				break
			}
			case 'KeyD': {
				log.info("Deleting last marker")
				if (this.annotationManager.deleteLastLaneMarker())
					this.hideTransform()
				break
			}
			case 'KeyN': {
				this.addLane()
				break
			}
			case 'KeyZ': {
				this.deleteLane()
				break
			}
			case 'KeyF': {
				this.addFront()
				break
			}
			case 'KeyL': {
				this.addLeftSame()
				break
			}
			case 'KeyK': {
				this.addLeftReverse()
				break
			}
			case 'KeyR': {
				this.addRightSame()
				break
			}
			case 'KeyE': {
				this.addRightReverse()
				break
			}
			case 'KeyS': {
				this.saveToFile()
				break
			}
			case 'KeyM': {
				this.annotationManager.saveToKML(config.get('output.annotations.kml.path'))
					.catch(err => log.warn('saveToKML failed: ' + err.message))
				break
			}
			case 'KeyO': {
				this.toggleListen()
				break
			}
			case 'KeyU': {
				this.unloadPointCloudData()
				break
			}
			default:
				// nothing to see here
		}
	}

	private onKeyUp = (): void => {
		this.isAddMarkerKeyPressed = false
	}

	private saveAnnotations(): Promise<void> {
		return this.annotationManager.saveAnnotationsToFile(config.get('output.annotations.json.path'), OutputFormat.UTM)
	}

	private exportAnnotationsToKml(): Promise<void> {
		const jar = config.get('conversion.kml.jar')
		const main = config.get('conversion.kml.main_class')
		let input = config.get('conversion.kml.input.path')
		let output = config.get('conversion.kml.output.path')
		if (!jar || !main || !input || !output) {
			return Promise.reject("incomplete configuration for KML conversion; aborting")
		} else {
			if (!(input.substr(0, 1) === '/'))
				input = process.env.PWD + '/' + input
			if (!(output.substr(0, 1) === '/'))
				output = process.env.PWD + '/' + output
			return this.annotationManager.saveAndExportToKml(jar, main, input, output)
		}
	}

	private delayHideTransform = (): void => {
		this.cancelHideTransform()
		this.hideTransform()
	}

	private hideTransform = (): void => {
		this.hideTransformControlTimer = setTimeout(() => {
			this.transformControls.detach(this.transformControls.object)
		}, 1500)
	}

	private cancelHideTransform = (): void => {
		if (this.hideTransformControlTimer) {
			clearTimeout(this.hideTransformControlTimer)
		}
	}

	/**
	 * Create orbit controls which enable translation, rotation and zooming of the scene.
	 */
	private initOrbitControls(): void {
		this.orbitControls = new OrbitControls(this.camera, this.renderer.domElement)
		this.orbitControls.minDistance = -Infinity

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
		this.transformControls = new TransformControls(this.camera, this.renderer.domElement)
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
			this.annotationManager.updateActiveLaneMesh()
		})
	}

	/**
	 * Functions to bind
	 */
	deleteLane(): void {
		// Delete lane from scene
		if (this.annotationManager.deleteLaneFromPath() && this.annotationManager.deleteActiveAnnotation(this.scene)) {
			log.info("Deleted selected annotation")
			Annotator.deactivateLaneProp()
			this.hideTransform()
		}
	}

	addLane(): void {
		// Add lane to scene
		if (this.addLaneAnnotation()) {
			log.info("Added new annotation")
			this.resetLaneProp()
			this.hideTransform()
		}
	}

	saveToFile(): void {
		log.info("Saving annotations to JSON")
		this.saveAnnotations()
			.catch(error => log.warn("save to file failed: " + error.message))
	}

	exportKml(): void {
		log.info("Exporting annotations to KML")
		this.exportAnnotationsToKml()
			.catch(error => log.warn("export to KML failed: " + error.message))
	}

	loadFromFile(): Promise<void> {
		const pathElectron = dialog.showOpenDialog({
			properties: ['openDirectory']
		})

		if (!(pathElectron && pathElectron[0]))
			return Promise.resolve()

		log.info('Loading point cloud from ' + pathElectron[0])
		return this.loadPointCloudData(pathElectron[0])
	}

	addFront(): void {
		log.info("Adding connected annotation to the front")
		if (this.annotationManager.addConnectedLaneAnnotation(this.scene, NeighborLocation.FRONT, NeighborDirection.SAME)) {
			Annotator.deactivateFrontSideNeighbours()
		}
	}

	addLeftSame(): void {
		log.info("Adding connected annotation to the left - same direction")
		if (this.annotationManager.addConnectedLaneAnnotation(this.scene, NeighborLocation.LEFT, NeighborDirection.SAME)) {
			Annotator.deactivateLeftSideNeighbours()
		}
	}

	addLeftReverse(): void {
		log.info("Adding connected annotation to the left - reverse direction")
		if (this.annotationManager.addConnectedLaneAnnotation(this.scene, NeighborLocation.LEFT, NeighborDirection.REVERSE)) {
			Annotator.deactivateLeftSideNeighbours()
		}
	}

	addRightSame(): void {
		log.info("Adding connected annotation to the right - same direction")
		if (this.annotationManager.addConnectedLaneAnnotation(this.scene, NeighborLocation.RIGHT, NeighborDirection.SAME)) {
			Annotator.deactivateRightSideNeighbours()
		}
	}

	addRightReverse(): void {
		log.info("Adding connected annotation to the right - reverse direction")
		if (this.annotationManager.addConnectedLaneAnnotation(this.scene, NeighborLocation.RIGHT, NeighborDirection.REVERSE)) {
			Annotator.deactivateRightSideNeighbours()
		}
	}

	/**
	 * Bind functions events to interface elements
	 */
	private bind(): void {
		const menuButton = document.getElementById('menu_control_btn')
		if (menuButton)
			menuButton.addEventListener('click', _ => {
				if (this.isLiveMode) {
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
			liveLocationControlButton.addEventListener('click', _ => {
				this.toggleListen()
			})
		else
			log.warn('missing element live_location_control_btn')

		const toolsDelete = document.getElementById('tools_delete')
		if (toolsDelete)
			toolsDelete.addEventListener('click', _ => {
				this.deleteLane()
			})
		else
			log.warn('missing element tools_delete')

		const toolsAdd = document.getElementById('tools_add')
		if (toolsAdd)
			toolsAdd.addEventListener('click', _ => {
				this.addLane()
			})
		else
			log.warn('missing element tools_add')

		const toolsLoad = document.getElementById('tools_load')
		if (toolsLoad)
			toolsLoad.addEventListener('click', _ => {
				this.loadFromFile()
					.catch(err => log.warn('loadFromFile failed: ' + err.message))
			})
		else
			log.warn('missing element tools_load')

		const toolsLoadAnnotation = document.getElementById('tools_load_annotation')
		if (toolsLoadAnnotation)
			toolsLoadAnnotation.addEventListener('click', _ => {
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
			toolsSave.addEventListener('click', _ => {
				this.saveToFile()
			})
		else
			log.warn('missing element tools_save')

		const toolsExportKml = document.getElementById('tools_export_kml')
		if (toolsExportKml)
			toolsExportKml.addEventListener('click', _ => {
				this.exportKml()
			})
		else
			log.warn('missing element tools_export_kml')

		const lpAddLeftOpposite = document.getElementById('lp_add_left_opposite')
		if (lpAddLeftOpposite)
			lpAddLeftOpposite.addEventListener('click', _ => {
				this.addLeftReverse()
			})
		else
			log.warn('missing element lp_add_left_opposite')

		const lpAddLeftSame = document.getElementById('lp_add_left_same')
		if (lpAddLeftSame)
			lpAddLeftSame.addEventListener('click', _ => {
				this.addLeftSame()
			})
		else
			log.warn('missing element lp_add_left_same')

		const lpAddRightOpposite = document.getElementById('lp_add_right_opposite')
		if (lpAddRightOpposite)
			lpAddRightOpposite.addEventListener('click', _ => {
				this.addRightReverse()
			})
		else
			log.warn('missing element lp_add_right_opposite')

		const lpAddRightSame = document.getElementById('lp_add_right_same')
		if (lpAddRightSame)
			lpAddRightSame.addEventListener('click', _ => {
				this.addRightSame()
			})
		else
			log.warn('missing element lp_add_right_same')

		const lpAddFront = document.getElementById('lp_add_forward')
		if (lpAddFront)
			lpAddFront.addEventListener('click', _ => {
				this.addFront()
			})
		else
			log.warn('missing element lp_add_forward')

		const lcSelectFrom = document.getElementById('lc_select_from')
		if (lcSelectFrom)
			lcSelectFrom.addEventListener('mousedown', _ => {
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
			lcSelectTo.addEventListener('mousedown', _ => {
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
			lcAdd.addEventListener('click', _ => {
				const lcTo: LaneId = Number($('#lc_select_to').val())
				const lcFrom: LaneId = Number($('#lc_select_from').val())
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
				if (this.annotationManager.addRelation(this.scene, lcFrom, lcTo, lcRelation)) {
					this.resetLaneProp()
				}
			})
		else
			log.warn('missing element lc_add')

		const lcLeft = $('#lp_select_left')
		lcLeft.on('change', _ => {
			const activeAnnotation = this.annotationManager.getActiveAnnotation()
			if (activeAnnotation === null)
				return
			log.info("Adding left side type: " + lcLeft.children("option").filter(":selected").text())
			activeAnnotation.leftSideType = lcLeft.val()
		})

		const lcRight = $('#lp_select_right')
		lcRight.on('change', _ => {
			const activeAnnotation = this.annotationManager.getActiveAnnotation()
			if (activeAnnotation === null)
				return
			log.info("Adding right side type: " + lcRight.children("option").filter(":selected").text())
			activeAnnotation.rightSideType = lcRight.val()
		})

		const lcEntry = $('#lp_select_entry')
		lcEntry.on('change', _ => {
			const activeAnnotation = this.annotationManager.getActiveAnnotation()
			if (activeAnnotation === null)
				return
			log.info("Adding entry type: " + lcEntry.children("option").filter(":selected").text())
			activeAnnotation.entryType = lcEntry.val()
		})

		const lcExit = $('#lp_select_exit')
		lcExit.on('change', _ => {
			const activeAnnotation = this.annotationManager.getActiveAnnotation()
			if (activeAnnotation === null)
				return
			log.info("Adding exit type: " + lcExit.children("option").filter(":selected").text())
			activeAnnotation.exitType = lcExit.val()
		})

		const trAdd = $('#tr_add')
		trAdd.on('click', _ => {
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
		trShow.on('click', _ => {
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
		savePath.on('click', _ => {
			log.info("Save car path to file.")
			this.annotationManager.saveCarPath(config.get('output.trajectory.csv.path'))
		})
	}

	/**
	 * Reset lane properties elements based on the current active lane
	 */
	private resetLaneProp(): void {
		const activeAnnotation = this.annotationManager.getActiveAnnotation()
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

		const lpSelectLeft = $('#lp_select_left')
		lpSelectLeft.removeAttr('disabled')
		lpSelectLeft.val(activeAnnotation.leftSideType.toString())

		const lpAddRelation = $('#lc_add')
		lpAddRelation.removeAttr('disabled')

		const lpSelectRight = $('#lp_select_right')
		lpSelectRight.removeAttr('disabled')
		lpSelectRight.val(activeAnnotation.rightSideType.toString())

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

	private loadCarModel(): void {
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
			this.carModel.rotateY(1.5708)
			this.carModel.visible = false
			this.scene.add(object)
		})
	}

	initClient(): void {
		this.liveSubscribeSocket = zmq.socket('sub')

		this.liveSubscribeSocket.on('message', (msg) => {
			if (!this.isLiveMode) return

			const state = Models.InertialStateMessage.decode(msg)
			if (
				state.pose &&
				state.pose.x != null && state.pose.y != null && state.pose.z != null &&
				state.pose.q0 != null && state.pose.q1 != null && state.pose.q2 != null && state.pose.q3 != null
			) {
				log.info("Received message: " + state.pose.timestamp)

				// Move the car and the camera
				const position = this.tileManager.utmToThreeJs(state.pose.x, state.pose.y, state.pose.z)
				log.info(state.pose.x + " " + position.x)

				const rotation = new THREE.Quaternion(state.pose.q0, -state.pose.q1, -state.pose.q2, state.pose.q3)
				rotation.normalize()
				this.updateCarPose(position, rotation)
				this.updateCameraPose()
			} else
				log.warn('got an InertialStateMessage without a pose')
		})

		this.liveSubscribeSocket.connect("ipc:///tmp/InertialState")
		this.liveSubscribeSocket.subscribe("")
	}

	/**
	 * Toggle whether or not to listen for live-location updates.
	 * Returns the updated state of live-location mode.
	 */
	toggleListen(): void {
		let hideMenu
		if (this.isLiveMode) {
			this.annotationManager.unsetLiveMode()
			hideMenu = this.stopListening()
		} else {
			this.annotationManager.setLiveMode()
			hideMenu = this.listen()
		}
		this.displayMenu(hideMenu ? MenuVisibility.HIDE : MenuVisibility.SHOW)
	}

	listen(): boolean {
		if (this.isLiveMode) return this.isLiveMode

		log.info('Listening for messages...')
		this.isLiveMode = true
		this.plane.visible = false
		this.grid.visible = false
		this.orbitControls.enabled = false
		this.camera.matrixAutoUpdate = false
		this.carModel.visible = true
		this.settings.fpsRendering = 30
		return this.isLiveMode
	}

	stopListening(): boolean {
		if (!this.isLiveMode) return this.isLiveMode

		log.info('Stopped listening for messages...')
		this.isLiveMode = false
		this.plane.visible = true
		this.grid.visible = true
		this.orbitControls.enabled = true
		this.camera.matrixAutoUpdate = true
		this.carModel.visible = false
		this.settings.fpsRendering = 60
		return this.isLiveMode
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

	private updateCarPose(position: THREE.Vector3, rotation: THREE.Quaternion): void {
		this.carModel.position.set(position.x, position.y, position.z)
		this.carModel.setRotationFromQuaternion(rotation)
		// This is because the car model is rotated 90 degrees
		this.carModel.rotateY(-1.5708)
		// Bring the model close to the ground (approx height of the sensors)
		const p = this.carModel.getWorldPosition()
		this.carModel.position.set(p.x, 0, p.z)
	}

	private updateCameraPose(): void {
		const p = this.carModel.getWorldPosition()
		const offset = new THREE.Vector3(20, 15, 0)
		offset.applyQuaternion(this.carModel.quaternion)
		offset.add(p)
		log.info(p.x)
		this.camera.position.set(offset.x, offset.y, offset.z)
		this.camera.lookAt(p)
		this.camera.updateMatrix()
	}

}

export const annotator = new Annotator()
