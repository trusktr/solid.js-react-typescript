/**
 *  Copyright 2017 Mapper Inc. Part of the mapper-annotator project.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as $ from 'jquery'
import * as THREE from 'three'
import {TransformControls} from 'annotator-entry-ui/controls/TransformControls'
import {OrbitControls} from 'annotator-entry-ui/controls/OrbitControls'
import * as TileUtils from 'annotator-entry-ui/TileUtils'
import * as AnnotationUtils from 'annotator-entry-ui/AnnotationUtils'
import {NeighborLocation, NeighborDirection} from 'annotator-entry-ui/LaneAnnotation'
import * as TypeLogger from 'typelogger'
import {getValue} from "typeguard"

TypeLogger.setLoggerOutput(console as any)

const statsModule = require("stats.js")
const datModule = require("dat.gui/build/dat.gui")

let root = $("#root")
const log = TypeLogger.getLogger(__filename)

/**
 * The Annotator class is in charge of rendering the 3d Scene that includes the point clouds
 * and the annotations. It also handles the mouse and keyboard events needed to select
 * and modify the annotations.
 */
export class Annotator {
	scene : THREE.Scene
	camera : THREE.PerspectiveCamera
	renderer : THREE.WebGLRenderer
	raycaster_plane : THREE.Raycaster
	raycaster_marker : THREE.Raycaster
	raycaster_annotation : THREE.Raycaster
	plane : THREE.Mesh
	stats
	orbitControls
	transformControls
	hideTransformControlTimer
	annotationManager : AnnotationUtils.AnnotationManager
	isAddMarkerKeyPressed : boolean
	hovered
	settings
	gui
	
	constructor() {
		this.isAddMarkerKeyPressed = false
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
	}
	
	/**
	 * Create the 3D Scene and add some basic objects. It also initializes
	 * several event listeners.
	 */
	initScene() {
		log.info(`Building scene`)
		
		const [width,height] = this.getContainerSize()
	
		// Create scene and camera
		this.scene = new THREE.Scene()
		this.camera = new THREE.PerspectiveCamera(70, width/height, 0.1, 10010)
		this.camera.position.z = 100
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
		this.plane.position.y = -5
		this.plane.receiveShadow = true
		this.scene.add(this.plane)
	
		// Add grid on top of the plane
		let grid = new THREE.GridHelper( 2000, 100 );
		grid.position.y = - 4;
		grid.material.opacity = 0.25;
		grid.material.transparent = true;
		this.scene.add( grid );
		let axis = new THREE.AxisHelper(10);
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
		
		// Add listeners
		window.addEventListener('resize', this.onWindowResize);
		window.addEventListener('keydown',this.onKeyDown)
		window.addEventListener('keyup', this.onKeyUp)
		
		this.renderer.domElement.addEventListener('mouseup', this.addLaneAnnotationMarker)
		this.renderer.domElement.addEventListener('mouseup', this.checkForAnnotationSelection)
		this.renderer.domElement.addEventListener('mousemove', this.checkForActiveMarker)
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
			let points = await TileUtils.loadFullDataset(pathToTiles)
			let pointCloud = TileUtils.generatePointCloudFromRawData(points)
			this.scene.add(pointCloud)
		} catch (err) {
			log.error('It failed', err)
		}
	}
	
	/**
	 * Create a new lane annotation.
	 */
	private addLaneAnnotation() {
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
		if (this.isAddMarkerKeyPressed == false) {
			return
		}
		
		let mouse = this.getMouseCoordinates(event)
		this.raycaster_plane.setFromCamera(mouse, this.camera)
		let intersection = this.raycaster_plane.intersectObject(this.plane)
		if (intersection.length > 0) {
			// Remember x-z is the horizontal plane, y is the up-down axis
			let x = intersection[0].point.x
			let y = intersection[0].point.y
			let z = intersection[0].point.z
			this.annotationManager.addLaneMarker(this.scene, x,y,z)
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
			}
		}
	}
	
	/**
	 * Check if the mouse is on top of an editable lane marker. If so, attach the
	 * marker to the transform control for editing.
	 * @param event
	 */
	private checkForActiveMarker = ( event ) => {
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
		if (event.code == 'KeyA') {
			this.isAddMarkerKeyPressed = true
		}
		
		if (event.code == 'KeyD') {
			log.info("Deleting last marker")
			this.annotationManager.deleteLastLaneMarker(this.scene)
			this.hideTransform()
		}
		
		if (event.code == 'KeyN') {
			log.info("Added new annotation")
			this.addLaneAnnotation()
			this.hideTransform()
		}
		
		if (event.code == "KeyF") {
			log.info("Adding connected annotation to the front")
			this.annotationManager.addConnectedLaneAnnotation(this.scene, NeighborLocation.FRONT, NeighborDirection.SAME)
		}
		
		if (event.code == "KeyL") {
			log.info("Adding connected annotation to the left - same direction")
			this.annotationManager.addConnectedLaneAnnotation(this.scene, NeighborLocation.LEFT, NeighborDirection.SAME)
		}
		
		if (event.code == "KeyK") {
			log.info("Adding connected annotation to the left - reverse direction")
			this.annotationManager.addConnectedLaneAnnotation(this.scene, NeighborLocation.LEFT, NeighborDirection.REVERSE)
		}
		
		if (event.code == "KeyR") {
			log.info("Adding connected annotation to the right - same direction")
			this.annotationManager.addConnectedLaneAnnotation(this.scene, NeighborLocation.RIGHT, NeighborDirection.SAME)
		}
		
		if (event.code == "KeyE") {
			log.info("Adding connected annotation to the right - same direction")
			this.annotationManager.addConnectedLaneAnnotation(this.scene, NeighborLocation.RIGHT, NeighborDirection.REVERSE)
		}
	}
	
	private onKeyUp = (event) => {
		this.isAddMarkerKeyPressed = false
	}
	
	private delayHideTransform = () => {
		this.cancelHideTransform();
		this.hideTransform();
	}
	
	private hideTransform = () => {
		this.hideTransformControlTimer = setTimeout( () => {
			this.transformControls.detach( this.transformControls.object )
		}, 2500 )
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
		this.transformControls.addEventListener( 'change', (event) => {
			this.cancelHideTransform()
		})
		
		// If we just clicked on a transform object don't hide it.
		this.transformControls.addEventListener( 'mouseDown', (event) => {
			this.cancelHideTransform()
		})
		
		// If we are done interacting with a transform object start hiding process.
		this.transformControls.addEventListener( 'mouseUp', (event) => {
			this.delayHideTransform()
		})
		
		// If the object attached to the transform object has changed, do something.
		this.transformControls.addEventListener( 'objectChange', (event) => {
			this.annotationManager.updateActiveLaneMesh()
		})
	}
}
