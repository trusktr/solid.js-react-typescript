import * as THREE from "three";
import * as React from "react"
import {AnimationLoop, ChildAnimationLoop} from 'animation-loop'
import RoadEditorState from "@/annotator-z-hydra-shared/src/store/state/RoadNetworkEditorState";
import {CameraType} from "@/annotator-z-hydra-shared/src/models/CameraType";
import {Sky} from "@/annotator-entry-ui/controls/Sky";
import config from "@/config";
import {AxesHelper} from "@/annotator-entry-ui/controls/AxesHelper";
import {CompassRose} from "@/annotator-entry-ui/controls/CompassRose";
import RoadNetworkEditorActions from "@/annotator-z-hydra-shared/src/store/actions/RoadNetworkEditorActions";
import Logger from "@/util/log";
import {OrbitControls} from "@/annotator-entry-ui/controls/OrbitControls";
import {getValue} from "typeguard";
import {typedConnect} from "@/annotator-z-hydra-shared/src/styles/Themed";
import {createStructuredSelector} from "reselect";
import {ScaleProvider} from "@/annotator-entry-ui/tile/ScaleProvider";
import {UtmCoordinateSystem} from "@/annotator-entry-ui/UtmCoordinateSystem";
import {getDecorations} from "@/annotator-entry-ui/Decorations";
import PointCloudManager from "@/annotator-z-hydra-shared/src/services/PointCloudManager";
import {StatusKey} from "@/annotator-z-hydra-shared/src/models/StatusKey";
import StatusWindowActions from "@/annotator-z-hydra-shared/StatusWindowActions";

const log = Logger(__filename)

export interface SceneManagerProps {
	width: number
	height: number
	shouldAnimate ?: boolean
  compassRosePosition ?: THREE.Vector3
  isDecorationsVisible ?: boolean
  orbitControlsTargetPoint ?: THREE.Vector3
}



export interface SceneManagerState {
	plane: THREE.Mesh
	grid: THREE.GridHelper
	axis: THREE.Object3D
	camera: THREE.Camera
	perspectiveCamera: THREE.PerspectiveCamera
	orthographicCamera: THREE.OrthographicCamera
	flyThroughCamera: THREE.PerspectiveCamera
	scene: THREE.Scene
	compassRose: THREE.Object3D
	renderer: THREE.WebGLRenderer
	loop: AnimationLoop
	cameraOffset: THREE.Vector3
	orbitControls: THREE.OrbitControls | null
	annotatorOrbitControls: THREE.OrbitControls
	flyThroughOrbitControls: THREE.OrbitControls

	orthoCameraHeight: number
	cameraPosition2D: THREE.Vector2
	cameraToSkyMaxDistance: number

	sky: THREE.Object3D
	skyPosition2D: THREE.Vector2
	updateOrbitControls: boolean

	registeredKeyDownEvents: Map<number, any> // mapping between KeyboardEvent.keycode and function to execute
	registeredKeyUpEvents: Map<number, any> // mapping between KeyboardEvent.keycode and function to execute

	pointCloudManager: PointCloudManager | null

	scaleProvider: ScaleProvider
	utmCoordinateSystem: UtmCoordinateSystem
	maxDistanceToDecorations: number // meters

	decorations: THREE.Object3D[] // arbitrary objects displayed with the point cloud
}


@typedConnect(createStructuredSelector({
	shouldAnimate: (state) => state.get(RoadEditorState.Key).shouldAnimate,
  compassRosePosition: (state) => state.get(RoadEditorState.Key).compassRosePosition,
  isDecorationsVisible: (state) => state.get(RoadEditorState.Key).isDecorationsVisible,
  orbitControlsTargetPoint: (state) => state.get(RoadEditorState.Key).orbitControlsTargetPoint,
}))
export class SceneManager extends React.Component<SceneManagerProps, SceneManagerState> {

	private sceneContainer: HTMLDivElement

	constructor(props) {
		super(props)
		log.info("Building scene in SceneManager")
		const {width, height} = this.props


		// Settings for component state
		const orthoCameraHeight = 100 // enough to view ~1 city block of data
		const cameraOffset = new THREE.Vector3(30, 10, 0)
		const skyRadius = 8000
		const cameraToSkyMaxDistance = skyRadius * 0.05
		const skyPosition2D = new THREE.Vector2()
		const updateOrbitControls = false

		const perspectiveCam = new THREE.PerspectiveCamera(70, width / height, 0.1, 10000)
		const orthographicCam = new THREE.OrthographicCamera(1, 1, 1, 1, 0, 10000)
		const flyThroughCamera = new THREE.PerspectiveCamera(70, width / height, 0.1, 10000)
		flyThroughCamera.position.set(800, 400, 0)

		const scene = new THREE.Scene()

		let camera;

		const cameraPreference = getRoadNetworkEditorStore().getState().get(RoadEditorState.Key).cameraPreference
		if (cameraPreference === CameraType.ORTHOGRAPHIC)
			camera = orthographicCam
		else
			camera = perspectiveCam

		this.setOrthographicCameraDimensions(width, height)

		// Add some lights
		scene.add(new THREE.AmbientLight(0xffffff))

		// Draw the sky.
		const background = new THREE.Color(config.get('startup.background_color') || '#082839')
		const sky = Sky(background, new THREE.Color(0xccccff), skyRadius)
		scene.add(sky)

		// Add a "ground plane" to facilitate annotations
		const planeGeometry = new THREE.PlaneGeometry(2000, 2000)
		planeGeometry.rotateX(-Math.PI / 2)
		const planeMaterial = new THREE.ShadowMaterial()
		planeMaterial.visible = false
		planeMaterial.side = THREE.DoubleSide // enable raycaster intersections from both sides

		const plane = new THREE.Mesh(planeGeometry, planeMaterial)
		scene.add(plane)


		// Add grid on top of the plane to visualize where the plane is.
		// Add an axes helper to visualize the origin and orientation of the primary directions.
		const axesHelperLength = parseFloat(config.get('annotator.axes_helper_length')) || 0
		let grid;
		let axis;
		if (axesHelperLength > 0) {
			const gridSize = parseFloat(config.get('annotator.grid_size')) || 200
			const gridUnit = parseFloat(config.get('annotator.grid_unit')) || 10
			const gridDivisions = gridSize / gridUnit

			grid = new THREE.GridHelper(gridSize, gridDivisions, new THREE.Color('white'))
			grid!.material.opacity = 0.25
			grid!.material.transparent = true
			scene.add(grid)

			axis = AxesHelper(axesHelperLength)
			scene.add(axis)
		} else {
			grid = null
			axis = null
		}

		const compassRoseLength = parseFloat(config.get('annotator.compass_rose_length')) || 0
		let compassRose;
		if (compassRoseLength > 0) {
			compassRose = CompassRose(compassRoseLength)
			compassRose.rotateX(Math.PI / -2)
			scene.add(compassRose)
		} else
			compassRose = null

		// @TODO Joe to add annotationManager at later time -- not needed in scene for Beholder??

		// Create GL Renderer
		const renderer = new THREE.WebGLRenderer({antialias: true})
		renderer.setClearColor(background)
		renderer.setPixelRatio(window.devicePixelRatio)
		renderer.setSize(width, height)


		// Add Listeners
		window.addEventListener('resize', this.onWindowResize)
		window.addEventListener('keydown', this.onKeyDown)
		window.addEventListener('keyup', this.onKeyUp)

		// @TODO (Annotator-only) Add renderer domElement event listeners using 'registerDomEventElementEventListener' below

		// @TODO (Annotator-only) Bind events

		// @TODO Create the hamburger menu and display (open) it as requested.

		new RoadNetworkEditorActions().setUIMenuVisibility(config.get('startup.show_menu'))

		const loop = new AnimationLoop
		const animationFps = config.get('startup.renderScene.fps')
		loop.interval = animationFps === 'device' ? false : 1 / (animationFps || 10)

		const scaleProvider = new ScaleProvider()
		const utmCoordinateSystem = new UtmCoordinateSystem(this.onSetOrigin)

		this.state = {
			plane: plane,
			grid: grid,
			axis: axis,
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

			registeredKeyDownEvents: new Map<number, any>(),
			registeredKeyUpEvents: new Map<number, any>(),

			orbitControls: null,
			pointCloudManager: null,

			scaleProvider: scaleProvider,
			utmCoordinateSystem: utmCoordinateSystem,
			maxDistanceToDecorations: 50000,
			decorations: [],



		}

		// Initialize all control objects.
		const orbitControls = this.initOrbitControls()

		this.setState({orbitControls})



		// Point the camera at some reasonable default location.
		this.setStage(0, 0, 0)

		// starts tracking time, but GPU use is still at 0% at this moment
		// because there are no animation functions added to the loop yet.
		loop.start()

		loop.addBaseFn( () => {
			// if (this.stats) this.stats.update()
			renderer.render(scene, camera)
		})





		// @TODO - AnnotationManager needs to call loadUserData()

		new RoadNetworkEditorActions().setSceneInitialized(true)
	}

	componentWillReceiveProps(newProps) {
		if(newProps.compassRosePosition !== this.props.compassRosePosition) {
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

		if(newProps.orbitControlsTargetPoint !== this.props.orbitControlsTargetPoint) {
			this.updateOrbitControlsTargetPoint(newProps.orbitControlsTargetPoint)
		}
	}

	componentDidMount() {
		this.mount()

	}

	updateOrbitControlsTargetPoint(point:THREE.Vector3) {
    if(!this.state.orbitControls) {
      log.warn('[Migration ERROR] orbit controls are not initialized yet')
      return
    }

    const orbitControls = this.state.orbitControls
		orbitControls.target.set(point.x, point.y, point.z)
		orbitControls.update()
		this.renderScene()
	}



	async mount(): Promise<void> {
		this.sceneContainer.appendChild(this.state.renderer.domElement)

		// @TODO (annotator only)
		// this.createControlsGui()

		// this.makeStats()
		this.startAnimation()
	}

	// SHARED
	private startAnimation(): void {
		new RoadNetworkEditorActions().setShouldAnimate(true)

		// this.shouldAnimate = true
		this.startAoiUpdates()

		const loop = this.state.loop
		loop.addAnimationFn(() => {
			if ( !this.props.shouldAnimate ) return false


			// @TODO create a way to register animate methods
			// this.animate()

			return true
		})

		this.setState({
			loop: loop
		})
	}

	private startAoiUpdates(): void {
		const loop = this.state.loop

		loop.addAnimationFn(() => {
			if ( !this.props.shouldAnimate ) return false
			if (!this.state.pointCloudManager) {
				log.error( "[ERROR] pointCloudManager does not exist when it's expected!!")
				return
			}
			this.state.pointCloudManager.updatePointCloudAoi()
			return true
		})

		this.setState({
			loop: loop
		})
	}

	addObjectToScene(object:any) {
		const scene = this.state.scene
		scene.add(object)
		this.setState({
			scene: scene
		})
	}

	removeObjectToScene(object:any) {
		const scene = this.state.scene
		scene.remove(object)
		this.setState({
			scene: scene
		})
	}

	removeAxisFromScene() {
		const scene = this.state.scene
		if(this.state.axis) {
			scene.remove(this.state.axis)
		}
	}

	removeCompassFromScene() {
		const scene = this.state.scene
		if(this.state.compassRose) {
			scene.remove(this.state.compassRose)
		}
	}

	hideGridVisibility() {
		const grid = this.state.grid
		grid.visible = false
		this.setState({grid})
	}

	enableOrbitControls() {
		const orbitControls = this.state.orbitControls
		if(!orbitControls) {
			log.error("Orbit controls not found, unable to enable them")
			return
		}

		orbitControls.enabled = true
	}


	getCamera(): THREE.Camera {
		return this.state.camera
	}


	addChildLoop(childLoop: ChildAnimationLoop) {
		// this.loop.addChildLoop( FlyThroughManager.getAnimationLoop() )
		this.state.loop.addChildLoop( childLoop )
	}

	// @TODO FlyThroughManager.startLoop()


	// @TODO Annotator and Beholder must call this function on setup (register orbitControls)
	setOrbitControls(controls: THREE.OrbitControls) {
		this.setState({
			orbitControls: controls
		})
	}

	// @TODO to be used by annotator and flythrough to register cameras
	// Example: this.flyThroughCamera = new THREE.PerspectiveCamera(70, width / height, 0.1, 10000)
	// Example: this.flyThroughCamera.position.set(800, 400, 0)
	// addCamera(camera:THREE.Camera, key:string) {
	// 	const {cameras, scene} = this.state
	// 	scene.add(camera)
	// 	this.setState({
	// 		cameras: cameras.set(key, camera),
	// 		scene: scene
	// 	})
	// }

	getRendererDOMElement() {
		return this.state.renderer.domElement
	}


	// used to be called renderAnnotator
	renderScene = (): void => {
		// force a tick which causes renderer.renderScene to be called
		this.state.loop.forceTick()
	}

	// Scale the ortho camera frustum along with window dimensions to preserve a 1:1
	// proportion for model width:height.
	private setOrthographicCameraDimensions(width: number, height: number): void {
		const orthoWidth = this.state.orthoCameraHeight * (width / height)
		const orthoHeight = this.state.orthoCameraHeight

		const orthographicCamera = this.state.orthographicCamera
		orthographicCamera.left = orthoWidth / -2
		orthographicCamera.right = orthoWidth / 2
		orthographicCamera.top = orthoHeight / 2
		orthographicCamera.bottom = orthoHeight / -2
		orthographicCamera.updateProjectionMatrix()

		this.setState({
			orthographicCamera: orthographicCamera
		})
	}








	/**
	 * Move all visible elements into position, centered on a coordinate.
	 */
	// @TODO long term move to Camera Manager
	setStage(x: number, y: number, z: number, resetCamera: boolean = true): void {
		const {camera, cameraOffset, orbitControls, plane, grid} = this.state

		if(!orbitControls) {
			log.info("Unable to set SceneManager stage, orbitControls not found")
			return
		}


		plane.geometry.center()
		plane.geometry.translate(x, y, z)
		if (grid) {
			grid.geometry.center()
			grid.geometry.translate(x, y, z)
		}
		if (resetCamera) {
			camera.position.set(x + cameraOffset.x, y + cameraOffset.y, z + cameraOffset.z)

			// @TODO orbit controls will not be set on iniailization of Scene unless it's a required prop
			orbitControls.target.set(x, y, z)
			orbitControls.update()
			this.renderScene()
		}

		// Update state with new values
		this.setState({
			camera: camera,
			plane: plane,
			grid: grid,
			orbitControls: orbitControls
		})
	}










	// The sky needs to be big enough that we don't bump into it but not so big that the camera can't see it.
	// So make it pretty big, then move it around to keep it centered over the camera in the XZ plane. Sky radius
	// and camera zoom settings, set elsewhere, should keep the camera from penetrating the shell in the Y dimension.
	// @TODO Camera Manager will update sky position long term
	updateSkyPosition = (): void => {
		const {cameraPosition2D, skyPosition2D, cameraToSkyMaxDistance, sky, camera} = this.state

		cameraPosition2D.set(camera.position.x, camera.position.z)

		// this.uiState.cameraPosition2D.set(this.camera.position.x, this.camera.position.z)
		if (cameraPosition2D.distanceTo(skyPosition2D) > cameraToSkyMaxDistance) {
			sky.position.setX(cameraPosition2D.x)
			sky.position.setZ(cameraPosition2D.y)
			skyPosition2D.set(sky.position.x, sky.position.z)
		}

		this.setState({
			cameraPosition2D: cameraPosition2D,
			skyPosition2D: skyPosition2D,
			cameraToSkyMaxDistance: cameraToSkyMaxDistance,
			sky: sky,
		})
	}

	private initOrbitControls() {
		const orbitControls = new OrbitControls(this.state.camera, this.state.renderer.domElement)
		orbitControls.enabled = false
		orbitControls.minDistance = 10
		orbitControls.maxDistance = 5000
		orbitControls.minPolarAngle = 0
		orbitControls.maxPolarAngle = Math.PI / 2
		orbitControls.keyPanSpeed = 100
		orbitControls.enablePan = false

		orbitControls.addEventListener('change', this.updateSkyPosition)

		const fn = () => {}

		orbitControls.addEventListener('start', () => {
			this.state.loop.addAnimationFn(fn)
		})

		orbitControls.addEventListener('end', () => {
			this.state.loop.removeAnimationFn(fn)
		})

		return orbitControls
	}


	private getContainerSize = (): Array<number> => {
		return getValue(() => [this.props.width, this.props.height], [0, 0])
	}

	private onWindowResize = (): void => {
		const [width, height]: Array<number> = this.getContainerSize()
		const {camera, renderer} = this.state

		if ( camera instanceof THREE.PerspectiveCamera ) {
			camera.aspect = width / height
			camera.updateProjectionMatrix()
		} else {
			this.setOrthographicCameraDimensions(width, height)
		}

		renderer.setSize(width, height)
		this.renderScene()

		this.setState({
			camera: camera,
			renderer: renderer
		})
	}

	// @TODO RT-Tuesday -- move to Annotated Scene Controller
	registerKeyboardEvent(eventKeyCode:number, fn:any) {
		const registeredKeyboardEvents = this.state.registeredKeyDownEvents

		registeredKeyboardEvents.set(eventKeyCode, fn)
		this.setState({
			registeredKeyDownEvents: registeredKeyboardEvents
		})
	}


	registerDomEventElementEventListener(type:string, listener:any) {
		const renderer = this.state.renderer

		renderer.domElement.addEventListener(type, listener)
		this.setState({renderer: renderer})
	}

	// @TODO Camera Manager
	adjustCameraXOffset(value:number) {
    const cameraOffset = this.state.cameraOffset
    cameraOffset.x += value
    this.setState({cameraOffset})
  }

  // @TODO Camera Manager
  adjustCameraYOffset(value:number) {
    const cameraOffset = this.state.cameraOffset
    cameraOffset.y += value
    this.setState({cameraOffset})
  }

	/**
	 * Handle keyboard events
	 */
	// @TODO RT-Tuesday -- move to Annotated Scene Controller
	private onKeyDown = (event: KeyboardEvent): void => {
		if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return

		const fn = getValue(() => this.state.registeredKeyDownEvents.get(event.keyCode), () => {})
		fn()

		// REFERENCE OLD CODE BELOW
		// if (document.activeElement.tagName === 'INPUT')
		// 	this.onKeyDownInputElement(event)
		// else if (this.uiState.isLiveMode)
		// 	this.onKeyDownLiveMode(event)
		// else
		// 	this.onKeyDownInteractiveMode(event)
	}

	// @TODO RT-Tuesday -- move to Annotated Scene Controller
	private onKeyUp = (event: KeyboardEvent): void => {
		if (event.defaultPrevented) return

		const fn = getValue(() => this.state.registeredKeyUpEvents.get(event.keyCode), () => {})
		fn()
	}



	/**
	 * 	Set the camera directly above the current target, looking down.
	 */
	// @TODO RT-Tuesday -- move to Annotated Scene Controller
	// @TODO long term move orbit controls to Camera Manger
	resetTiltAndCompass(): void {
		if(!this.state.orbitControls) {
			log.error("Orbit controls not set, unable to reset tilt and compass")
			return
		}

		const distanceCameraToTarget = this.state.camera.position.distanceTo(this.state.orbitControls.target)
		const camera = this.state.camera
		camera.position.x = this.state.orbitControls.target.x
		camera.position.y = this.state.orbitControls.target.y + distanceCameraToTarget
		camera.position.z = this.state.orbitControls.target.z
		this.setState({camera})

		this.state.orbitControls.update()
		this.renderScene()
	}

	render() {
		return (
			<React.Fragment>
				<div className="scene-container" ref={(el): HTMLDivElement => this.sceneContainer = el!}/>
			</React.Fragment>
		)

	}



	private onSetOrigin = (): void => {
		this.loadDecorations().then()
	}


	// Add some easter eggs to the scene if they are close enough.
	private loadDecorations(): Promise<void> {
		return getDecorations().then(decorations => {
			decorations.forEach(decoration => {
				const position = this.state.utmCoordinateSystem.lngLatAltToThreeJs(decoration.userData)
				const distanceFromOrigin = position.length()
				if (distanceFromOrigin < this.state.maxDistanceToDecorations) {
					// Don't worry about rotation. The object is just floating in space.
					decoration.position.set(position.x, position.y, position.z)

					const decorations = this.state.decorations
					decorations.push(decoration)
					this.setState({decorations})
					this.addObjectToScene(decoration)
				}
			})
		})
	}
	private showDecorations() {
		this.state.decorations.forEach(d => d.visible = true)
		// @TODO @Joe/Ryan (see comment immediately below)
	}

	private hideDecorations() {
		this.state.decorations.forEach(d => d.visible = false)
		// @TODO @Joe (from ryan) should we render the scene again since the state isn't being update, just decorations?
		// ?? -- [ryan added] this.renderScene()
	}



  private setCompassRosePosition(x, y, z) {
    if (!this.state.compassRose){
    	log.error("Unable to find compassRose")
    	return
		} else {
    	const compassRose = this.state.compassRose
      compassRose.position.set(x, y, z)
			this.setState({compassRose})
		}
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

    this.onWindowResize()

    this.transformControls.setCamera(newCamera)
    this.annotatorOrbitControls.setCamera(newCamera)
    this.flyThroughOrbitControls.setCamera(newCamera)

    // RYAN UPDATED
    // this.statusWindow.setMessage(statusKey.cameraType, 'Camera: ' + newType)
    new StatusWindowActions().setMessage(StatusKey.CAMERA_TYPE, 'Camera: ' + newType)


	// TODO JOE WEDNESDAY save camera state in LocalStorage and reload it next time the app starts
	// enum cameraTypes = {
	// 	orthographic: 'orthographic',
	// 	perspective: 'perspective',
	// }
	// f.e. this.storage.getItem('cameraPreference', cameraTypes.perspective)
	new RoadNetworkEditorActions().setCameraPreference(newType)
    this.renderScene()
  }

}
