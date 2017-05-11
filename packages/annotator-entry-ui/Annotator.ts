/**
 *  Copyright 2017 Mapper Inc. Part of the mapper-annotator project.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

const config = require('../config')
import * as $ from 'jquery'
import * as AsyncFile from 'async-file'
import {TransformControls} from 'annotator-entry-ui/controls/TransformControls'
import {OrbitControls} from 'annotator-entry-ui/controls/OrbitControls'
import {SuperTile}  from 'annotator-entry-ui/TileUtils'
import * as AnnotationUtils from 'annotator-entry-ui/AnnotationUtils'
import {NeighborLocation, NeighborDirection} from 'annotator-entry-ui/LaneAnnotation'
import * as EM from 'annotator-entry-ui/ErrorMessages'
import * as TypeLogger from 'typelogger'
import {getValue} from "typeguard"
import {isUndefined} from "util"
import * as MapperProtos from '@mapperai/mapper-models'
import Models = MapperProtos.com.mapperai.models

let THREE = require('three')
const statsModule = require("stats.js")
const datModule = require("dat.gui/build/dat.gui")
const {dialog} = require('electron').remote
const zmq = require('zmq')
const OBJLoader = require("three-obj-loader")
OBJLoader(THREE)

TypeLogger.setLoggerOutput(console as any)
const log = TypeLogger.getLogger(__filename)
let root = $("#root")

/**
 * The Annotator class is in charge of rendering the 3d Scene that includes the point clouds
 * and the annotations. It also handles the mouse and keyboard events needed to select
 * and modify the annotations.
 */
class Annotator {
	scene : THREE.Scene
	camera : THREE.PerspectiveCamera
	renderer : THREE.WebGLRenderer
	raycaster_plane : THREE.Raycaster
	raycaster_marker : THREE.Raycaster
	raycaster_annotation : THREE.Raycaster
	carModel: THREE.Object3D
	mapTile : SuperTile
	plane : THREE.Mesh
	stats
	orbitControls
	transformControls
	hideTransformControlTimer
	annotationManager : AnnotationUtils.AnnotationManager
	isAddMarkerKeyPressed : boolean
	isMouseButtonPressed : boolean
	liveSubscribeSocket
	hovered
	settings
	gui
	usePlane
	
	constructor() {
		this.isAddMarkerKeyPressed = false
		this.isMouseButtonPressed = false
		
		this.settings = {
			background: "#082839"
		}
		this.hovered = null
		// THe raycaster is used to compute where the waypoints will be dropped
		this.raycaster_plane = new THREE.Raycaster()
		// THe raycaster is used to compute which marker is active for editing
		this.raycaster_marker = new THREE.Raycaster()
		// THe raycaster is used to compute which selection should be active for editing
		this.raycaster_annotation = new THREE.Raycaster()
		
		this.mapTile = new SuperTile()
		
		this.usePlane = true
		
		this.liveSubscribeSocket = zmq.socket('sub')
	}
	
	/**
	 * Create the 3D Scene and add some basic objects. It also initializes
	 * several event listeners.
	 */
	initScene() {
		const self = this
		log.info(`Building scene`)

		const [width,height] = this.getContainerSize()
	
		// Create scene and camera
		this.scene = new THREE.Scene()
		this.camera = new THREE.PerspectiveCamera(70, width/height, 0.1, 10010)
		this.camera.position.z = 10
		this.camera.position.y = 30
		this.scene.add(this.camera)
	
		// Add some lights
		this.scene.add(new THREE.AmbientLight( 0xf0f0f0 ))
		let light = new THREE.SpotLight(0xffffff, 1.5)
		light.position.set(0, 1500, 200)
		light.castShadow = true;
		light.shadow = new THREE.SpotLightShadow(new THREE.PerspectiveCamera(70,1,200,2000))
		light.shadow.mapSize.width = 1024
		light.shadow.bias = -0.000222
		light.shadow.mapSize.height = 1024
		this.scene.add(light)
	
		// Add a "ground plane" to facilitate annotations
		let planeGeometry = new THREE.PlaneGeometry(2000, 2000)
		planeGeometry.rotateX(-Math.PI/2)
		let planeMaterial = new THREE.ShadowMaterial()
		planeMaterial.opacity = 0.2
		this.plane = new THREE.Mesh(planeGeometry, planeMaterial)
		this.plane.receiveShadow = true
		this.scene.add(this.plane)
	
		// Add grid on top of the plane
		let grid = new THREE.GridHelper(2000, 1000);
		grid.position.y = -0.01;
		grid.material.opacity = 0.25;
		grid.material.transparent = true;
		this.scene.add( grid );
		let axis = new THREE.AxisHelper(1);
		this.scene.add( axis );
		
		// Init empty annotation. This will have to be changed
		// to work in response to a menu, panel or keyboard event.
		this.annotationManager = new AnnotationUtils.AnnotationManager()
	
		// Create GL Renderer
		this.renderer = new THREE.WebGLRenderer( {antialias: true} )
		this.renderer.setClearColor( new THREE.Color(this.settings.background) )
		this.renderer.setPixelRatio( window.devicePixelRatio )
		this.renderer.setSize( width, height )
		this.renderer.shadowMap.enabled = true
	
		// Create stats widget to display frequency of rendering
		this.stats = new statsModule()
		root.append( this.renderer.domElement )
		root.append( this.stats.dom );
		
		// Initialize all control objects.
		this.initOrbitControls()
		this.initTransformControls()
		
		// Add panel to change the settings
		this.gui = new datModule.GUI()
		this.gui.addColor(this.settings, 'background').onChange( (value) => {
			this.renderer.setClearColor(new THREE.Color(value))
		})
		this.gui.domElement.className = 'threeJs_gui'

		// Set up for auto-save
		const body = $(document.body)
		body.focusin(function () {self.annotationManager.enableAutoSave()})
		body.focusout(function () {self.annotationManager.disableAutoSave()})

		// Add listeners
		window.addEventListener('resize', this.onWindowResize);
		window.addEventListener('keydown',this.onKeyDown)
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
		this.bind();
		this.deactivateLaneProp();
	}
	
	/**
	 * Start THREE.js rendering loop.
	 */
	animate = () => {
		requestAnimationFrame(this.animate)
		this.render()
		this.stats.update()
		this.orbitControls.update()
		this.transformControls.update()
	}
	
	/**
	 * Render the THREE.js scene from the camera's position.
	 */
	render = () => {
		this.renderer.render(this.scene, this.camera)
	}

	/**
	 * Given a path to a directory that contains point cloud tiles, load them and add them to the scene.
	 * @param pathToTiles
	 * @returns {Promise<void>}
	 */
	async loadPointCloudData(pathToTiles : string) {
		try {
			log.info('loading dataset')
			await this.mapTile.loadFromDataset(pathToTiles)
			this.scene.add(this.mapTile.pointCloud)
		} catch (err) {
			dialog.showErrorBox("Tiles Load Error",
				"Annotator failed to load tiles from given folder.")
		}
	}
	
	/**
	 * Load annotations from file. Add all annotations to the annotation manager
	 * and to the scene
	 * @param filename
	 * @returns {Promise<void>}
	 */
	async loadAnnotations(filename : string) {
		try {
			log.info('Loading annotations')
			let buffer = await AsyncFile.readFile(filename, 'ascii')
			let data = JSON.parse(buffer as any)
			
			// Each element is an annotation
			data.forEach( (element) => {
				this.annotationManager.addLaneAnnotation(this.scene, element)
			})
			
		} catch (err) {
			dialog.showErrorBox("Annotation Load Error",
				"Annotator failed to load annotation file.")
		}
	}
	
	/**
	 * Create a new lane annotation.
	 */
	private addLaneAnnotation() {
		if (this.annotationManager.activeAnnotationIndex >=0 &&
			this.annotationManager.activeMarkers.length === 0) {
			return
		}
		// This creates a new lane and add it to the scene for display
		this.annotationManager.addLaneAnnotation(this.scene)
		this.annotationManager.makeLastAnnotationActive()
	}
	
	private getMouseCoordinates = (event) : THREE.Vector2 => {
		let mouse = new THREE.Vector2()
		mouse.x = ( event.clientX / this.renderer.domElement.clientWidth ) * 2 - 1
		mouse.y = - ( event.clientY / this.renderer.domElement.clientHeight ) * 2 + 1
		return mouse
	}
	
	/**
	 * Used in combination with "keyA". If the mouse was clicked while pressing
	 * the "a" key, drop a lane marker.
	 * @param event
	 */
	private addLaneAnnotationMarker = (event) => {
		if (this.isAddMarkerKeyPressed === false) {
			return
		}
		
		let mouse = this.getMouseCoordinates(event)
		this.raycaster_plane.setFromCamera(mouse, this.camera)
		let intersections
		
		if (this.usePlane) {
			intersections = this.raycaster_plane.intersectObject(this.plane)
		} else {
			intersections = this.raycaster_plane.intersectObject(this.mapTile.pointCloud)
		}
		
		if (intersections.length > 0) {
			// Remember x-z is the horizontal plane, y is the up-down axis
			let x = intersections[0].point.x
			let y = intersections[0].point.y
			let z = intersections[0].point.z
			this.annotationManager.addLaneMarker(x,y,z)
		}
	}
	
	/**
	 * Check if we clicked an annotation. If so, make it active for editing
	 * @param event
	 */
	private checkForAnnotationSelection = (event) => {
		let mouse = this.getMouseCoordinates(event)
		this.raycaster_annotation.setFromCamera( mouse, this.camera )
		let intersects = this.raycaster_marker.intersectObjects( this.annotationManager.annotationMeshes)
		
		if ( intersects.length > 0 ) {
			let object = intersects[ 0 ].object
			let index = this.annotationManager.checkForInactiveAnnotation(object as any)
			
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
	 * @param event
	 */
	private checkForActiveMarker = ( event ) => {
		// If the mouse is down we might be dragging a marker so avoid
		// picking another marker
		if (this.isMouseButtonPressed) {
			return
		}
		let mouse = this.getMouseCoordinates(event)
		
		this.raycaster_marker.setFromCamera( mouse, this.camera )
		
		let intersects = this.raycaster_marker.intersectObjects( this.annotationManager.activeMarkers )
		
		if ( intersects.length > 0 ) {
			let object = intersects[ 0 ].object
			let plane = new THREE.Plane()
			plane.setFromNormalAndCoplanarPoint( this.camera.getWorldDirection( plane.normal ), object.position )
			
			if ( this.hovered !== object ) {
				this.renderer.domElement.style.cursor = 'pointer'
				this.hovered = object;
				// HOVER ON
				this.transformControls.attach( this.hovered )
				this.cancelHideTransform()
			}
			
		} else {
			if ( this.hovered !== null ) {
				// HOVER OFF
				this.renderer.domElement.style.cursor = 'auto'
				this.hovered = null
				this.delayHideTransform()
			}
		}
	}
	
	/**
	 * Get the size of the canvas
	 * @returns {[number,number]}
	 */
	private getContainerSize = () => {
		return getValue(() => [root.width(),root.height()],[0,0])
	}
	
	private onWindowResize = () => {
		if (!this.camera) {
			return
		}
	
		const [width,height] = this.getContainerSize()
	
		this.camera.aspect = width / height
		this.camera.updateProjectionMatrix()
		this.renderer.setSize( width , height )
	}
	
	/**
	 * Handle keyboard events
	 * @param event
	 */
	private onKeyDown = (event) => {
		if (event.code === 'KeyA') {
			this.isAddMarkerKeyPressed = true
		}
		
		if (event.code === 'KeyD') {
			log.info("Deleting last marker")
			this.annotationManager.deleteLastLaneMarker()
			this.hideTransform()
		}
		
		if (event.code === 'KeyN') {
			this.addLane();
		}
		
		if (event.code === 'KeyZ') {
			this.deleteLane();
		}
		
		if (event.code === "KeyF") {
			this.addFront();
		}
		
		if (event.code === "KeyL") {
			this.addLeftSame();
		}
		
		if (event.code === "KeyK") {
			this.addLeftReverse();
		}
		
		if (event.code === "KeyR") {
			this.addRightSame();
		}
		
		if (event.code === "KeyE") {
			this.addRightReverse();
		}
		
		if (event.code === "KeyS") {
			this.saveToFile();
		}
		
		if (event.code === 'KeyM') {
			this.annotationManager.saveToKML(config.get('output.kml.path'), this.mapTile)
		}
	}
	
	private onKeyUp = () => {
		this.isAddMarkerKeyPressed = false
	}
	
	private async saveAnnotations() {
		await this.annotationManager.saveAnnotationsToFile(config.get('output.json.path'))
	}

	private async exportAnnotationsToKml() {
		const jar = config.get('conversion.kml.jar')
		const main = config.get('conversion.kml.main_class')
		let input = config.get('conversion.kml.input.path')
		let output = config.get('conversion.kml.output.path')
		if (!jar || !main || !input || !output) {
			console.warn("incomplete configuration for KML conversion; aborting")
		} else {
			if (!(input.substr(0, 1) === '/'))
				input = process.env.PWD + '/' + input
			if (!(output.substr(0, 1) === '/'))
				output = process.env.PWD + '/' + output
			this.annotationManager.saveAndExportToKml(jar, main, input, output, this.mapTile)
		}
	}

	private delayHideTransform = () => {
		this.cancelHideTransform();
		this.hideTransform();
	}
	
	private hideTransform = () => {
		this.hideTransformControlTimer = setTimeout( () => {
			this.transformControls.detach( this.transformControls.object )
		}, 1500 )
	}
	
	private cancelHideTransform = () => {
		if (this.hideTransformControlTimer) {
			clearTimeout( this.hideTransformControlTimer );
		}
	}
	
	/**
	 * Create orbit controls which enable translation, rotation and zooming of the scene.
	 */
	private initOrbitControls() {
		this.orbitControls = new OrbitControls( this.camera, this.renderer.domElement );
		this.orbitControls.damping = 0.2;
		
		// Add listeners.
		
		// Render the scene again if we translated, rotated or zoomed.
		this.orbitControls.addEventListener( 'change', this.render );
		
		// If we are controlling the scene don't hide any transform object.
		this.orbitControls.addEventListener( 'start', () => {
			this.cancelHideTransform()
		})
		
		// After the scene transformation is over start the timer to hide the transform object.
		this.orbitControls.addEventListener( 'end', () => {
			this.delayHideTransform()
		})
	}
	
	/**
	 * Create Transform controls object. This allows for the translation of an object in the scene.
	 */
	private initTransformControls() {
		this.transformControls = new TransformControls( this.camera, this.renderer.domElement );
		this.transformControls.addEventListener( 'change', this.render );
		this.scene.add( this.transformControls );
		
		// Add listeners.
		
		// If we are interacting with the transform object don't hide it.
		this.transformControls.addEventListener( 'change', () => {
			this.cancelHideTransform()
		})
		
		// If we just clicked on a transform object don't hide it.
		this.transformControls.addEventListener( 'mouseDown', () => {
			this.cancelHideTransform()
		})
		
		// If we are done interacting with a transform object start hiding process.
		this.transformControls.addEventListener( 'mouseUp', () => {
			this.delayHideTransform()
		})
		
		// If the object attached to the transform object has changed, do something.
		this.transformControls.addEventListener( 'objectChange', () => {
			this.annotationManager.updateActiveLaneMesh()
		})
	}

	/**
	 * Functions to bind
	 */
	deleteLane() {
		// Delete lane from scene
		log.info("Delete selected annotation");
		this.annotationManager.deleteLaneFromPath();
		this.annotationManager.deleteActiveAnnotation(this.scene);
		this.deactivateLaneProp();
		this.hideTransform();
	}

	addLane() {
		// Add lane to scene
		log.info("Added new annotation");
		this.addLaneAnnotation();
		this.resetLaneProp();
		this.hideTransform();
	}

	saveToFile() {
		log.info("Saving annotations to JSON");
		this.saveAnnotations();
	}

	exportKml() {
		log.info("Exporting annotations to KML");
		this.exportAnnotationsToKml();
	}

	loadFromFile() {

		let path_electron = dialog.showOpenDialog({
			properties: ['openDirectory']
		});

		if (isUndefined(path_electron)) {
			return
		}
		
		log.info('Loading point cloud from ' + path_electron[0]);
		this.loadPointCloudData(path_electron[0]);
	}

	addFront() {
		log.info("Adding connected annotation to the front");
		this.annotationManager.addConnectedLaneAnnotation(this.scene, NeighborLocation.FRONT, NeighborDirection.SAME)
	
		// Deactivate button
		this.deactivateFrontSideNeighbours();
	}

	addLeftSame() {
		log.info("Adding connected annotation to the left - same direction");
		this.annotationManager.addConnectedLaneAnnotation(this.scene, NeighborLocation.LEFT, NeighborDirection.SAME);

		// Deactivate buttons
		this.deactivateLeftSideNeighbours();
	}

	addLeftReverse() {
		log.info("Adding connected annotation to the left - reverse direction");
		this.annotationManager.addConnectedLaneAnnotation(this.scene, NeighborLocation.LEFT, NeighborDirection.REVERSE);

		// Deactivate buttons
		this.deactivateLeftSideNeighbours();
	}

	addRightSame() {
		log.info("Adding connected annotation to the right - same direction");
		this.annotationManager.addConnectedLaneAnnotation(this.scene, NeighborLocation.RIGHT, NeighborDirection.SAME);

		// Deactivate buttons
		this.deactivateRightSideNeighbours();
	}

	addRightReverse() {
		log.info("Adding connected annotation to the right - reverse direction");
		this.annotationManager.addConnectedLaneAnnotation(this.scene, NeighborLocation.RIGHT, NeighborDirection.REVERSE);

		// Deactivate buttons
		this.deactivateRightSideNeighbours();
	}

	/**
	 * Bind functions events to interface elements
	 */
	private bind() {

		let menu_btn = document.getElementById('menu_control_btn')
		menu_btn.addEventListener('click', _ => {
			log.info("Menu icon clicked. Close/Open menu bar.")
			let menu = document.getElementById('menu')
			if (menu.style.visibility === 'hidden') {
				menu.style.visibility = 'visible'
			}
			else {
				menu.style.visibility = 'hidden'
			}
		})

		let tools_delete = document.getElementById('tools_delete');
		tools_delete.addEventListener('click', _ => {
			this.deleteLane();
		});

		let tools_add = document.getElementById('tools_add');
		tools_add.addEventListener('click', _ => {
			this.addLane();
		});

		let tools_load = document.getElementById('tools_load');
		tools_load.addEventListener('click', _ => {
			this.loadFromFile();
		});

		let tools_load_annotation = document.getElementById('tools_load_annotation')
		tools_load_annotation.addEventListener('click', _ => {
			let path_electron = dialog.showOpenDialog({
				filters: [{ name: 'json', extensions: ['json'] }]
			})
			
			if (isUndefined(path_electron)) {
				return
			}
			
			log.info('Loading annotations from ' + path_electron[0]);
			this.loadAnnotations(path_electron[0])
		})

		let tools_save = document.getElementById('tools_save');
		tools_save.addEventListener('click', _ => {
			this.saveToFile();
		});

		let tools_export_kml = document.getElementById('tools_export_kml');
		tools_export_kml.addEventListener('click', _ => {
			this.exportKml();
		});

		let lp_add_left_opposite = document.getElementById('lp_add_left_opposite');
		lp_add_left_opposite.addEventListener('click', _ => {
			this.addLeftReverse();
		});

		let lp_add_left_same = document.getElementById('lp_add_left_same');
		lp_add_left_same.addEventListener('click', _ => {
			this.addLeftSame();
		});

		let lp_add_right_opposite = document.getElementById('lp_add_right_opposite');
		lp_add_right_opposite.addEventListener('click', _ => {
			this.addRightReverse();
		});

		let lp_add_right_same = document.getElementById('lp_add_right_same');
		lp_add_right_same.addEventListener('click', _ => {
			this.addRightSame();
		});

		let lp_add_front = document.getElementById('lp_add_forward');
		lp_add_front.addEventListener('click', _ => {
			this.addFront();
		});

		let lc_select_from = document.getElementById('lc_select_from');
		lc_select_from.addEventListener('mousedown', _ => {

			// Get ids
			let ids = this.annotationManager.getValidIds();
			// Add ids
			let selectbox = $('#lc_select_from');
			selectbox.empty();
			let list = '';
			for (let j = 0; j < ids.length; j++){
				list += "<option value=" + ids[j] + ">" +ids[j] + "</option>";
			}
			selectbox.html(list);
		});

		let lc_select_to = document.getElementById('lc_select_to');
		lc_select_to.addEventListener('mousedown', _ => {

			// Get ids
			let ids = this.annotationManager.getValidIds();
			// Add ids
			let selectbox = $('#lc_select_to');
			selectbox.empty();
			let list = '';
			for (let j = 0; j < ids.length; j++){
				list += "<option value=" + ids[j] + ">" +ids[j] + "</option>";
			}
			selectbox.html(list);
		});

		let lc_add = document.getElementById('lc_add');
		lc_add.addEventListener('click', _ => {
			let lc_to : number = Number($('#lc_select_to').val());
			let lc_from : number = Number($('#lc_select_from').val());
			let lc_relation = $('#lc_select_relation').val();

			if (lc_to === null || lc_from === null) {
				dialog.showErrorBox(EM.ET_RELATION_ADD_FAIL,
					"You have to select both lanes to be connected.")
				return;
			}

			if (lc_to === lc_from) {
				dialog.showErrorBox(EM.ET_RELATION_ADD_FAIL,
					"You can't connect a lane to itself. The 2 ids should be unique.");
				return;
			}

			log.info("Trying to add " + lc_relation + " relation from " + lc_from + " to " + lc_to);
			this.annotationManager.addRelation(this.scene, lc_from, lc_to, lc_relation);
			this.resetLaneProp();
		});

		let lc_left = $('#lp_select_left');
		lc_left.on('change', _ => {

			let active_annotation = this.annotationManager.getActiveAnnotation();
			if (active_annotation === null) {
				return;
			}
			log.info("Adding left side type: " + lc_left.children("option").filter(":selected").text());
			active_annotation.leftSideType = lc_left.val();
		});

		let lc_right = $('#lp_select_right');
		lc_right.on('change', _ => {

			let active_annotation = this.annotationManager.getActiveAnnotation();
			if (active_annotation === null) {
				return;
			}
			log.info("Adding right side type: " + lc_right.children("option").filter(":selected").text());
			active_annotation.rightSideType = lc_right.val();
		});

		let lc_entry = $('#lp_select_entry');
		lc_entry.on('change', _ => {

			let active_annotation = this.annotationManager.getActiveAnnotation();
			if (active_annotation === null) {
				return;
			}
			log.info("Adding entry type: " + lc_entry.children("option").filter(":selected").text());
			active_annotation.entryType = lc_entry.val();
		});

		let lc_exit = $('#lp_select_exit');
		lc_exit.on('change', _ => {

			let active_annotation = this.annotationManager.getActiveAnnotation();
			if (active_annotation === null) {
				return;
			}
			log.info("Adding exit type: " + lc_exit.children("option").filter(":selected").text());
			active_annotation.exitType = lc_exit.val();
		});

		let tr_add = $('#tr_add');
		tr_add.on('click', _ => {

			log.info("Add/remove lane to/from car path.");
			this.annotationManager.addLaneToPath();
			if (tr_add.text() === "Add") {
				tr_add.text("Remove");
			}
			else {
				tr_add.text("Add");
			}
		});
		
		let tr_show = $('#tr_show');
		tr_show.on('click', _ => {
			
			log.info("Show/hide car path.");
			if (!this.annotationManager.showPath()) {
				return
			}
			
			// Change button text only if showPath succeed
			if (tr_show.text() === "Show") {
				tr_show.text("Hide");
			}
			else {
				tr_show.text("Show");
			}
		});
		
		let save_path = $('#save_path')
		save_path.on('click', _ => {
			
			log.info("Save car path to file.")
			let filename : string = './data/trajectory.csv'
			this.annotationManager.saveCarPath(filename, this.mapTile)
		})
	}

	/**
	 * Reset lane properties elements based on the current active lane
	 */
	private resetLaneProp() {

		let active_annotation = this.annotationManager.getActiveAnnotation();
		if (active_annotation === null) {
			return;
		}

		if (active_annotation.neighborsIds.left != null) {
			this.deactivateLeftSideNeighbours();
		}else {
			this.activateLeftSideNeighbours();
		}

		if (active_annotation.neighborsIds.right != null) {
			this.deactivateRightSideNeighbours();
		}else {
			this.activateRightSideNeighbours();
		}

		if (active_annotation.neighborsIds.front.length != 0) {
			this.deactivateFrontSideNeighbours();
		}else {
			this.activateFrontSideNeighbours();
		}

		let lp_id = document.getElementById('lp_id_value');
		lp_id.textContent = active_annotation.id.toString();
		active_annotation.updateLaneWidth()

		let lc_select_to = $('#lc_select_to');
		lc_select_to.empty();
		lc_select_to.removeAttr('disabled');

		let lc_select_from = $('#lc_select_from');
		lc_select_from.empty();
		lc_select_from.removeAttr('disabled');

		let lc_select_relation = $('#lc_select_relation');
		lc_select_relation.removeAttr('disabled');

		let lp_select_left = $('#lp_select_left');
		lp_select_left.removeAttr('disabled');
		lp_select_left.val(active_annotation.leftSideType.toString());

		let lp_add_relation = $('#lc_add');
		lp_add_relation.removeAttr('disabled');

		let lp_select_right = $('#lp_select_right');
		lp_select_right.removeAttr('disabled');
		lp_select_right.val(active_annotation.rightSideType.toString());

		let lp_select_entry = $('#lp_select_entry');
		lp_select_entry.removeAttr('disabled');
		lp_select_entry.val(active_annotation.entryType.toString());

		let lp_select_exit = $('#lp_select_exit');
		lp_select_exit.removeAttr('disabled');
		lp_select_exit.val(active_annotation.exitType.toString());

		let tr_add = $('#tr_add');
		tr_add.removeAttr('disabled');
		if (this.annotationManager.laneIndexInPath(active_annotation.id) === -1) {
			tr_add.text("Add");
		}
		else {
			tr_add.text("Remove");
		}

		let tr_show = $('#tr_show');
		tr_show.removeAttr('disabled');
	}

	/**
	 * Deactivate lane properties menu panel
	 */
	deactivateLaneProp() {

		this.deactivateLeftSideNeighbours();
		this.deactivateRightSideNeighbours();
		this.deactivateFrontSideNeighbours();

		let lp_id = document.getElementById('lp_id_value');
		lp_id.textContent = 'UNKNOWN';
		let lp_width = document.getElementById('lp_width_value')
		lp_width.textContent = 'UNKNOWN'

		let selects = document.getElementById('lane_prop_1').getElementsByTagName('select');
		for (let i = 0; i < selects.length; ++i) {
			selects.item(i).selectedIndex = 0;
			selects.item(i).setAttribute('disabled', 'disabled');
		}

		selects = document.getElementById('lane_conn').getElementsByTagName('select');
		for (let i = 0; i < selects.length; ++i) {
			selects.item(i).setAttribute('disabled', 'disabled');
		}

		let lc_add = document.getElementById('lc_add');
		lc_add.setAttribute('disabled', 'disabled');

		let tr_add = document.getElementById('tr_add');
		tr_add.setAttribute('disabled', 'disabled');
	}

	/**
	 * Deactivate/activate left side neighbours
	 */
	deactivateLeftSideNeighbours() {
		let lp_add_left_opposite = document.getElementById('lp_add_left_opposite');
		let lp_add_left_same = document.getElementById('lp_add_left_same');
		lp_add_left_same.setAttribute('disabled', 'disabled');
		lp_add_left_opposite.setAttribute('disabled', 'disabled');
	}
	activateLeftSideNeighbours() {
		let lp_add_left_opposite = document.getElementById('lp_add_left_opposite');
		let lp_add_left_same = document.getElementById('lp_add_left_same');
		lp_add_left_same.removeAttribute('disabled');
		lp_add_left_opposite.removeAttribute('disabled');
	}

	/**
	 * Deactivate right side neighbours
	 */
	deactivateRightSideNeighbours() {
		let lp_add_right_opposite = document.getElementById('lp_add_right_opposite');
		let lp_add_right_same = document.getElementById('lp_add_right_same');
		lp_add_right_same.setAttribute('disabled', 'disabled');
		lp_add_right_opposite.setAttribute('disabled', 'disabled');
	}
	activateRightSideNeighbours() {
		let lp_add_right_opposite = document.getElementById('lp_add_right_opposite');
		let lp_add_right_same = document.getElementById('lp_add_right_same');
		lp_add_right_same.removeAttribute('disabled');
		lp_add_right_opposite.removeAttribute('disabled');
	}
	
	/**
	 * Deactivate/activate front side neighbours
	 */
	deactivateFrontSideNeighbours() {
		let lp_add_front = document.getElementById('lp_add_forward');
		lp_add_front.setAttribute('disabled', 'disabled');
	}
	activateFrontSideNeighbours() {
		let lp_add_front = document.getElementById('lp_add_forward');
		lp_add_front.removeAttribute('disabled');
	}
	
	private loadCarModel() {
		let manager = new THREE.LoadingManager()
		let loader = new THREE.OBJLoader(manager)
		loader.load('/Users/alonso/Mapper/CodeBase/Perception/data/BMW_X5_4.obj', (object) => {
			let boundingBox = new THREE.Box3().setFromObject(object)
			let boxSize = boundingBox.getSize().toArray()
			let modelLength = Math.max(...boxSize)
			const carLength = 4.5 // approx in meters
			const scaleFactor = carLength / modelLength
			this.carModel = object
			this.carModel.scale.set(scaleFactor, scaleFactor, scaleFactor)
			this.scene.add(object)
		})
	}
	
	listen() {
		log.info('Listening for messages...')
		
		this.liveSubscribeSocket.on('message', (msg) => {
			let state =  Models.InertialStateMessage.decode(msg)
			log.info("Received message: " + state.pose.timestamp)
		})
		
		
		this.liveSubscribeSocket.connect("ipc:///tmp/InertialState")
		this.liveSubscribeSocket.subscribe("")
	}
	
}


export const annotator = new Annotator();
