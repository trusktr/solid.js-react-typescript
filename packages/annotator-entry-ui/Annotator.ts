/**
 * Created by alonso on 4/12/17.
 */

import * as $ from 'jquery'
import * as THREE from 'three'
import {TransformControls} from 'annotator-entry-ui/controls/TransformControls'
import {OrbitControls} from 'annotator-entry-ui/controls/OrbitControls'
import {DragControls} from 'annotator-entry-ui/controls/DragControls'
import * as TileUtils from 'annotator-entry-ui/TileUtils'
import * as AnnotationUtils from 'annotator-entry-ui/AnnotationUtils'
import * as TypeLogger from 'typelogger'
import {getValue} from "typeguard"

TypeLogger.setLoggerOutput(console as any)

let statsModule = require("stats.js")

let root = $("#root")
const log = TypeLogger.getLogger(__filename)


export class Annotator {
	scene : THREE.Scene
	camera : THREE.PerspectiveCamera
	renderer : THREE.WebGLRenderer
	raycaster : THREE.Raycaster
	plane : THREE.Mesh
	stats
	orbitControls
	dragControls
	transformControls
	hideTransformControlTimer
	annotations :  Array<AnnotationUtils.LaneAnnotation>
	isAddMarkerKeyPressed : boolean
	
	constructor() {
		this.isAddMarkerKeyPressed = false
	}
	
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
		this.annotations = []
		this.annotations.push(new AnnotationUtils.LaneAnnotation())
		this.scene.add(this.annotations[0].laneMesh)
		
		// THe raycaster is used to compute where the waypoints will be dropped
		this.raycaster = new THREE.Raycaster()
	
		// Create GL Renderer
		this.renderer = new THREE.WebGLRenderer( {antialias: true} )
		this.renderer.setClearColor( 0xf0f0f0 )
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
		this.initDragControls()
		
		window.addEventListener('resize', this.onWindowResize, false );
		window.addEventListener('keydown', (event) => {
			if (event.code == 'KeyA') {
				log.info("Add marker key pressed")
				this.isAddMarkerKeyPressed = true
			}
			
			if (event.code == 'KeyD') {
				log.info("Deleting last marker")
				this.annotations[0].deleteLast(this.scene)
				this.hideTransform()
			}
		})
		
		window.addEventListener('keyup', (event) => {
			this.isAddMarkerKeyPressed = false
		})
		
		this.renderer.domElement.addEventListener('mouseup', this.addLaneAnnotationMarker)
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
	
	private addLaneAnnotationMarker = (event) => {
		if (this.isAddMarkerKeyPressed == false) {
			return
		}
		
		let mouse = new THREE.Vector2()
		mouse.x = ( event.clientX / this.renderer.domElement.clientWidth ) * 2 - 1
		mouse.y = - ( event.clientY / this.renderer.domElement.clientHeight ) * 2 + 1
		this.raycaster.setFromCamera(mouse, this.camera)
		let intersection = this.raycaster.intersectObject(this.plane)
		if (intersection.length > 0) {
			// Remember x-z is the horizontal plane, y is the up-down axis
			let x = intersection[0].point.x
			let y = intersection[0].point.y
			let z = intersection[0].point.z
			this.annotations[0].addMarker(this.scene, x,y,z)
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
			this.annotations[0].generateMeshFromMarkers()
		})
	}
	
	/**
	 * Create drag control object. This object is in charge of attaching/detaching a 3D
	 * object to the transform control object.
	 */
	private initDragControls() {
		// Create a the drag control object and link it  to the objects we want to be able to edit
		this.dragControls = new DragControls(this.annotations[0].laneMarkers, this.camera, this.renderer.domElement);
		this.dragControls.enabled = false;
		
		// Add listeners.
		
		// When we hover on an linked object attach the transform control to it to be able
		// to move it.
		this.dragControls.addEventListener( 'hoveron', (event) => {
			this.transformControls.attach( event.object )
			this.cancelHideTransform()
		})
		
		// When we hover off a linked object hide the transform control.
		this.dragControls.addEventListener( 'hoveroff', (event) => {
			this.delayHideTransform()
		})
	}
}
