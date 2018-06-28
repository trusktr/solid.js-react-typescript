
interface UiState {
	sceneInitialized: boolean
	lockBoundaries: boolean
	lockLanes: boolean
	lockTerritories: boolean
	lockTrafficDevices: boolean
	isPointCloudVisible: boolean
	isImageScreensVisible: boolean
	isAnnotationsVisible: boolean
	isControlKeyPressed: boolean
	isShiftKeyPressed: boolean
	isAddMarkerKeyPressed: boolean
	isAddConnectionKeyPressed: boolean
	isConnectLeftNeighborKeyPressed: boolean
	isConnectRightNeighborKeyPressed: boolean
	isConnectFrontNeighborKeyPressed: boolean
	isJoinAnnotationKeyPressed: boolean
	isAddConflictOrDeviceKeyPressed: boolean
	isRotationModeActive: boolean
	isMouseButtonPressed: boolean
	isMouseDragging: boolean
	lastMousePosition: MousePosition | null
	numberKeyPressed: number | null
	// Live mode enables trajectory play-back with minimal user input. The trajectory comes from either a pre-recorded
	// file (if this.flyThroughSettings.enabled is true) or messages on a live socket.
	isLiveMode: boolean
	isLiveModePaused: boolean // When paused the UI for live mode doesn't change, but it ignores new poses.
	isKioskMode: boolean // hides window chrome and turns on live mode permanently, with even less user input
	imageScreenOpacity: number
	lastPointCloudLoadedErrorModalMs: number // timestamp when an error modal was last displayed
	lastCameraCenterPoint: THREE.Vector3 | null // point in three.js coordinates where camera center line has recently intersected ground plane
	skyPosition2D: THREE.Vector2 // sky's position, projected down to approximately the ground surface
	cameraPosition2D: THREE.Vector2 // active camera's position, projected down to approximately the ground surface
}



/**
 * The Annotator class is in charge of rendering the 3d Scene that includes the point clouds
 * and the annotations. It also handles the mouse and keyboard events needed to select
 * and modify the annotations.
 */
interface AnnotatorProps {
	liveModeEnabled ?: boolean
	playModeEnabled ?: boolean
	statusWindowState ?: StatusWindowState
	uiMenuVisible ?: boolean
	shouldAnimate ?: boolean
	flyThroughState ?: FlyThroughState
	carPose ?: Models.PoseMessage
}

interface AnnotatorState {}

// state = getRoadNetworkEditorReduxStore().getState()
@typedConnect(createStructuredSelector({
	liveModeEnabled: (state) => state.get(RoadEditorState.Key).liveModeEnabled,
	playModeEnabled: (state) => state.get(RoadEditorState.Key).playModeEnabled,
	uiMenuVisible: (state) => state.get(RoadEditorState.Key).uiMenuVisible,
	statusWindowState: (state) => state.get(RoadEditorState.Key).statusWindowState,
	flyThroughState: (state) => state.get(RoadEditorState.Key).flyThroughState,
	shouldAnimate: (state) => state.get(RoadEditorState.Key).shouldAnimate,
	carPose: (state) => state.get(RoadEditorState.Key).carPose,
}))
export default class Annotator extends React.Component<AnnotatorProps, AnnotatorState> {
	private uiState: UiState
	// private statusWindow: StatusWindowController // a place to print status messages
	private scene: THREE.Scene // where objects are rendered in the UI; shared with AnnotationManager
	private annotatorCamera: THREE.Camera
	private flyThroughCamera: THREE.Camera
	private renderer: THREE.WebGLRenderer
	private raycasterPlane: THREE.Raycaster // used to compute where the waypoints will be dropped
	private raycasterImageScreen: THREE.Raycaster // used to highlight ImageScreens for selection
	private scaleProvider: ScaleProvider
	private utmCoordinateSystem: UtmCoordinateSystem
	private pointCloudTileManager: PointCloudTileManager
	private annotationTileManager: AnnotationTileManager
	private imageManager: ImageManager
	private plane: THREE.Mesh // an arbitrary horizontal (XZ) reference plane for the UI
	private stats: Stats
	private transformControls: any // controller for translating an object within the scene
	private annotationManager: AnnotationManager
	private superTileGroundPlanes: Map<string, THREE.Mesh[]> // super tile key -> all of the super tile's ground planes
	private allGroundPlanes: THREE.Mesh[] // ground planes for all tiles, denormalized from superTileGroundPlanes
	private highlightedImageScreenBox: THREE.Mesh | null // image screen which is currently active in the Annotator UI
	private highlightedLightboxImage: CalibratedImage | null // image screen which is currently active in the Lightbox UI
	private lightboxImageRays: THREE.Line[] // rays that have been formed in 3D by clicking images in the lightbox
	private settings: AnnotatorSettings
	private gui: DatGui | null
	private loop: AnimationLoop
	private root: HTMLElement

	constructor(props) {
		super(props)

		// replaced by Redux state
		// this.shouldAnimate = false

		if (!isNullOrUndefined(config.get('output.trajectory.csv.path')))
			log.warn('Config option output.trajectory.csv.path has been removed.')
		if (!isNullOrUndefined(config.get('annotator.generate_voxels_on_point_load')))
			log.warn('Config option annotator.generate_voxels_on_point_load has been removed.')
		if (config.get('startup.animation.fps'))
			log.warn('Config option startup.animation.fps has been removed. Use startup.render.fps.')
		const animationFps = config.get('startup.render.fps')

		this.settings = {
			background: new THREE.Color(config.get('startup.background_color') || '#082839'),
			cameraOffset: new THREE.Vector3(0, 400, 200),
			orthoCameraHeight: 100, // enough to view ~1 city block of data
			defaultAnimationFrameIntervalMs: animationFps === 'device' ? false : 1 / (animationFps || 10),
			animationFrameIntervalSecs: 0,
			estimateGroundPlane: !!config.get('annotator.add_points_to_estimated_ground_plane'),
			tileGroundPlaneScale: 1.05,
			enableAnnotationTileManager: false,
			enableTileManagerStats: !!config.get('tile_manager.stats_display.enable'),
			pointCloudBboxColor: new THREE.Color(0xff0000),
			timeToDisplayHealthyStatusMs: 10000,
			maxDistanceToDecorations: 50000,
			skyRadius: 8000,
			cameraToSkyMaxDistance: 0,
		}
		this.settings.cameraToSkyMaxDistance = this.settings.skyRadius * 0.05
		const cameraOffset: [number, number, number] = config.get('startup.camera_offset')
		if (isTupleOfNumbers(cameraOffset, 3)) {
			this.settings.cameraOffset = new THREE.Vector3().fromArray(cameraOffset)
		} else if (cameraOffset) {
			log.warn(`invalid startup.camera_offset config: ${cameraOffset}`)
		}

		this.settings.animationFrameIntervalSecs = this.settings.defaultAnimationFrameIntervalMs
		this.uiState = {
			sceneInitialized: false,
			lockBoundaries: false,
			lockLanes: false,
			lockTerritories: true,
			lockTrafficDevices: false,
			isPointCloudVisible: true,
			isImageScreensVisible: true,
			isAnnotationsVisible: true,
			isControlKeyPressed: false,
			isShiftKeyPressed: false,
			isAddMarkerKeyPressed: false,
			isConnectLeftNeighborKeyPressed: false,
			isConnectRightNeighborKeyPressed: false,
			isConnectFrontNeighborKeyPressed: false,
			isAddConnectionKeyPressed: false,
			isAddConflictOrDeviceKeyPressed: false,
			isJoinAnnotationKeyPressed: false,
			isRotationModeActive: false,
			isMouseButtonPressed: false,
			isMouseDragging: false,
			lastMousePosition: null,
			numberKeyPressed: null,
			isLiveMode: false,
			isLiveModePaused: true,
			isKioskMode: !!config.get('startup.kiosk_mode'),
			imageScreenOpacity: parseFloat(config.get('image_manager.image.opacity')) || 0.5,
			lastPointCloudLoadedErrorModalMs: 0,
			lastCameraCenterPoint: null,
			skyPosition2D: new THREE.Vector2(),
			cameraPosition2D: new THREE.Vector2(),
		}
		// AnnotationTileManager will load and unload annotations without warning, which isn't helpful in interactive mode, so:
		this.settings.enableAnnotationTileManager = this.uiState.isKioskMode
		// this.statusWindow = new StatusWindowController()
		this.hovered = null
		this.raycasterPlane = new THREE.Raycaster()
		this.raycasterPlane.params.Points!.threshold = 0.1
		this.raycasterMarker = new THREE.Raycaster()
		this.decorations = []
		this.raycasterAnnotation = new THREE.Raycaster() // ANNOTATOR ONLY
		this.raycasterImageScreen = new THREE.Raycaster() // ANNOTATOR ONLY
        this.scaleProvider = new ScaleProvider()
		this.utmCoordinateSystem = new UtmCoordinateSystem(this.onSetOrigin)
		this.superTileGroundPlanes = Map()
		this.allGroundPlanes = []
		this.pointCloudBoundingBox = null
		this.highlightedImageScreenBox = null
		this.highlightedLightboxImage = null
		this.lightboxImageRays = []
		this.imageManager = new ImageManager(
			this.utmCoordinateSystem,
			this.uiState.imageScreenOpacity,
			() => { /*this.renderAnnotator*/ },
			this.onImageScreenLoad,
			this.onLightboxImageRay,
			this.onKeyDown,
			this.onKeyUp,
		)
		this.locationServerStatusClient = new LocationServerStatusClient(this.onLocationServerStatusUpdate)

		// this.resetFlyThroughState()
		new FlyThroughActions().resetFlyThroughState()

		if (config.get('fly_through.render.fps'))
			log.warn('config option fly_through.render.fps has been renamed to fly_through.animation.fps')


		this.liveModeSettings = {
			displayCarModel: !!config.get('live_mode.display_car_model'),
			carModelMaterial: new THREE.MeshPhongMaterial({
				color: 0x002233,
				specular: 0x222222,
				shininess: 0,
			}),
			cameraOffset: new THREE.Vector3(30, 10, 0),
			cameraOffsetDelta: 1,
			// flyThroughIntervalSecs: flyThroughInterval,
		}

		const watchForRebuilds: boolean = config.get('startup.watch_for_rebuilds.enable') || false
		if (watchForRebuilds) {
			// Watch for rebuilds and exit if we get rebuilt.
			// This relies on a script or something else to restart after we exit
			const self = this
			watch.createMonitor(
				'/tmp',
				{
					filter: function (f: string): boolean {
						return f === '/tmp/visualizer-rebuilt.flag'
					}
				},
				function (monitor: any): void {
					monitor.on("created", function (): void {
						log.info("Rebuilt flag file created, exiting app")
						self.exitApp()
					})
					monitor.on("changed", function (): void {
						log.info("Rebuilt flag file modified, exiting app")
						self.exitApp()
					})
				})
		}
	}

	exitApp(): void {
		Electron.remote.getCurrentWindow().close()
	}

	private get camera(): THREE.Camera {
		if (this.uiState.isLiveMode) return this.flyThroughCamera
		return this.annotatorCamera
	}

	// When TileManager loads a super tile, update Annotator's parallel data structure.
	// BOTH
    // TODO JOE, TileManager should coordinate with SceneManager to add tiles to
    // the scene, and this should be simple and only call loadTileGroundPlanes
    // which is annotator-app-specific.
	onSuperTileLoad: (superTile: SuperTile) => void = (superTile: SuperTile) => {
		if (superTile instanceof PointCloudSuperTile) {

			this.loadTileGroundPlanes(superTile)

			if (superTile.pointCloud)
                // TODO TileManager should coordinate this directly with SceneManager
                this.props.sceneManager.add(superTile.pointCloud)
			else
				log.error('onSuperTileLoad() got a super tile with no point cloud')
		} else if (superTile instanceof AnnotationSuperTile) {
			if (superTile.annotations)
                // TODO JOE, AnnotationManager should coordinate this with SceneManager
				superTile.annotations.forEach(a => this.annotationManager.addAnnotation(a))
			else
				log.error('onSuperTileLoad() got a super tile with no annotations')
		} else {
			log.error('unknown superTile')
		}

        // TODO JOE, most render updates can move to SceneManager
        // GONE this.renderAnnotator()
		this.updateTileManagerStats()
	}

	// When TileManager unloads a super tile, update Annotator's parallel data structure.
    // BOTH
	private onSuperTileUnload: (superTile: SuperTile) => void = (superTile: SuperTile) => {
		if (superTile instanceof PointCloudSuperTile) {
			this.unloadTileGroundPlanes(superTile)

			if (superTile.pointCloud)
                // TODO JOE, TileManager coordinate this with SceneManager
				this.scene.remove(superTile.pointCloud)
			else
				log.error('onSuperTileUnload() got a super tile with no point cloud')
		} else if (superTile instanceof AnnotationSuperTile) {
            // TODO JOE, AnnotationManager can coordinate this with SceneManager, and redux state can notify Annotation app if needed.
			superTile.annotations.forEach(a => this.annotationManager.deleteAnnotation(a))
		} else {
			log.error('unknown superTile')
		}

		// GONE this.renderAnnotator()
		this.updateTileManagerStats()
	}

  // Print a message about how big our tiles are.
  // RELATED TO ABOVE -- statusWindowManager
  private updateTileManagerStats(): void {
    if (!this.settings.enableTileManagerStats) return
    // if (!this.statusWindow.isEnabled()) return
    if (!this.props.uiMenuVisible) return

    //RYAN UPDATED
    const message = `Loaded ${this.pointCloudTileManager.superTiles.size} point tiles; ${this.pointCloudTileManager.objectCount()} points`
    new StatusWindowActions().setMessage(StatusKey.TILE_MANAGER_POINT_STATS, message)

    if (this.settings.enableAnnotationTileManager) {
      const message2 = `Loaded ${this.annotationTileManager.superTiles.size} annotation tiles; ${this.annotationTileManager.objectCount()} annotations`
      new StatusWindowActions().setMessage(StatusKey.TILE_MANAGER_ANNOTATION_STATS, message2)
    }
  }

	// Construct a set of 2D planes, each of which approximates the ground plane within a tile.
	// This assumes that each ground plane is locally flat and normal to gravity.
	// This assumes that the ground planes in neighboring tiles are close enough that the discrete
	// jumps between them won't matter much.
	// ??????
	private loadTileGroundPlanes(superTile: PointCloudSuperTile): void {
		if (!this.settings.estimateGroundPlane) return
		if (!superTile.pointCloud) return
		if (this.superTileGroundPlanes.has(superTile.key())) return

		const groundPlanes: THREE.Mesh[] = []

		superTile.tiles.forEach(tile => {
			const y = tile.groundAverageYIndex()
			if (!isNull(y)) {
				const xSize = tile.index.scale.xSize
				const zSize = tile.index.scale.zSize

				const geometry = new THREE.PlaneGeometry(
					xSize * this.settings.tileGroundPlaneScale,
					zSize * this.settings.tileGroundPlaneScale
				)
				geometry.rotateX(-Math.PI / 2)

				const material = new THREE.ShadowMaterial()
				const plane = new THREE.Mesh(geometry, material)
				const origin = this.utmCoordinateSystem.utmVectorToThreeJs(tile.index.origin)
				plane.position.x = origin.x + xSize / 2
				plane.position.y = y
				plane.position.z = origin.z - zSize / 2

				groundPlanes.push(plane)
			}
		})

		this.superTileGroundPlanes = this.superTileGroundPlanes.set(superTile.key(), groundPlanes)
		this.allGroundPlanes = this.allGroundPlanes.concat(groundPlanes)
		groundPlanes.forEach(plane => this.scene.add(plane))
	}

	private unloadTileGroundPlanes(superTile: PointCloudSuperTile): void {
		if (!this.superTileGroundPlanes.has(superTile.key())) return

		const groundPlanes = this.superTileGroundPlanes.get(superTile.key())!

		this.superTileGroundPlanes = this.superTileGroundPlanes.remove(superTile.key())
		this.allGroundPlanes = lodash.flatten(this.superTileGroundPlanes.valueSeq().toArray())
		groundPlanes.forEach(plane => this.scene.remove(plane))
	}

	// ANNOTATOR ONLY
    // TODO REORG JOE generic event state, can go somewhere for use by all.
	private setLastMousePosition = (event: MouseEvent | null): void => {
		this.uiState.lastMousePosition = event
	}

	// ANNOTATOR ONLY
    // TODO REORG JOE, generic, can go in a lib or utils
	private getMouseCoordinates = (mousePosition: MousePosition): THREE.Vector2 => {
		const mouse = new THREE.Vector2()
		mouse.x = ( mousePosition.clientX / this.renderer.domElement.clientWidth ) * 2 - 1
		mouse.y = -( mousePosition.clientY / this.renderer.domElement.clientHeight ) * 2 + 1
		return mouse
	}

    //
    // TODO JOE keep in Annotator app me thinks?
    //
    // TODO JOE Maybe ground tiles can be in
    // their own tile layer, and they are added/removed based on super tiles.
	private intersectWithGround(raycaster: THREE.Raycaster): THREE.Intersection[] {
		let intersections: THREE.Intersection[]
		if (this.settings.estimateGroundPlane || !this.pointCloudTileManager.objectCount()) {
			if (this.allGroundPlanes.length)
				intersections = raycaster.intersectObjects(this.allGroundPlanes)
			else
				intersections = raycaster.intersectObject(this.plane)
		} else {
			intersections = raycaster.intersectObjects(this.pointCloudTileManager.getPointClouds())
		}
		return intersections
	}

	// BOTH -- may be annotator only???
    //
    // TODO JOE Seems like this can move  somewhere related to
    // PointCloudTileManager, and app code can opt to using it.
	private intersectWithPointCloud(raycaster: THREE.Raycaster): THREE.Intersection[] {
		return raycaster.intersectObjects(this.pointCloudTileManager.getPointClouds())
	}

	// ANNOTATOR ONLY
	private intersectWithLightboxImageRay(raycaster: THREE.Raycaster): THREE.Intersection[] {
		if (this.lightboxImageRays.length)
			return raycaster.intersectObjects(this.lightboxImageRays)
		else
			return []
	}

	// When ImageManager loads an image, add it to the scene.
	// ANNOTATOR ONLY
    //
    // TODO JOE The UI can have check boxes for showing/hiding layers.
	private onImageScreenLoad: (imageScreen: ImageScreen) => void =
		(imageScreen: ImageScreen) => {
			this.setLayerVisibility([Layer.IMAGE_SCREENS])
			this.scene.add(imageScreen)
			// this.renderAnnotator()
		}

	// When a lightbox ray is created, add it to the scene.
	// On null, remove all rays.
	// ANNOTATOR ONLY
	private onLightboxImageRay: (ray: THREE.Line | null) => void =
		(ray: THREE.Line | null) => {
			if (ray) {
				// Accumulate rays while shift is pressed, otherwise clear old ones.
				if (!this.uiState.isShiftKeyPressed)
					this.clearLightboxImageRays()
				this.setLayerVisibility([Layer.IMAGE_SCREENS])
				this.lightboxImageRays.push(ray)
				this.scene.add(ray)
				// this.renderAnnotator()
			} else {
				this.clearLightboxImageRays()
			}
		}
	// ANNOTATOR ONLY
	private clearLightboxImageRays(): void {
		if (!this.lightboxImageRays.length) return

		this.lightboxImageRays.forEach(r => this.scene.remove(r))
		this.lightboxImageRays = []
		// this.renderAnnotator()
	}

	// ANNOTATOR ONLY
	private checkForImageScreenSelection = (mousePosition: MousePosition): void => {
		if (this.uiState.isLiveMode) return
		if (!this.uiState.isShiftKeyPressed) return
		if (this.uiState.isMouseButtonPressed) return
		if (this.uiState.isAddMarkerKeyPressed) return
		if (this.uiState.isAddConnectionKeyPressed) return
		if (this.uiState.isConnectLeftNeighborKeyPressed ||
			this.uiState.isConnectRightNeighborKeyPressed ||
			this.uiState.isConnectFrontNeighborKeyPressed) return
		if (this.uiState.isJoinAnnotationKeyPressed) return
		if (!this.uiState.isImageScreensVisible) return

		if (!this.imageManager.imageScreenMeshes.length) return this.unHighlightImageScreenBox()

		const mouse = this.getMouseCoordinates(mousePosition)
		this.raycasterImageScreen.setFromCamera(mouse, this.camera)
		const intersects = this.raycasterImageScreen.intersectObjects(this.imageManager.imageScreenMeshes)

		// No screen intersected
		if (!intersects.length) {
			this.unHighlightImageScreenBox()
		} else {
			// Get intersected screen
			const first = intersects[0].object as THREE.Mesh
			const image = first.userData as CalibratedImage

			// Unhighlight previous screen
			if (
				this.highlightedImageScreenBox && this.highlightedImageScreenBox.id !== first.id
				|| this.highlightedLightboxImage && this.highlightedLightboxImage !== image
			)
				this.unHighlightImageScreenBox()

			// Highlight new screen
			this.highlightImageScreenBox(first)
		}
	}

	// ANNOTATOR ONLY
	private clickImageScreenBox = (event: MouseEvent): void => {
		if (this.uiState.isLiveMode) return
		if (this.uiState.isMouseDragging) return
		if (!this.uiState.isImageScreensVisible) return

		switch (event.button) {
			// Left click released
			case 0: {
				if (!this.highlightedImageScreenBox) return

				const mouse = this.getMouseCoordinates(event)
				this.raycasterImageScreen.setFromCamera(mouse, this.camera)
				const intersects = this.raycasterImageScreen.intersectObject(this.highlightedImageScreenBox)

				if (intersects.length) {
					const image = this.highlightedImageScreenBox.userData as CalibratedImage
					this.unHighlightImageScreenBox()
					// this.renderAnnotator()
					this.imageManager.loadImageIntoWindow(image)
				}
				break
				// Middle click released
			} case 1: {
				// no actions
				break
			// Right  click released
			} case 2: {
				if (this.uiState.isShiftKeyPressed) return

				const mouse = this.getMouseCoordinates(event)
				this.raycasterImageScreen.setFromCamera(mouse, this.camera)
				const intersects = this.raycasterImageScreen.intersectObjects(this.imageManager.imageScreenMeshes)
				// Get intersected screen
				if (intersects.length) {
					const first = intersects[0].object as THREE.Mesh
					const material = first.material as THREE.MeshBasicMaterial
					material.opacity = this.uiState.imageScreenOpacity

					const screen = this.imageManager.getImageScreen(first)
					if (screen) screen.unloadImage()

					// this.renderAnnotator()
				}
				break
			} default:
				log.warn('This should never happen.')
		}
	}

	// Draw the box with max opacity to indicate that it is active.
	// ANNOTATOR ONLY
	private highlightImageScreenBox(imageScreenBox: THREE.Mesh): void {
		if (this.uiState.isLiveMode) return
		if (!this.uiState.isShiftKeyPressed) return

		// Note: image loading takes time, so even if image is marked as "highlighted"
		// it is required to continue to renderAnnotator until the image is actually loaded and rendered
		if (imageScreenBox === this.highlightedImageScreenBox) {
			// this.renderAnnotator()
			return
		}
		this.highlightedImageScreenBox = imageScreenBox

		const screen = this.imageManager.getImageScreen(imageScreenBox)
		if (screen)
			screen.loadImage()
				.then(loaded => {if (loaded) { /*this.renderAnnotator() */ }})
				.catch(err => log.warn('getImageScreen() failed', err))

		const image = imageScreenBox.userData as CalibratedImage
		// If it's already loaded in the lightbox, highlight it in the lightbox.
		// Don't allow it to be loaded a second time.
		if (this.imageManager.loadedImageDetails.has(image)) {
			if (this.imageManager.highlightImageInLightbox(image))
				this.highlightedLightboxImage = image
			return
		}

		const material = imageScreenBox.material as THREE.MeshBasicMaterial
		material.opacity = 1.0
		// this.renderAnnotator()
	}

	// Draw the box with default opacity like all the other boxes.
	// ANNOTATOR ONLY
	private unHighlightImageScreenBox(): void {
		if (this.highlightedLightboxImage) {
			if (this.imageManager.unhighlightImageInLightbox(this.highlightedLightboxImage))
				this.highlightedLightboxImage = null
		}

		if (!this.highlightedImageScreenBox) return

		const material = this.highlightedImageScreenBox.material as THREE.MeshBasicMaterial
		material.opacity = this.uiState.imageScreenOpacity
		this.highlightedImageScreenBox = null
		// this.renderAnnotator()
	}

	// ANNOTATOR ONLY
	private onShiftKeyDown = (): void => {
		this.uiState.isShiftKeyPressed = true
		if (this.uiState.lastMousePosition)
			this.checkForImageScreenSelection(this.uiState.lastMousePosition)
	}

	// ANNOTATOR ONLY
	private onShiftKeyUp = (): void => {
		this.uiState.isShiftKeyPressed = false
		this.unHighlightImageScreenBox()
	}

	/**
	 * Create Transform controls object. This allows for the translation of an object in the scene.
	 */
	// ANNOTATOR ONLY
    // TODO REORG JOE move to AnnotationManager
	private initTransformControls(): void {
		this.transformControls = new TransformControls(this.camera, this.renderer.domElement, false)
		this.transformControls.addEventListener('change', () => { /*this.renderAnnotator */ })
		this.scene.add(this.transformControls)

		// Add listeners.

		// If we are interacting with the transform object don't hide it.
		this.transformControls.addEventListener('change', this.cancelHideTransform)

		// If we just clicked on a transform object don't hide it.
		this.transformControls.addEventListener('mouseDown', this.cancelHideTransform)

		// If we are done interacting with a transform object start hiding process.
		this.transformControls.addEventListener('mouseUp', this.delayHideTransform)

		// If the object attached to the transform object has changed, do something.
		this.transformControls.addEventListener('objectChange', this.annotationManager.updateActiveAnnotationMesh)
	}

	// ANNOTATOR ONLY
	private onDeleteActiveAnnotation(): void {
		// Delete annotation from scene
		if (this.annotationManager.deleteActiveAnnotation()) {
			log.info("Deleted selected annotation")
            // TODO JOE this will trigger state change which in turn updates the UI.
			this.deactivateLanePropUI()
			this.hideTransform()
			// this.renderAnnotator()
		}
	}

	// ANNOTATOR ONLY
	private deleteAllAnnotations(): void {
		this.annotationManager.immediateAutoSave()
			.then(() => {
				this.annotationManager.unloadAllAnnotations()
			})
	}


	// Save all annotation data.
	// ANNOTATOR ONLY
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

	private exportAnnotationsTiles(format: OutputFormat): Promise<void> {
		const basePath = config.get('output.annotations.tiles_dir')
		const scale = scale3DToSpatialTileScale(this.scaleProvider.utmTileScale)
		if (isNullOrUndefined(scale))
			return Promise.reject(Error(`1can't create export path because of a bad scale: ${this.scaleProvider.utmTileScale}`))
		const scaleString = spatialTileScaleToString(scale)
		if (isNullOrUndefined(scaleString))
			return Promise.reject(Error(`2can't create export path because of a bad scale: ${this.scaleProvider.utmTileScale}`))
		const dir = basePath + '/' + dateToString(new Date()) + scaleString
		log.info(`Exporting annotations tiles to ${dir}`)
		return this.annotationManager.exportAnnotationsTiles(dir, format)
			.catch(error => log.warn("export failed: " + error.message))
	}

	// Save lane waypoints only.
	// ANNOTATOR ONLY
	private saveWaypointsKml(): Promise<void> {
		const basePath = config.get('output.annotations.kml.path')
		log.info(`Saving waypoints KML to ${basePath}`)
		return this.annotationManager.saveToKML(basePath)
			.catch(err => log.warn('saveToKML failed: ' + err.message))
	}

}
