/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as THREE from 'three'
import * as React from 'react'
import {AnimationLoop, ChildAnimationLoop} from 'animation-loop'
import {CameraType} from '@/mapper-annotated-scene/src/models/CameraType'
import {Sky} from '@/mapper-annotated-scene/src/services/controls/Sky'
import config from '@/config'
import {CompassRose} from '@/mapper-annotated-scene/src/services/controls/CompassRose'
import AnnotatedSceneActions from '@/mapper-annotated-scene/src/store/actions/AnnotatedSceneActions.ts'
import Logger from '@/util/log'
import {OrbitControls} from '@/mapper-annotated-scene/src/services/controls/OrbitControls'
import {getValue} from 'typeguard'
import {typedConnect} from '@/mapper-annotated-scene/src/styles/Themed'
import toProps from '@/util/toProps'
import {UtmCoordinateSystem} from '@/mapper-annotated-scene/UtmCoordinateSystem'
import {getDecorations} from '@/mapper-annotated-scene/Decorations'
import {StatusKey} from '@/mapper-annotated-scene/src/models/StatusKey'
import StatusWindowActions from '@/mapper-annotated-scene/StatusWindowActions'
import {EventEmitter} from 'events'
import AreaOfInterestManager from '@/mapper-annotated-scene/src/services/AreaOfInterestManager'
import * as Stats from 'stats.js'
import {Events} from '@/mapper-annotated-scene/src/models/Events'
import {Set} from 'immutable'
import {THREEColorValue} from '@/mapper-annotated-scene/src/THREEColorValue-type'
import {TransformControls} from '@/mapper-annotated-scene/src/services/controls/TransformControls'
import {isTupleOfNumbers} from '@/util/Validation'

const log = Logger(__filename)

export interface SceneManagerProps {

	// TODO JOE We need to handle background color changes, currently backgroundColor is used only in constructor
	backgroundColor?: THREEColorValue

	width: number
	height: number
	areaOfInterestManager: AreaOfInterestManager
	shouldAnimate?: boolean
	compassRosePosition?: THREE.Vector3
	isDecorationsVisible?: boolean
	orbitControlsTargetPoint?: THREE.Vector3
	utmCoordinateSystem: UtmCoordinateSystem
	channel: EventEmitter
	sceneObjects?: Set<THREE.Object3D>
	transformedObjects?: Array<THREE.Object3D>
	cameraPreference?: CameraType
	container: HTMLDivElement
	transformControlsMode?: 'translate' | 'rotate' | 'scale'
	isInitialOriginSet?: boolean
}
export interface SceneManagerState {
}
@typedConnect(toProps(
	'shouldAnimate',
	'compassRosePosition',
	'isDecorationsVisible',
	'orbitControlsTargetPoint',
	'sceneObjects',
	'transformedObjects',
	'cameraPreference',
	'transformControlsMode',
	'isInitialOriginSet',
))
export class SceneManager extends React.Component<SceneManagerProps, SceneManagerState> {
	private perspectiveOrbitControls: THREE.OrbitControls
	private orthoOrbitControls: THREE.OrbitControls
	private transformControls: THREE.TransformControls // controller for translating an object within the scene
	private hideTransformControlTimer: number

	private camera: THREE.Camera
	private perspectiveCamera: THREE.PerspectiveCamera
	private orthographicCamera: THREE.OrthographicCamera
	private scene: THREE.Scene
	private compassRose: THREE.Object3D
	private renderer: THREE.WebGLRenderer
	private loop: AnimationLoop
	private cameraOffset: THREE.Vector3

	private orthoCameraHeight: number
	private cameraPosition2D: THREE.Vector2
	private cameraToSkyMaxDistance: number

	private sky: THREE.Object3D
	private skyPosition2D: THREE.Vector2

	private maxDistanceToDecorations: number // meters

	private decorations: THREE.Object3D[] // arbitrary objects displayed with the point cloud
	private stats: Stats | null

	constructor(props: SceneManagerProps) {
		super(props)

		const {width, height} = this.props
		const loop = new AnimationLoop()
		const animationFps = config['startup.render.fps']

		loop.interval = animationFps === 'device' || animationFps === 'max'
			? false
			: 1 / (animationFps || 10)

		this.loop = loop

		const scene = new THREE.Scene()

		this.scene = scene

		this.perspectiveCamera = new THREE.PerspectiveCamera(70, width / height, 0.1, 10000)
		this.orthographicCamera = new THREE.OrthographicCamera(1, 1, 1, 1, -500, 10000)
		this.orthographicCamera.zoom = 3.25 // start the ortho cam at approximately the same "zoom" as the perspective camera

		// defaults to PerspectiveCamera because cameraPreference is undefined at first
		if (props.cameraPreference === CameraType.ORTHOGRAPHIC)
			this.camera = this.orthographicCamera
		else
			this.camera = this.perspectiveCamera

		const showCameraFocusPoint = false

		if (showCameraFocusPoint) {
			const debugSphere = new THREE.Mesh(new THREE.SphereGeometry(0.5), new THREE.MeshBasicMaterial({color: new THREE.Color(0xffffff)}))

			debugSphere.position.z = -100
			this.camera.add(debugSphere)
		}

		scene.add(this.perspectiveCamera)
		scene.add(this.orthographicCamera)

		const skyRadius = 8000
		const cameraToSkyMaxDistance = skyRadius * 0.05
		const skyPosition2D = new THREE.Vector2()

		this.cameraPosition2D = new THREE.Vector2()
		this.cameraToSkyMaxDistance = cameraToSkyMaxDistance

		const background = props.backgroundColor || 'gray'
		// Draw the sky.
		const sky = Sky(new THREE.Color(background as number), new THREE.Color(0xccccff), skyRadius)

		scene.add(sky)

		this.sky = sky
		this.skyPosition2D = skyPosition2D

		this.maxDistanceToDecorations = 50000
		this.decorations = []
		this.stats = this.makeStats()

		this.orthoCameraHeight = 100 // enough to view ~1 city block of data

		let cameraOffset = new THREE.Vector3(0, 400, 200)

		if (config['startup.camera_offset']) {
			const configCameraOffset: [number, number, number] = config['startup.camera_offset']

			if (isTupleOfNumbers(configCameraOffset, 3))
				cameraOffset = new THREE.Vector3().fromArray(configCameraOffset)
			else if (configCameraOffset)
				log.warn(`invalid startup.camera_offset config: ${configCameraOffset}`)
		}

		this.cameraOffset = cameraOffset

		// Create GL Renderer
		const renderer = new THREE.WebGLRenderer({antialias: true})

		renderer.setClearColor(new THREE.Color(background as number))
		renderer.setPixelRatio(window.devicePixelRatio)
		renderer.setSize(width, height)
		this.renderer = renderer

		this.perspectiveOrbitControls = this.createOrbitControls(this.perspectiveCamera, renderer)
		this.orthoOrbitControls = this.createOrbitControls(this.orthographicCamera, renderer)

		// Add some lights
		scene.add(new THREE.AmbientLight(new THREE.Color(0xffffff)))

		const compassRoseLength = parseFloat(config['annotator.compass_rose_length']) || 0

		let compassRose

		if (compassRoseLength > 0) {
			compassRose = CompassRose(compassRoseLength)
			compassRose.rotateX(Math.PI / -2)
			scene.add(compassRose)
		} else {
			compassRose = null
		}

		this.compassRose = compassRose

		this.initTransformControls()

		this.onResize()

		// Point the camera at some reasonable default location.
		this.setStage(0, 0, 0)

		// starts tracking time, but GPU use is still at 0% at this moment
		// because there are no animation functions added to the loop yet.
		loop.start()

		loop.addBaseFn(() => {
			// let other code have the opportunity to hook in before redraw
			this.props.channel.emit(Events.SCENE_WILL_RENDER)

			this.renderThree()
		})

		this.stats && loop.addAnimationFn(() => {
			this.stats!.update()
		})

		this.props.channel.on(Events.SCENE_SHOULD_RENDER, this.renderScene)

		new AnnotatedSceneActions().setSceneInitialized(true)
	}

	private renderThree = (): void => {
		this.renderer.render(this.scene, this.camera)
	}

	// used to be called renderAnnotator
	renderScene = (): void => {
		// force a tick which causes renderer.render to be called
		this.loop.forceTick()
	}

	/**
	 * Create Transform controls object. This allows for the translation of an object in the scene.
	 */
	// IDEA JOE TransformControls logic could possibly go in a new
	// TransformControlManaager class, which knows which object is currently
	// selected.
	initTransformControls(): void {
		this.transformControls = new TransformControls(this.camera, this.renderer.domElement, false) as THREE.TransformControls

		new AnnotatedSceneActions().addObjectToScene(this.transformControls)

		this.transformControls.addEventListener('change', () => {
			// we transformed something, the scene needs to be redrawn
			this.renderScene()

			// If we are interacting with the transform object don't hide it.
			this.cancelHideTransform()
		})

		// If we just clicked on a transform object don't hide it.
		this.transformControls.addEventListener('mouseDown', this.cancelHideTransform)

		// If we are done interacting with a transform object start hiding process.
		this.transformControls.addEventListener('mouseUp', this.delayHideTransform)

		// If the object attached to the transform object has changed, do something.
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
		if (this.hideTransformControlTimer)
			window.clearTimeout(this.hideTransformControlTimer)
	}

	cleanTransformControls = (): void => {
		this.cancelHideTransform()
		this.transformControls.detach()
		new AnnotatedSceneActions().setTransformControlsAttached(false)
		this.renderScene()
	}

	private createOrbitControls(camera: THREE.Camera, renderer: THREE.WebGLRenderer): THREE.OrbitControls {
		const orbitControls = new OrbitControls(camera, renderer.domElement)

		orbitControls.enabled = true
		orbitControls.enablePan = true
		orbitControls.minDistance = 10
		orbitControls.maxDistance = 5000
		orbitControls.minPolarAngle = 0
		orbitControls.maxPolarAngle = Math.PI / 2
		orbitControls.keyPanSpeed = 100

		orbitControls.addEventListener('change', () => {
			// we've moved the camera, the scene should be redrawn
			this.renderScene()

			this.updateSkyPosition()
		})

		orbitControls.addEventListener('start', () => {
			new AnnotatedSceneActions().cameraIsOrbiting(true)
		})

		orbitControls.addEventListener('end', () => {
			new AnnotatedSceneActions().cameraIsOrbiting(false)
		})

		return orbitControls as THREE.OrbitControls
	}

	private updateSceneObjects(newSceneObjects: Set<THREE.Object3D>, existingSceneObjects: Set<THREE.Object3D>) {
		const scene = this.scene

		newSceneObjects.forEach(object => {
			if (!existingSceneObjects.has(object!)) {
				// Not found in the existing objects, let's ADD it to the scene
				scene.add(object!)
			}
		})

		existingSceneObjects.forEach(object => {
			if (!newSceneObjects.has(object!)) {
				// Not found in the new objects, let's REMOVE it
				scene.remove(object!)
			}
		})

		this.renderScene()
	}

	private makeStats(): Stats | null {
		if (!config['startup.show_stats_module']) return null

		// Create stats widget to display frequency of rendering
		const stats = new Stats()

		stats.dom.style.top = 'initial' // disable existing setting
		stats.dom.style.bottom = '50px' // above Mapper logo
		stats.dom.style.left = '13px'
		this.props.container.appendChild(stats.dom)

		return stats
	}

	private destroyStats(): void {
		this.stats && this.stats.dom.remove()
	}

	/**
	 * updateOrbitControlsTargetPoint is called via componentWillReceiveProps.
	 * Specifically AnnotatedSceneController.focusOnPointCloud -> PointCloudManager.focusOnPointCloud -> Redux Action
	 * @param {Vector3} point
	 */
	updateOrbitControlsTargetPoint(point: THREE.Vector3): void {
		this.perspectiveOrbitControls.target.set(point.x, point.y, point.z)
		this.orthoOrbitControls.target.set(point.x, point.y, point.z)
		this.perspectiveOrbitControls.update()
		this.orthoOrbitControls.update()
		this.renderScene()
	}

	private startAnimation(): void {
		new AnnotatedSceneActions().setShouldAnimate(true)
	}

	private stopAnimation(): void {
		new AnnotatedSceneActions().setShouldAnimate(false)
	}

	// IDEA JOE maybe instead of proxying, we let app code (f.e. Annotator,
	// Kiosk, and AnnotatedSceneController) get a ref to the loop to call these
	// methods. Maybe AnnotatedSceneController exposes either the loop reference, or
	// proxy methods, for apps to use.
	//
	// {{{

	addAnimationFunction(fn) {
		this.loop.addAnimationFn(fn)
	}

	removeAnimationFunction(fn) {
		this.loop.removeAnimationFn(fn)
	}

	pauseEverything(): void {
		this.loop.pause()
	}

	resumeEverything(): void {
		this.loop.start()
	}

	// }}}

	removeCompassFromScene(): void {
		const scene = this.scene

		if (this.compassRose)
			scene.remove(this.compassRose)
	}

	enableOrbitControls(): void {
		this.perspectiveOrbitControls.enabled = true
		this.orthoOrbitControls.enabled = true
	}

	getCamera(): THREE.Camera {
		return this.camera
	}

	addChildAnimationLoop(childLoop: ChildAnimationLoop): void {
		this.loop.addChildLoop(childLoop)
	}

	getRendererDOMElement() {
		return this.renderer.domElement
	}

	// Scale the ortho camera frustum along with window dimensions to preserve a 1:1
	// proportion for model width:height.
	private createOrthographicCameraDimensions(width: number, height: number): void {
		const orthoWidth = this.orthoCameraHeight * (width / height)
		const orthoHeight = this.orthoCameraHeight
		const orthographicCamera = this.orthographicCamera

		orthographicCamera.left = orthoWidth / -2
		orthographicCamera.right = orthoWidth / 2
		orthographicCamera.top = orthoHeight / 2
		orthographicCamera.bottom = orthoHeight / -2
		orthographicCamera.updateProjectionMatrix()
	}

	// Move all visible elements into position, centered on a coordinate.
	// IDEA JOE long term move to Camera Manager
	setStage(x: number, y: number, z: number, resetCamera = true): void {
		new AnnotatedSceneActions().setSceneStage(new THREE.Vector3(x, y, z))

		if (resetCamera) {
			const {cameraOffset} = this

			this.perspectiveCamera.position.set(x, y, z).add(cameraOffset)
			this.orthographicCamera.position.set(x, y, z).add(cameraOffset)

			this.perspectiveOrbitControls.target.set(x, y, z)
			this.orthoOrbitControls.target.set(x, y, z)
			this.perspectiveOrbitControls.update()
			this.orthoOrbitControls.update()
		}

		this.renderScene()
	}

	// The sky needs to be big enough that we don't bump into it but not so big that the camera can't see it.
	// So make it pretty big, then move it around to keep it centered over the camera in the XZ plane. Sky radius
	// and camera zoom settings, set elsewhere, should keep the camera from penetrating the shell in the Y dimension.
	//
	// IDEA JOE longer term a SkyBoxManager can add SkyBox as a layer, and update the position based on camera position boradcasted from a CameraManager
	updateSkyPosition = (): void => {
		const {cameraPosition2D, skyPosition2D, cameraToSkyMaxDistance, sky, camera} = this

		cameraPosition2D.set(camera.position.x, camera.position.z)

		if (cameraPosition2D.distanceTo(skyPosition2D) > cameraToSkyMaxDistance) {
			sky.position.setX(cameraPosition2D.x)
			sky.position.setZ(cameraPosition2D.y)
			skyPosition2D.set(sky.position.x, sky.position.z)
		}
	}

	private getSize = (): Array<number> => {
		return getValue(() => [this.props.width, this.props.height], [0, 0])
	}

	private onResize = (): void => {
		const [width, height]: Array<number> = this.getSize()

		this.perspectiveCamera.aspect = width / height
		this.perspectiveCamera.updateProjectionMatrix()

		this.createOrthographicCameraDimensions(width, height)

		this.renderer.setSize(width, height)
		new AnnotatedSceneActions().setRendererSize({width, height})
		this.renderScene()
	}

	// IDEA JOE Camera Manager
	adjustCameraXOffset(value: number): void {
		const cameraOffset = this.cameraOffset

		cameraOffset.x += value
	}

	// IDEA JOE Camera Manager
	adjustCameraYOffset(value: number): void {
		const cameraOffset = this.cameraOffset

		cameraOffset.y += value
	}

	// Add some easter eggs to the scene if they are close enough.
	loadDecorations(): Promise<void> {
		return getDecorations().then(decorations => {
			decorations.forEach(decoration => {
				const position = this.props.utmCoordinateSystem.lngLatAltToThreeJs(decoration.userData)
				const distanceFromOrigin = position.length()

				if (distanceFromOrigin < this.maxDistanceToDecorations) {
					// Don't worry about rotation. The object is just floating in space.
					decoration.position.set(position.x, position.y, position.z)

					const decorations = this.decorations

					decorations.push(decoration)
					new AnnotatedSceneActions().addObjectToScene(decoration)
				}
			})
		})
	}

	private showDecorations() {
		this.decorations.forEach(d => {
			d.visible = true
		})

		this.renderScene()
	}

	private hideDecorations() {
		this.decorations.forEach(d => {
			d.visible = false
		})

		this.renderScene()
	}

	resetTiltAndCompass(): void {
		const distanceCameraToTarget = this.camera.position.distanceTo(this.perspectiveOrbitControls.target)
		const camera = this.camera

		camera.position.x = this.perspectiveOrbitControls.target.x
		camera.position.y = this.perspectiveOrbitControls.target.y + distanceCameraToTarget
		camera.position.z = this.perspectiveOrbitControls.target.z

		this.perspectiveOrbitControls.update()
		this.orthoOrbitControls.update()
		this.renderScene()
	}

	private setCompassRosePosition(x: number, y: number, z: number): void {
		if (!this.compassRose) {
			log.error('Unable to find compassRose')
			return
		} else {
			const compassRose = this.compassRose

			compassRose.position.set(x, y, z)
		}

		this.renderScene()
	}

	// Switch the camera between two views. Attempt to keep the scene framed in the same way after the switch.
	// IDEA JOE long term move to the camera manager
	toggleCameraType(): void {
		let oldCamera: THREE.Camera
		let newCamera: THREE.Camera
		let newType: CameraType

		if (this.camera === this.perspectiveCamera) {
			oldCamera = this.perspectiveCamera
			newCamera = this.orthographicCamera
			newType = CameraType.ORTHOGRAPHIC
		} else {
			oldCamera = this.orthographicCamera
			newCamera = this.perspectiveCamera
			newType = CameraType.PERSPECTIVE
		}

		// Copy over the camera position. When the next animate() runs, the new camera will point at the
		// same target as the old camera, since the target is maintained by OrbitControls. That takes
		// care of position and orientation, but not zoom. PerspectiveCamera and OrthographicCamera
		// calculate zoom differently. It would be nice to convert one to the other here.
		newCamera.position.set(oldCamera.position.x, oldCamera.position.y, oldCamera.position.z)

		this.camera = newCamera
		new AnnotatedSceneActions().setCamera(this.camera)

		this.onResize()

		this.transformControls.setCamera(newCamera)
		this.transformControls.update()

		new StatusWindowActions().setMessage(StatusKey.CAMERA_TYPE, 'Camera: ' + newType)

		new AnnotatedSceneActions().setCameraPreference(newType)
		this.renderScene()
	}

	private addObjectsToScene(objects: THREE.Object3D[]): void {
		this.scene.add.apply(this.scene, objects)
	}

	componentWillReceiveProps(newProps: SceneManagerProps): void {
		if (newProps.compassRosePosition && newProps.compassRosePosition !== this.props.compassRosePosition) {
			const position = newProps.compassRosePosition

			this.setCompassRosePosition(position.x, position.y, position.z)
		}

		if (newProps.isDecorationsVisible !== this.props.isDecorationsVisible) {
			if (newProps.isDecorationsVisible)
				this.showDecorations()
			else
				this.hideDecorations()
		}

		if (newProps.orbitControlsTargetPoint && newProps.orbitControlsTargetPoint !== this.props.orbitControlsTargetPoint)
			this.updateOrbitControlsTargetPoint(newProps.orbitControlsTargetPoint)

		// Handle adding and removing scene objects
		// TODO JOE This diffing is noticeably slow once there's many obbjects
		// in the scene. Replace with something else.
		if (newProps.sceneObjects !== this.props.sceneObjects) {
			const newSceneObjects = newProps.sceneObjects!
			const existingSceneObjects = this.props.sceneObjects!

			this.updateSceneObjects(newSceneObjects, existingSceneObjects)
		}

		if (newProps.transformedObjects !== this.props.transformedObjects) {
			if (newProps.transformedObjects) {
				this.transformControls.attach(newProps.transformedObjects)
				new AnnotatedSceneActions().setTransformControlsAttached(true)
			} else {
				this.transformControls.detach()
				new AnnotatedSceneActions().setTransformControlsAttached(false)
			}

			this.renderScene()
		}

		if (newProps.transformControlsMode !== this.props.transformControlsMode) {
			this.transformControls.setMode(newProps.transformControlsMode)
			this.renderScene()
		}

		// Triggered by UTMCoordinateSystem.setOrigin
		// NOTE JOE at the moment this only happens once, but in the future will happens any number of times
		if (newProps.isInitialOriginSet !== this.props.isInitialOriginSet)
			this.loadDecorations()
	}

	componentDidUpdate(oldProps): void {
		if (oldProps.width !== this.props.width || oldProps.height !== this.props.height)
			this.onResize()
	}

	componentDidMount(): void {
		// be sure to add any initial objects that may already be in the `sceneObjects` prop
		this.props.sceneObjects && this.addObjectsToScene(this.props.sceneObjects.toArray())

		new AnnotatedSceneActions().setCamera(this.camera)

		this.props.container.appendChild(this.renderer.domElement)
		this.startAnimation()

		this.onResize()

		this.renderScene()
	}

	componentWillUnmount(): void {
		this.stopAnimation()
		this.destroyStats()
		this.renderer.domElement.remove()
	}

	// This is from React.Component.render, not related to WebGL rendering
	render(): JSX.Element | null {
		return null
	}
}
