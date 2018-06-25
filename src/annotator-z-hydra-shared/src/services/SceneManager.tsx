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
import {PointCloudTileManager} from "@/annotator-entry-ui/tile/PointCloudTileManager";
import {ScaleProvider} from "@/annotator-entry-ui/tile/ScaleProvider";
import {UtmCoordinateSystem} from "@/annotator-entry-ui/UtmCoordinateSystem";
import {getDecorations} from "@/annotator-entry-ui/Decorations";
import PointCloudManager from "@/annotator-z-hydra-shared/src/services/PointCloudManager";
import StatusWindowState from "@/annotator-z-hydra-shared/src/models/StatusWindowState";
import StatusWindow from "@/annotator-z-hydra-shared/components/StatusWindow";

const log = Logger(__filename)

export interface SceneManagerProps {
	width: number
	height: number
	shouldAnimate ?: boolean
  statusWindowState ?: StatusWindowState
}

export interface CameraState {
  lastCameraCenterPoint: THREE.Vector3 | null // point in three.js coordinates where camera center line has recently intersected ground plane
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
  flyThroughCamera: THREE.PerspectiveCamera
	scene: THREE.Scene
	compassRose: THREE.Object3D
	renderer: THREE.WebGLRenderer
	loop: AnimationLoop
	cameraOffset: THREE.Vector3
	orbitControls: THREE.OrbitControls | null
	orthoCameraHeight: number
	cameraPosition2D: THREE.Vector2
	cameraToSkyMaxDistance: number

	sky: THREE.Object3D
	skyPosition2D: THREE.Vector2
	updateOrbitControls: boolean

	registeredKeyDownEvents: Map<number, any> // mapping between KeyboardEvent.keycode and function to execute
	registeredKeyUpEvents: Map<number, any> // mapping between KeyboardEvent.keycode and function to execute

	layerManager: LayerManager | null
  pointCloudManager: PointCloudManager | null
  pointCloudTileManager: PointCloudTileManager
  statusWindow: StatusWindow | null

	scaleProvider: ScaleProvider
  utmCoordinateSystem: UtmCoordinateSystem
  maxDistanceToDecorations: number // meters

  decorations: THREE.Object3D[] // arbitrary objects displayed with the point cloud
	cameraState: CameraState // isolating camera state incase we decide to migrate it to a Camera Manager down the road
}


@typedConnect(createStructuredSelector({
	shouldAnimate: (state) => state.get(RoadEditorState.Key).shouldAnimate,
  statusWindowState: (state) => state.get(RoadEditorState.Key).statusWindowState,
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
		const pointCloudTileManager = new PointCloudTileManager(
      scaleProvider,
      utmCoordinateSystem,
      this.onSuperTileLoad,
      this.onSuperTileUnload,
      tileServiceClient,
    )

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
			layerManager: null,
			pointCloudManager: null,
      pointCloudTileManager: pointCloudTileManager,
			statusWindow: null,
      scaleProvider: scaleProvider,
      utmCoordinateSystem: utmCoordinateSystem,
      maxDistanceToDecorations: 50000,
			decorations: [],

			cameraState: {},
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
		// @TODO - Beholder needs to call this.listen()

		new RoadNetworkEditorActions().setSceneInitialized(true)
	}

	componentDidMount() {
		this.mount()

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

  /**
   * Set some point as the center of the visible world.
   */
  private setStageByVector(point: THREE.Vector3, resetCamera: boolean = true): void {
    this.setStage(point.x, point.y, point.z, resetCamera)
  }

  /**
   * Set the stage at the bottom center of TileManager's point cloud.
   */
  setStageByPointCloud(resetCamera: boolean): void {
    const focalPoint = this.state.pointCloudTileManager.centerPoint()
    if (focalPoint)
      this.setStageByVector(focalPoint, resetCamera)
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

  /**
   * Set the point cloud as the center of the visible world.
   */
  focusOnPointCloud(): void {
    const center = this.state.pointCloudTileManager.centerPoint()
		if(!this.state.orbitControls) {
			log.warn('[Migration ERROR] orbit controls are not initialized yet')
    	return
		}

    if (center) {
      this.state.orbitControls.target.set(center.x, center.y, center.z)
      this.state.orbitControls.update()
      this.renderScene()
      this.displayCameraInfo()
    } else {
      log.warn('point cloud has not been initialized')
    }
  }

  /**
   * 	Set the camera directly above the current target, looking down.
   */
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

  // Display some info in the UI about where the camera is pointed.
  private displayCameraInfo = (): void => {
    if (this.uiState.isLiveMode) return

    // if (!this.statusWindow.isEnabled()) return
    // [RYAN] updated
    if( !getValue( () => this.props.statusWindowState && this.props.statusWindowState.enabled, false ) ) return

    const currentPoint = this.currentPointOfInterest()
    if (currentPoint) {
      const oldPoint = this.state.cameraState.lastCameraCenterPoint
      const newPoint = currentPoint.clone().round()
      const samePoint = oldPoint && oldPoint.x === newPoint.x && oldPoint.y === newPoint.y && oldPoint.z === newPoint.z
      if (!samePoint) {
      	const cameraState = this.state.cameraState
				cameraState.lastCameraCenterPoint = newPoint
      	this.setState({cameraState})


        const utm = this.state.utmCoordinateSystem.threeJsToUtm(newPoint)
        this.state.statusWindow!.updateCurrentLocationStatusMessage(utm)
      }
    }
  }

  getLayerManager = (layerManager:LayerManager) => {
    this.setState({layerManager,})
  }

  getPointCloudManager = (pointCloudManager:PointCloudManager) => {
		this.setState({pointCloudManager})
	}

  getStatusWindow = (statusWindow:StatusWindow) => {
    this.setState({statusWindow})
  }


	render() {
		return (
			<React.Fragment>
				<div className="scene-container" ref={(el): HTMLDivElement => this.sceneContainer = el!}/>

				<LayerManager ref={this.getLayerManager} onRerender={this.renderScene} />
				<PointCloudManager ref={this.getPointCloudManager} sceneManager={this} pointCloudTileManager={} layerManager={this.state.layerManager} handleTileManagerLoadError={}/>
				<StatusWindow ref={this.getStatusWindow} utmCoordinateSystem={this.state.utmCoordinateSystem}/>
			</React.Fragment>
	)

	}

  /**
   * 	Display the compass rose just outside the bounding box of the point cloud.
   */
  setCompassRoseByPointCloud(): void {
    if (!this.state.compassRose) return
    const boundingBox = this.state.pointCloudTileManager.getLoadedObjectsBoundingBox()
    if (!boundingBox) return

    // Find the center of one of the sides of the bounding box. This is the side that is
    // considered to be North given the current implementation of UtmInterface.utmToThreeJs().
    const topPoint = boundingBox.getCenter().setZ(boundingBox.min.z)
    const boundingBoxHeight = Math.abs(boundingBox.max.z - boundingBox.min.z)
    const zOffset = boundingBoxHeight / 10

    this.state.compassRose.position.set(topPoint.x, topPoint.y, topPoint.z - zOffset)
  }

  private onSetOrigin = (): void => {
    this.loadDecorations().then()
  }

  // Add some easter eggs to the scene if they are close enough.
  private loadDecorations(): Promise<void> {
    return getDecorations()
      .then(decorations => {
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

  showDecorations() {
    this.state.decorations.forEach(d => d.visible = true)
		// @TODO @Joe/Ryan (see comment immediately below)
	}

	hideDecorations() {
    this.state.decorations.forEach(d => d.visible = false)
		// @TODO @Joe (from ryan) should we render the scene again since the state isn't being update, just decorations?
		// ?? -- [ryan added] this.renderScene()
  }

  // Find the point in the scene that is most interesting to a human user.
  // BOTH - used with AOI - AOI is now in PointCloudManager
	currentPointOfInterest(): THREE.Vector3 | null {
    if (this.uiState.isLiveMode) {
      // In live mode track the car, regardless of what the camera does.
      return this.carModel.position
    } else {
      // In interactive mode intersect the camera with the ground plane.
      this.raycasterPlane.setFromCamera(cameraCenter, this.state.camera)

      let intersections: THREE.Intersection[] = []
      if (this.settings.estimateGroundPlane)
        intersections = this.raycasterPlane.intersectObjects(this.allGroundPlanes)
      if (!intersections.length)
        intersections = this.raycasterPlane.intersectObject(this.state.plane)

      if (intersections.length)
        return intersections[0].point
      else
        return null
    }
  }



}
