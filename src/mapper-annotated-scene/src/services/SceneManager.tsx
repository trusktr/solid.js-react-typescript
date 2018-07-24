/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as THREE from "three"
import * as React from "react"
import {AnimationLoop, ChildAnimationLoop} from 'animation-loop'
import {CameraType} from "@/mapper-annotated-scene/src/models/CameraType";
import {Sky} from "@/mapper-annotated-scene/src/services/controls/Sky";
import config from "@/config";
import {CompassRose} from "@/mapper-annotated-scene/src/services/controls/CompassRose";
import AnnotatedSceneActions from "@/mapper-annotated-scene/src/store/actions/AnnotatedSceneActions.ts";
import Logger from "@/util/log";
import {OrbitControls} from "@/mapper-annotated-scene/src/services/controls/OrbitControls";
import {getValue} from "typeguard";
import {typedConnect} from "@/mapper-annotated-scene/src/styles/Themed";
import toProps from '@/util/toProps'
import {UtmCoordinateSystem} from "@/mapper-annotated-scene/UtmCoordinateSystem";
import {getDecorations} from "@/mapper-annotated-scene/Decorations";
import {StatusKey} from "@/mapper-annotated-scene/src/models/StatusKey";
import StatusWindowActions from "@/mapper-annotated-scene/StatusWindowActions";
import {EventEmitter} from "events";
import {PointCloudSuperTile} from "@/mapper-annotated-scene/tile/PointCloudSuperTile";
import {SuperTile} from "@/mapper-annotated-scene/tile/SuperTile";
import AreaOfInterestManager from "@/mapper-annotated-scene/src/services/AreaOfInterestManager";
import * as Stats from 'stats.js'
import {Events} from "@/mapper-annotated-scene/src/models/Events";
import {Set} from 'immutable'
import {THREEColorValue} from "@/mapper-annotated-scene/src/THREEColorValue-type";
import {TransformControls} from '@/mapper-annotated-scene/src/services/controls/TransformControls'
import {isTupleOfNumbers} from "@/util/Validation"

const log = Logger(__filename)

export interface SceneManagerProps {

	// TODO needs to handle background color changes, currently used only on construction
	backgroundColor?: THREEColorValue

	width: number
	height: number
	areaOfInterestManager: AreaOfInterestManager
	shouldAnimate ?: boolean
	compassRosePosition ?: THREE.Vector3
	isDecorationsVisible ?: boolean
	orbitControlsTargetPoint ?: THREE.Vector3
	// pointCloudSuperTiles ?: OrderedMap<string, SuperTile>
	utmCoordinateSystem: UtmCoordinateSystem
	channel: EventEmitter
	sceneObjects ?: Set<THREE.Object3D>
	transformedObjects?: Array<THREE.Object3D>
	cameraPreference?: CameraType
	container: HTMLDivElement
	transformControlsMode?: 'translate' | 'rotate' | 'scale'
	isInitialOriginSet?: boolean
}

export interface SceneManagerState {
	camera: THREE.Camera
	perspectiveCamera: THREE.PerspectiveCamera
	orthographicCamera: THREE.OrthographicCamera
	flyThroughCamera: THREE.PerspectiveCamera
	scene: THREE.Scene
	compassRose: THREE.Object3D
	renderer: THREE.WebGLRenderer
	loop: AnimationLoop
	cameraOffset: THREE.Vector3

	orthoCameraHeight: number
	cameraPosition2D: THREE.Vector2
	cameraToSkyMaxDistance: number

	sky: THREE.Object3D
	skyPosition2D: THREE.Vector2
	updateOrbitControls: boolean

	maxDistanceToDecorations: number // meters

	decorations: THREE.Object3D[] // arbitrary objects displayed with the point cloud
	stats: Stats
}

@typedConnect(toProps(
	'shouldAnimate',
	'compassRosePosition',
	'isDecorationsVisible',
	'orbitControlsTargetPoint',
	// 'pointCloudSuperTiles',
	'sceneObjects',
	'transformedObjects',
	'cameraPreference',
	'transformControlsMode',
	'isInitialOriginSet',
))
export class SceneManager extends React.Component<SceneManagerProps, SceneManagerState> {
	private orbitControls: THREE.OrbitControls
	private transformControls: any // controller for translating an object within the scene
	private hideTransformControlTimer: number

	constructor(props: SceneManagerProps) {
		super(props)
		const {width, height} = this.props

		// Settings for component state
		const orthoCameraHeight = 100 // enough to view ~1 city block of data

		let cameraOffset = new THREE.Vector3(0, 400, 200)
		if (config['startup.camera_offset']) {
			const configCameraOffset: [number, number, number] = config['startup.camera_offset']
			if (isTupleOfNumbers(configCameraOffset, 3)) {
				cameraOffset = new THREE.Vector3().fromArray(configCameraOffset)
			} else if (configCameraOffset) {
				log.warn(`invalid startup.camera_offset config: ${configCameraOffset}`)
			}
		}

		const skyRadius = 8000
		const cameraToSkyMaxDistance = skyRadius * 0.05
		const skyPosition2D = new THREE.Vector2()
		const updateOrbitControls = false

		const perspectiveCam = new THREE.PerspectiveCamera(70, width / height, 0.1, 10000)
		const orthographicCam = new THREE.OrthographicCamera(1, 1, 1, 1, 0, 10000)
		const flyThroughCamera = new THREE.PerspectiveCamera(70, width / height, 0.1, 10000)
		flyThroughCamera.position.set(800, 400, 0)

		const scene = new THREE.Scene()

		scene.add(perspectiveCam)
		scene.add(orthographicCam)
		scene.add(flyThroughCamera)

		let camera
		// TODO JOE if this doesn't work in the constructor, move it to componentDidUpdate()
		if (props.cameraPreference === CameraType.ORTHOGRAPHIC)
			camera = orthographicCam
		else
			camera = perspectiveCam

		const debugSphere = new THREE.Mesh( new THREE.SphereGeometry(0.5), new THREE.MeshBasicMaterial({ color: new THREE.Color( 0xffffff ) }) )
		debugSphere.position.z = -100
		camera.add( debugSphere )

		// Add some lights
		scene.add(new THREE.AmbientLight(new THREE.Color( 0xffffff )))

		// TODO move config to app, use only prop here
		// const background = new THREE.Color(config['startup.background_color'] || '#082839')
		const background = props.backgroundColor || 'gray'

		// Draw the sky.
		const sky = Sky(new THREE.Color( background ), new THREE.Color(0xccccff), skyRadius)
		scene.add(sky)

		const compassRoseLength = parseFloat(config['annotator.compass_rose_length']) || 0
		let compassRose
		if (compassRoseLength > 0) {
			compassRose = CompassRose(compassRoseLength)
			compassRose.rotateX(Math.PI / -2)
			scene.add(compassRose)
		} else
			compassRose = null

		// @TODO Joe to add annotationManager at later time -- not needed in scene for Beholder??

		// Create GL Renderer
		const renderer = new THREE.WebGLRenderer({antialias: true})
		renderer.setClearColor(new THREE.Color( background ))
		renderer.setPixelRatio(window.devicePixelRatio)
		renderer.setSize(width, height)

		const loop = new AnimationLoop
		const animationFps = config['startup.render.fps']
		loop.interval = animationFps === 'device' ? false : 1 / (animationFps || 10)

		this.orbitControls = this.initOrbitControls(camera, renderer)

		// TODO JOE THURSDAY anything that doesn't need to change we can
		// take out of state and keep as instance variables. F.e. loop, scene,
		// renderer, etc
		const state = {
			camera: camera,
			perspectiveCamera: perspectiveCam,
			orthographicCamera: orthographicCam,
			flyThroughCamera: flyThroughCamera,

			scene: scene,
			compassRose: compassRose,
			renderer: renderer,
			loop: loop,
			cameraOffset: cameraOffset,
			orthoCameraHeight: orthoCameraHeight,

			cameraPosition2D: new THREE.Vector2(),
			cameraToSkyMaxDistance: cameraToSkyMaxDistance,

			sky: sky,
			skyPosition2D: skyPosition2D,
			updateOrbitControls: updateOrbitControls,

			maxDistanceToDecorations: 50000,
			decorations: [],
			stats: new Stats(),
		}

		this.state = state

		this.createOrthographicCameraDimensions(width, height)

		this.initTransformControls()

		// Point the camera at some reasonable default location.
		this.setStage(0, 0, 0)

		// starts tracking time, but GPU use is still at 0% at this moment
		// because there are no animation functions added to the loop yet.
		loop.start()

		loop.addBaseFn( () => {
			// if (this.stats) this.stats.update() TODO REMOVE
			this.transformControls.update()
			renderer.render(scene, this.state.camera)
		})

		this.props.channel.on(Events.SCENE_SHOULD_RENDER, this.renderScene)

		// Setup listeners on add/remove point cloud tiles
		this.props.channel.on('addPointCloudSuperTile', (superTile: SuperTile) => this.addSuperTile(superTile))
		this.props.channel.on('removePointCloudSuperTile', (superTile: SuperTile) => this.removeSuperTile(superTile))

		new AnnotatedSceneActions().setSceneInitialized(true)
	}

	/**
	 * Create Transform controls object. This allows for the translation of an object in the scene.
	 */
	// TODO JOE ? Transform logic could possibly go in a new
	// TransformControlManaager class, which knows which object is currently
	// selected?
	initTransformControls(): void {
		this.transformControls = new TransformControls(this.state.camera, this.state.renderer.domElement, false)
		this.transformControls.addEventListener('change', this.renderScene)

		new AnnotatedSceneActions().addObjectToScene(this.transformControls)

		// Add listeners.
		// If we are interacting with the transform object don't hide it.
		this.transformControls.addEventListener('change', this.cancelHideTransform)

		// If we just clicked on a transform object don't hide it.
		this.transformControls.addEventListener('mouseDown', this.cancelHideTransform)

		// If we are done interacting with a transform object start hiding process.
		this.transformControls.addEventListener('mouseUp', this.delayHideTransform)

		// If the object attached to the transform object has changed, do something.
		// this.transformControls.addEventListener('objectChange', this.updateActiveAnnotationMesh)
		this.transformControls.addEventListener('objectChange', () => this.props.channel.emit('transformUpdate'))
	}

	delayHideTransform = (): void => {
		this.cancelHideTransform()
		this.hideTransform()
	}

	hideTransform = (): void => {
		this.hideTransformControlTimer = window.setTimeout(this.cleanTransformControls, 1500)
	}

	cancelHideTransform = (): void => {
		if (this.hideTransformControlTimer) {
			window.clearTimeout(this.hideTransformControlTimer)
		}
	}

	cleanTransformControls = (): void => {
		this.cancelHideTransform()
		this.transformControls.detach()
		this.renderScene()
	}

	private updateSceneObjects(newSceneObjects:Set<THREE.Object3D>, existingSceneObjects:Set<THREE.Object3D>) {
		const scene = this.state.scene
		newSceneObjects.forEach(object => {
			if(!existingSceneObjects.has(object!)) {
				// Not found in the existing objects, let's ADD it to the scene
				scene.add(object!)
			}
		})

		existingSceneObjects.forEach(object => {
			if(!newSceneObjects.has(object!)) {
				// Not found in the new objects, let's REMOVE it
				scene.remove(object!)
			}
		})

		this.renderScene()
	}

	private makeStats(): void {
		if (!config['startup.show_stats_module']) return

		// Create stats widget to display frequency of rendering
		const stats = this.state.stats
		stats.dom.style.top = 'initial' // disable existing setting
		stats.dom.style.bottom = '50px' // above Mapper logo
		stats.dom.style.left = '13px'
		this.props.container.appendChild(stats.dom)

	}

	private destroyStats(): void {
		if (!config['startup.show_stats_module']) return
		this.state.stats.dom.remove()
	}


	/**
	 * updateOrbitControlsTargetPoint is called via componentWillReceiveProps.
	 * Specifically AnnotatedSceneController.focusOnPointCloud -> PointCloudManager.focusOnPointCloud -> Redux Action
	 * @param {Vector3} point
	 */
	updateOrbitControlsTargetPoint(point:THREE.Vector3) {
		const orbitControls = this.orbitControls
		orbitControls.target.set(point.x, point.y, point.z)
		orbitControls.update()
		this.renderScene()
	}

	// NOTE JOE THURSDAY at the moment shoudlAnimate is only used here, so
	// perhaps we don't need Redux for this? And apps can call methods on
	// AnnotatedSceneController which ultimately call these methods?
	//
	// {{{

	// SHARED
	private startAnimation(): void {
		new AnnotatedSceneActions().setShouldAnimate(true)

		// this.shouldAnimate = true
		this.startAoiUpdates()

		// TODO JOE this will go away, components will queue updates when necessary
		const loop = this.state.loop
		loop.addAnimationFn(() => {
			if ( !this.props.shouldAnimate ) return false

			// @TODO create a way to register animate methods
			// this.animate() TODO REMOVE

			return true
		})
	}

	// JOE THURSDAY moved from Annotator
	private stopAnimation(): void {
		// this.shouldAnimate = false
		new AnnotatedSceneActions().setShouldAnimate(false)
	}

	// }}}

	// JOE THURSDAY maybe instead of proxying, we let app code (f.e. Annotator,
	// Kiosk, and AnnotatedSceneController) get a ref to the loop to call these
	// methods.
	//
	// Maybe AnnotatedSceneController exposes either the loop reference, or
	// proxy methods, for apps to use.
	//
	// {{{

	addAnimationFunction( fn ) {
		this.state.loop.addAnimationFn( fn )
	}

	removeAnimationFunction( fn ) {
		this.state.loop.removeAnimationFn( fn )
	}

	pauseEverything(): void {
		this.state.loop.pause()
	}

	resumeEverything(): void {
		this.state.loop.start()
	}

	// }}}

	// TODO JOE THURSDAY longer term, we can create the loop on init logic (f.e.
	// constructor), then just use the loop when needed.
	// TODO This should go to AreaOfInterestManager, and hook into
	// SceneManager's loop (or add a child one)
	private startAoiUpdates(): void {
		const loop = this.state.loop

		loop.addAnimationFn(() => {
			if ( !this.props.shouldAnimate ) return false
			if ( !this.props.areaOfInterestManager ) {
				throw new Error( "areaOfInterestManager does not exist when it's expected!!")
			}

			// NOTE JOE longer term: Inversely, AreaOfInterestManager could instead hook into
			// the animation loop rather than SceneManager knowing which
			// managers need to be hooked in.
			this.props.areaOfInterestManager.updatePointCloudAoi()

			// Ryan added 7/9
			this.props.areaOfInterestManager.updateAoiHeading()


			return true
		})
	}

	removeCompassFromScene() {
		const scene = this.state.scene
		if(this.state.compassRose) {
			scene.remove(this.state.compassRose)
		}
	}

	enableOrbitControls() {
		const orbitControls = this.orbitControls

		orbitControls.enabled = true
	}

	getCamera(): THREE.Camera {
		return this.state.camera
	}


	addChildAnimationLoop(childLoop: ChildAnimationLoop) {
		// this.loop.addChildLoop( FlyThroughManager.getAnimationLoop() )
		this.state.loop.addChildLoop( childLoop )
	}

	getRendererDOMElement() {
		return this.state.renderer.domElement
	}

	// used to be called renderAnnotator
	renderScene = (): void => {
		// force a tick which causes renderer.render to be called
		this.state.loop.forceTick()
	}

	// Scale the ortho camera frustum along with window dimensions to preserve a 1:1
	// proportion for model width:height.
	private createOrthographicCameraDimensions(width: number, height: number): void {
		const orthoWidth = this.state.orthoCameraHeight * (width / height)
		const orthoHeight = this.state.orthoCameraHeight

		const orthographicCamera = this.state.orthographicCamera
		orthographicCamera.left = orthoWidth / -2
		orthographicCamera.right = orthoWidth / 2
		orthographicCamera.top = orthoHeight / 2
		orthographicCamera.bottom = orthoHeight / -2
		orthographicCamera.updateProjectionMatrix()
	}

	// Move all visible elements into position, centered on a coordinate.
	// @TODO long term move to Camera Manager
	setStage(x: number, y: number, z: number, resetCamera: boolean = true): void {
		new AnnotatedSceneActions().setSceneStage(new THREE.Vector3(x, y, z))

		if (resetCamera) {
			const {camera, cameraOffset} = this.state
			camera.position.set(x, y, z).add(cameraOffset)

			// @TODO orbit controls will not be set on initialization of Scene unless it's a required prop
			const {orbitControls} = this
			orbitControls.target.set(x, y, z)
			orbitControls.update()
		}

		this.renderScene()
	}

	// The sky needs to be big enough that we don't bump into it but not so big that the camera can't see it.
	// So make it pretty big, then move it around to keep it centered over the camera in the XZ plane. Sky radius
	// and camera zoom settings, set elsewhere, should keep the camera from penetrating the shell in the Y dimension.
	// @TODO Camera Manager will update sky position long term
	updateSkyPosition = (): void => {
		const {cameraPosition2D, skyPosition2D, cameraToSkyMaxDistance, sky, camera} = this.state

		cameraPosition2D.set(camera.position.x, camera.position.z)

		if (cameraPosition2D.distanceTo(skyPosition2D) > cameraToSkyMaxDistance) {
			sky.position.setX(cameraPosition2D.x)
			sky.position.setZ(cameraPosition2D.y)
			skyPosition2D.set(sky.position.x, sky.position.z)
		}
	}

	private initOrbitControls(camera:THREE.Camera, renderer:THREE.WebGLRenderer) {
		const orbitControls = new OrbitControls(camera, renderer.domElement)
		orbitControls.enabled = true
		orbitControls.enablePan = true
		orbitControls.minDistance = 10
		orbitControls.maxDistance = 5000
		orbitControls.minPolarAngle = 0
		orbitControls.maxPolarAngle = Math.PI / 2
		orbitControls.keyPanSpeed = 100

		orbitControls.addEventListener('change', this.updateSkyPosition)

		orbitControls.addEventListener('start', () => {
			new AnnotatedSceneActions().cameraIsOrbiting( true )
		})
		orbitControls.addEventListener('end', () => {
			new AnnotatedSceneActions().cameraIsOrbiting( false )
		})

		return orbitControls
	}

	/**
	 * To be used by external apps that want to register an orbit control event listener.
	 * For example, Annotator needs the 'pan' event
	 * @param {string} type
	 * @param {() => void} callback
	 */
	addOrbitControlEventListener(type:string, callback:()=>void) {
		// @TODO Annotator needs to register a 'pan' event
		const orbitControls = this.orbitControls
		orbitControls.addEventListener(type, callback)

		// TODO JOE THURSDAY We could emit a cameraUpdate event (f.e. using my
		// Observable class), and pass camera info to listeners. Then listeners
		// can (f.e. maybe AnnotatedSceneController) can decide to update things
		// (f.e. the camera info StatusWindow message)
		// Search for displayCameraInfo to find code that was previously
		// updating the clients message.
		// orbitControls.addEventListener('pan', this.displayCameraInfo)
	}

	private getSize = (): Array<number> => {
		return getValue(() => [this.props.width, this.props.height], [0, 0])
	}

	// TODO JOE FRIDAY Resize on resize of parent element.
	// The Annotated Scene may not always be full size of the winow, it might be
	// anywhere on the page, so instead we need to listen to the size of the
	// scene's parent container. For example, on the mapper.ai public website,
	// the scene might be a rectangle inside the page, not the whole window.
	// We can use ResizeObserver for this.
	private onResize = (): void => {

		const [width, height]: Array<number> = this.getSize()

		const {camera, renderer} = this.state

		if ( camera instanceof THREE.PerspectiveCamera ) {
			camera.aspect = width / height
			camera.updateProjectionMatrix()
		} else {
			this.createOrthographicCameraDimensions(width, height)
		}

		renderer.setSize(width, height)
		new AnnotatedSceneActions().setRendererSize({ width, height })
		this.renderScene()
	}

	// @TODO Camera Manager
	adjustCameraXOffset(value:number) {
		const cameraOffset = this.state.cameraOffset
		cameraOffset.x += value
		this.setState({cameraOffset: cameraOffset.clone()})
	}

	// @TODO Camera Manager
	adjustCameraYOffset(value:number) {
		const cameraOffset = this.state.cameraOffset
		cameraOffset.y += value
		this.setState({cameraOffset: cameraOffset.clone()})
	}

	addSuperTile(superTile: SuperTile) {
		if (superTile instanceof PointCloudSuperTile) {
			const st = superTile as PointCloudSuperTile
			if (st.pointCloud) {
				this.state.scene.add(st.pointCloud)
				this.renderScene() // can potentially remove but added it just in case
			}
			else{
				// RT 7/9 to remove noise --> log.error('Attempting to add super tile to scene - got a super tile with no point cloud')
			}
		}
	}

	removeSuperTile(superTile: SuperTile) {
		if (superTile instanceof PointCloudSuperTile) {
			const st = superTile as PointCloudSuperTile
			if (st.pointCloud) {
				this.state.scene.remove(st.pointCloud)
				this.renderScene() // can potentially remove but added it just in case
			}
			else {
				log.error('Attempting to remove super tile to scene - got a super tile with no point cloud')
			}
		}
	}

	// Add some easter eggs to the scene if they are close enough.
	loadDecorations(): Promise<void> {
		return getDecorations().then(decorations => {

			decorations.forEach(decoration => {
				const position = this.props.utmCoordinateSystem.lngLatAltToThreeJs(decoration.userData)
				const distanceFromOrigin = position.length()
				if (distanceFromOrigin < this.state.maxDistanceToDecorations) {
					// Don't worry about rotation. The object is just floating in space.
					decoration.position.set(position.x, position.y, position.z)

					const decorations = this.state.decorations
					decorations.push(decoration)
					new AnnotatedSceneActions().addObjectToScene(decoration)
				}
			})

			this.setState({decorations: [...this.state.decorations]})

		})
	}

	private showDecorations() {
		this.state.decorations.forEach(d => d.visible = true)
		this.renderScene()
	}

	private hideDecorations() {
		this.state.decorations.forEach(d => d.visible = false)
		this.renderScene()
	}

	resetTiltAndCompass(): void {
		if(!this.orbitControls) {
			log.error("Orbit controls not set, unable to reset tilt and compass")
			return
		}

		const distanceCameraToTarget = this.state.camera.position.distanceTo(this.orbitControls.target)
		const camera = this.state.camera
		camera.position.x = this.orbitControls.target.x
		camera.position.y = this.orbitControls.target.y + distanceCameraToTarget
		camera.position.z = this.orbitControls.target.z

		this.orbitControls.update()
		this.renderScene()
	}

	private setCompassRosePosition(x, y, z) {
		if (!this.state.compassRose){
			log.error("Unable to find compassRose")
			return
		} else {
			const compassRose = this.state.compassRose
			compassRose.position.set(x, y, z)
		}

		this.renderScene()
	}

	// Switch the camera between two views. Attempt to keep the scene framed in the same way after the switch.
	// @TODO long term move to the camera manager
	toggleCameraType(): void {
		let oldCamera: THREE.Camera
		let newCamera: THREE.Camera
		let newType: CameraType
		if (this.state.camera === this.state.perspectiveCamera) {
			oldCamera = this.state.perspectiveCamera
			newCamera = this.state.orthographicCamera
			newType = CameraType.ORTHOGRAPHIC
		} else {
			oldCamera = this.state.orthographicCamera
			newCamera = this.state.perspectiveCamera
			newType = CameraType.PERSPECTIVE
		}

		// Copy over the camera position. When the next animate() runs, the new camera will point at the
		// same target as the old camera, since the target is maintained by OrbitControls. That takes
		// care of position and orientation, but not zoom. PerspectiveCamera and OrthographicCamera
		// calculate zoom differently. It would be nice to convert one to the other here.
		newCamera.position.set(oldCamera.position.x, oldCamera.position.y, oldCamera.position.z)

		// used to be --> this.annotatorCamera = newCamera
		this.setState({camera: newCamera})
		new AnnotatedSceneActions().setCamera(this.state.camera)

		this.onResize()


		const orbitControls = this.orbitControls
		// tslint:disable-next-line:no-any
		;(orbitControls as any).setCamera(newCamera)

		// RYAN UPDATED
		// this.statusWindow.setMessage(statusKey.cameraType, 'Camera: ' + newType)
		new StatusWindowActions().setMessage(StatusKey.CAMERA_TYPE, 'Camera: ' + newType)


		// TODO JOE WEDNESDAY save camera state in a LocalStorage instance and
		// reload it next time the app starts
		//
		// enum cameraTypes = {
		// 	orthographic: 'orthographic',
		// 	perspective: 'perspective',
		// }
		//
		// this.storage.getItem('cameraPreference', cameraTypes.perspective)
		//
		new AnnotatedSceneActions().setCameraPreference(newType)
		this.renderScene()
	}

	componentWillReceiveProps(newProps:SceneManagerProps) {
		if(newProps.compassRosePosition && newProps.compassRosePosition !== this.props.compassRosePosition) {
			const position = newProps.compassRosePosition
			this.setCompassRosePosition(position.x, position.y, position.z)
		}

		if(newProps.isDecorationsVisible !== this.props.isDecorationsVisible) {
			if(newProps.isDecorationsVisible) {
				this.showDecorations()
			} else {
				this.hideDecorations()
			}
		}

		if(newProps.orbitControlsTargetPoint && newProps.orbitControlsTargetPoint !== this.props.orbitControlsTargetPoint) {
			this.updateOrbitControlsTargetPoint(newProps.orbitControlsTargetPoint)
		}

		// RT 7/12 Commented out and using an eventEmitter instead -- see constructor
		// if(newProps.pointCloudSuperTiles !== this.props.pointCloudSuperTiles) {
		// 	const { added, removed } = getOrderedMapValueDiff( this.props.pointCloudSuperTiles, newProps.pointCloudSuperTiles )
        //
		// 	added && added.forEach(tile => this.addSuperTile(tile!))
		// 	removed && removed.forEach(tile => this.removeSuperTile(tile!))
		// }

		// Handle adding and removing scene objects
		if(newProps.sceneObjects != this.props.sceneObjects) {
			const newSceneObjects = newProps.sceneObjects!
			const existingSceneObjects = this.props.sceneObjects!
			this.updateSceneObjects(newSceneObjects, existingSceneObjects)
		}

		if(newProps.transformedObjects != this.props.transformedObjects) {
			if (newProps.transformedObjects) {
				this.transformControls.attach(newProps.transformedObjects)
			}
			else {
				this.transformControls.detach()
			}
			this.renderScene()
		}

		if (newProps.transformControlsMode !== this.props.transformControlsMode) {
			this.transformControls.setMode(newProps.transformControlsMode)
			this.renderScene()
		}

		// Triggered by UTMCoordinateSystem.setOrigin
		// NOTE ORIGIN JOE at the moment only happens once, but in the future will happens any number of times
		if (newProps.isInitialOriginSet !== this.props.isInitialOriginSet) {
			this.loadDecorations()
		}

	}

	componentDidUpdate(oldProps) {
		if (oldProps.width !== this.props.width || oldProps.height !== this.props.height) {
			this.onResize()
		}
	}

	componentDidMount() {
		const [width, height]: Array<number> = this.getSize()

		this.createOrthographicCameraDimensions(width, height)

		new AnnotatedSceneActions().setCamera(this.state.camera)


		this.makeStats()
		this.props.container.appendChild(this.state.renderer.domElement)
		this.startAnimation()

		this.onResize()
	}

	componentWillUnmount() {
		this.stopAnimation()
		this.destroyStats()
		this.state.renderer.domElement.remove()
	}

	// This is from React.Component.render, not related to WebGL rendering
	render() {
		return null
	}

}
