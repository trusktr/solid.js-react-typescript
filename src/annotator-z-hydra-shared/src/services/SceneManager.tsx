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
import LayerManager, {Layer} from "@/annotator-z-hydra-shared/src/services/LayerManager";
import FlyThroughManager from "@/annotator-z-hydra-kiosk/FlyThroughManager";
import LayerToggle from "@/annotator-z-hydra-shared/src/models/LayerToggle";

const log = Logger(__filename)

export interface SceneManagerProps {
	width: number
	height: number
	// orbitControls: THREE.OrbitControls
	shouldAnimate ?: boolean
}

export interface SceneManagerState {
	// width: number
	// height: number
	plane: THREE.Mesh
	grid: THREE.GridHelper
	axis: THREE.Object3D
	camera: THREE.Camera
	perspectiveCamera: THREE.PerspectiveCamera
	orthographicCamera: THREE.OrthographicCamera
	scene: THREE.Scene
	compassRose: THREE.Object3D
	renderer: THREE.WebGLRenderer
	loop: AnimationLoop
	cameraOffset: THREE.Vector3
	orbitControls ?: THREE.OrbitControls
	orthoCameraHeight: number
	cameraPosition2D: THREE.Vector2
	cameraToSkyMaxDistance: number

	sky: THREE.Object3D
	skyPosition2D: THREE.Vector2
	updateOrbitControls: boolean

	registeredKeyDownEvents: Map<number, any> // mapping between KeyboardEvent.keycode and function to execute
	registeredKeyUpEvents: Map<number, any> // mapping between KeyboardEvent.keycode and function to execute

	layerManager: LayerManager | null
}


@typedConnect(createStructuredSelector({
	shouldAnimate: (state) => state.get(RoadEditorState.Key).shouldAnimate,
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

		const scene = new THREE.Scene()
		let camera;

		const cameraPreference = getRoadNetworkEditorStore().getState().get(RoadEditorState.Key).cameraPreference
		if (cameraPreference === CameraType.ORTHOGRAPHIC)
			camera = orthographicCam
		else
			camera = perspectiveCam

		// @TODO handle flyThroughCamera (see below with addCamera)


		// this.setOrthographicCameraDimensions(width, height) -- moved to bottom

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


    this.state = {
      plane: plane,
      grid: grid,
      axis: axis,
      camera: camera,
      perspectiveCamera: perspectiveCam,
      orthographicCamera: orthographicCam,

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

			layerManager: null
    }

    this.setOrthographicCameraDimensions(this.props.width, this.props.height)

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
		// @TODO - Beholder needs to call this.listen()

		new RoadNetworkEditorActions().setSceneInitialized(true)
	}

	componentDidMount() {
		this.mount()

		// @TODO register the initial layerToggles
		const pointCloudLayerToggle = new LayerToggle({show: this.showPointCloud, hide: this.hidePointCloud})
		this.state.layerManager!.addLayerToggle(Layer.POINT_CLOUD, pointCloudLayerToggle)

    const superTilesLayerToggle = new LayerToggle({show: this.showSuperTiles, hide: this.hideSuperTiles})
    this.state.layerManager!.addLayerToggle(Layer.POINT_CLOUD, superTilesLayerToggle)
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
			this.updatePointCloudAoi()
			return true
		})

		this.setState({
			loop: loop
		})
	}

	// @TODO need to implement
	private updatePointCloudAoi(): void {
		console.log("IMPLEMENT ME!!!")
	}

	addObjectToScene(object:any) {
		const scene = this.state.scene
		scene.add(object)
		this.setState({
			scene: scene
		})
	}

	removeAxisFromScene() {
    const scene = this.state.scene
		if(this.state.axis) {
      scene.remove(this.state.axis)
      this.setState({
        scene: scene
      })
		}
	}

  removeCompassFromScene() {
    const scene = this.state.scene
    if(this.state.compassRose) {
      scene.remove(this.state.compassRose)
      this.setState({
        scene: scene
      })
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
		this.setState({orbitControls})
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
	private setStage(x: number, y: number, z: number, resetCamera: boolean = true): void {
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

	registerKeyboardEvent(event:KeyboardEvent, fn:any) {
		const registeredKeyboardEvents = this.state.registeredKeyDownEvents

		registeredKeyboardEvents.set(event.keyCode, fn)
		this.setState({
			registeredKeyDownEvents: registeredKeyboardEvents
		})
	}

	registerDomEventElementEventListener(type:string, listener:any) {
		const renderer = this.state.renderer

		renderer.domElement.addEventListener(type, listener)
		this.setState({renderer: renderer})
	}

	/**
	 * Handle keyboard events
	 */
		// BOTH
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

	private onKeyUp = (event: KeyboardEvent): void => {
		if (event.defaultPrevented) return

		const fn = getValue(() => this.state.registeredKeyUpEvents.get(event.keyCode), () => {})
		fn()
	}

  getLayerManager = (layerManager:LayerManager) => {
    this.setState({layerManager,})
  }


	render() {
		return (
			<React.Fragment>
				<div className="scene-container" ref={(el): HTMLDivElement => this.sceneContainer = el!}/>

				<LayerManager onRerender={this.renderScene} ref={this.getLayerManager}/>
			</React.Fragment>
	)

	}



}
