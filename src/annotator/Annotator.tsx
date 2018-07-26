/**
 *  Copyright 2017 Mapper Inc. Part of the mapper-annotator project.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import config from '@/config'
import * as $ from 'jquery'
import * as Electron from 'electron'
import MousePosition from '@/mapper-annotated-scene/src/models/MousePosition'
import mousePositionToGLSpace from '../util/mousePositionToGLSpace'
import {GUI as DatGui, GUIParams} from 'dat.gui'
import {AnnotationType} from '../mapper-annotated-scene/annotations/AnnotationType'
import {AnnotationManager, OutputFormat} from '../mapper-annotated-scene/AnnotationManager'
import {NeighborLocation, NeighborDirection} from '../mapper-annotated-scene/annotations/Lane'
import Logger from '@/util/log'
import {isNullOrUndefined} from "util"
import * as MapperProtos from '@mapperai/mapper-models'
import Models = MapperProtos.mapper.models
import * as THREE from 'three'
import {ImageManager} from "./image/ImageManager"
import {CalibratedImage} from "./image/CalibratedImage"
import toProps from '@/util/toProps'
import {KeyboardEventHighlights} from "@/electron-ipc/Messages"
import * as React from "react";
import {typedConnect} from "@/mapper-annotated-scene/src/styles/Themed"
import AnnotatedSceneActions from "@/mapper-annotated-scene/src/store/actions/AnnotatedSceneActions"
import StatusWindowState from "@/mapper-annotated-scene/src/models/StatusWindowState"
import {FlyThroughState} from "@/mapper-annotated-scene/src/models/FlyThroughState"
import AnnotatedSceneController from '@/mapper-annotated-scene/src/services/AnnotatedSceneController'
import {Events} from "@/mapper-annotated-scene/src/models/Events"
import {Layer as AnnotatedSceneLayer} from "@/mapper-annotated-scene/src/services/LayerManager"
import {v4 as UUID} from 'uuid'
import Key from '@/mapper-annotated-scene/src/models/Key'
import AnnotatorMenuView from "./AnnotatorMenuView"
import {dateToString} from "../util/dateToString"
import {scale3DToSpatialTileScale, spatialTileScaleToString} from "../mapper-annotated-scene/tile/ScaleUtil"
import {ScaleProvider} from "../mapper-annotated-scene/tile/ScaleProvider"
import {THREEColorValue} from "@/mapper-annotated-scene/src/THREEColorValue-type"
import {hexStringToHexadecimal} from "@/util/Color"
import {ConfigDefault} from "@/config/ConfigDefault"

const dialog = Electron.remote.dialog

const log = Logger(__filename)

const Layers = {
	...AnnotatedSceneLayer,
	IMAGE_SCREENS: UUID(),
}

type Layer = string

let allLayers: Layer[] = []

for (let key in Layers) {
	if (Layers.hasOwnProperty(key)) {
		const layer = Layers[key]
		allLayers.push(layer)
	}
}

// Groups of layers which are visible together. They are toggled on/off with the 'show/hide' command.
// - all visible
// - annotations hidden
// - everything but annotations hidden
const layerGroups: Layer[][] = [
	allLayers,
	[Layers.POINT_CLOUD, Layers.IMAGE_SCREENS],
	[Layers.ANNOTATIONS],
]

const defaultLayerGroupIndex = 0

/**
 * The Annotator class is in charge of rendering the 3d Scene that includes the point clouds
 * and the annotations. It also handles the mouse and keyboard events needed to select
 * and modify the annotations.
 */

interface AnnotatorState {
	background: THREEColorValue
	layerGroupIndex: number

	lastMousePosition: MousePosition | null

	imageScreenOpacity: number

	annotationManager: AnnotationManager | null
	annotatedSceneController: AnnotatedSceneController | null

	lockBoundaries: boolean
	lockLanes: boolean
	lockTerritories: boolean
	lockTrafficDevices: boolean
	isImageScreensVisible: boolean
}

interface AnnotatorProps {
	statusWindowState?: StatusWindowState
	uiMenuVisible?: boolean
	flyThroughState?: FlyThroughState
	carPose?: Models.PoseMessage
	isLiveMode?: boolean
	rendererSize?: Electron.Size
	camera?: THREE.Camera

	isShiftKeyPressed?: boolean
	isAddMarkerMode?: boolean
	isAddConnectionMode?: boolean
	isConnectLeftNeighborMode?: boolean
	isConnectRightNeighborMode?: boolean
	isConnectFrontNeighborMode?: boolean
	isJoinAnnotationMode?: boolean
	isAddConflictOrDeviceMode?: boolean
	isRotationModeActive?: boolean
	isMouseButtonPressed?: boolean
	isMouseDragging?: boolean
	isTransformControlsAttached?: boolean
}

@typedConnect(toProps(
	'uiMenuVisible',
	'statusWindowState',
	'flyThroughState',
	'carPose',
	'isLiveMode',
	'rendererSize',
	'camera',

	'isShiftKeyPressed',
	'isAddMarkerMode',
	'isAddConnectionMode',
	'isConnectLeftNeighborMode',
	'isConnectRightNeighborMode',
	'isConnectFrontNeighborMode',
	'isJoinAnnotationMode',
	'isAddConflictOrDeviceMode',
	'isRotationModeActive',
	'isMouseButtonPressed',
	'isMouseDragging',
	'isTransformControlsAttached',
))
export default class Annotator extends React.Component<AnnotatorProps, AnnotatorState> {
	private raycasterImageScreen: THREE.Raycaster // used to highlight ImageScreens for selection
	private scaleProvider: ScaleProvider
	private imageManager: ImageManager
	private highlightedImageScreenBox: THREE.Mesh | null // image screen which is currently active in the Annotator UI
	private highlightedLightboxImage: CalibratedImage | null // image screen which is currently active in the Lightbox UI
	private lightboxImageRays: THREE.Line[] // rays that have been formed in 3D by clicking images in the lightbox
	private gui: DatGui | null

	constructor(props: AnnotatorProps) {
		super(props)

		if (!isNullOrUndefined(config['output.trajectory.csv.path']))
			log.warn('Config option output.trajectory.csv.path has been removed.')
		if (!isNullOrUndefined(config['annotator.generate_voxels_on_point_load']))
			log.warn('Config option annotator.generate_voxels_on_point_load has been removed.')
		if (config['startup.animation.fps'])
			log.warn('Config option startup.animation.fps has been removed. Use startup.render.fps.')

		this.raycasterImageScreen = new THREE.Raycaster()
		this.scaleProvider = new ScaleProvider()
		this.highlightedImageScreenBox = null
		this.highlightedLightboxImage = null
		this.lightboxImageRays = []

		this.state = {
			background: hexStringToHexadecimal(config['startup.background_color'] || '#442233'),
			layerGroupIndex: defaultLayerGroupIndex,

			lastMousePosition: null,
			imageScreenOpacity: parseFloat(config['image_manager.image.opacity']) || 0.5,

			annotationManager: null,
			annotatedSceneController: null,

			isImageScreensVisible: true,

			lockBoundaries: false,
			lockLanes: false,
			lockTerritories: true,
			lockTrafficDevices: false,
		}
	}

	// Create a UI widget to adjust application settings on the fly.
    // JOE, this is Annotator app-specific
	createControlsGui(): void {
		// Add panel to change the settings
		if (!isNullOrUndefined(config['startup.show_color_picker']))
			log.warn('config option startup.show_color_picker has been renamed to startup.show_control_panel')

		if (!config['startup.show_control_panel']) {
			this.gui = null
			return
		}

		const gui = this.gui = new DatGui({
			hideable: false,
			closeOnTop: true,
		} as GUIParams)
		gui.domElement.className = 'threeJs_gui'

		gui.domElement.setAttribute('style', `
			width: 245px;
			position: absolute;
			top: 13px;
			left: 13px;
			right: initial;
			bottom: initial;
			background: rgba(0,0,0,0.5);
			padding: 10px;
		`)

		const closeButton = gui.domElement.querySelector('.close-button')

		closeButton!.setAttribute('style', `
			padding-bottom: 5px;
			cursor: pointer;
		`)

		gui.addColor(this.state, 'background').name('Background').onChange(() => {
			this.forceUpdate()
		})

		gui.add(this.state, 'imageScreenOpacity', 0, 1).name('Image Opacity').onChange((value: number) => {
			this.imageManager.setOpacity(value)
		})

		const folderLock = gui.addFolder('Lock')
		folderLock.add(this.state, 'lockBoundaries').name('Boundaries').onChange((value: boolean) => {
			if (value && this.state.annotationManager!.getActiveBoundaryAnnotation()) {
				this.state.annotatedSceneController!.cleanTransformControls()
				this.uiEscapeSelection()
			}
		})
		folderLock.add(this.state, 'lockLanes').name('Lanes').onChange((value: boolean) => {
			if (value && (this.state.annotationManager!.getActiveLaneAnnotation() || this.state.annotationManager!.getActiveConnectionAnnotation())) {
				this.state.annotatedSceneController!.cleanTransformControls()
				this.uiEscapeSelection()
			}
		})
		folderLock.add(this.state, 'lockTerritories').name('Territories').onChange((value: boolean) => {
			if (value && this.state.annotationManager!.getActiveTerritoryAnnotation()) {
				this.state.annotatedSceneController!.cleanTransformControls()
				this.uiEscapeSelection()
			}
		})
		folderLock.add(this.state, 'lockTrafficDevices').name('Traffic Devices').onChange((value: boolean) => {
			if (value && (this.state.annotationManager!.getActiveTrafficDeviceAnnotation())) {
				this.state.annotatedSceneController!.cleanTransformControls()
				this.uiEscapeSelection()
			}
		})
		folderLock.open()

		const folderConnection = gui.addFolder('Connection params')
		folderConnection.add(this.state.annotationManager!, 'bezierScaleFactor', 1, 30).step(1).name('Bezier factor')
		folderConnection.open()
	}

	private destroyControlsGui(): void {
		if (!config['startup.show_control_panel']) return
		if (this.gui) this.gui.destroy()
	}

	private setLastMousePosition = (event: MouseEvent | null): void => {
		this.setState({ lastMousePosition: event })
	}

	// When ImageManager loads an image, add it to the scene.
    // IDEA JOE The UI can have check boxes for showing/hiding layers.
	private onImageScreenLoad = (): void => {
		this.state.annotatedSceneController!.setLayerVisibility([Layers.IMAGE_SCREENS])
	}

	// When a lightbox ray is created, add it to the scene.
	// On null, remove all rays.
	private onLightboxImageRay = (ray: THREE.Line): void => {
		// Accumulate rays while shift is pressed, otherwise clear old ones.
		if (!this.props.isShiftKeyPressed)
			this.clearLightboxImageRays()
		this.state.annotatedSceneController!.setLayerVisibility([Layers.IMAGE_SCREENS])
		this.lightboxImageRays.push(ray)
		new AnnotatedSceneActions().addObjectToScene( ray )
	}

	private clearLightboxImageRays = (): void => {
		if (!this.lightboxImageRays.length) return

		this.lightboxImageRays.forEach(r => new AnnotatedSceneActions().removeObjectFromScene( r ))
		this.lightboxImageRays = []
	}

	private getLightboxImageRays = (callback: (lightboxImageRays: THREE.Line[]) => void): void => {
		callback(this.lightboxImageRays)
	}

	private checkForImageScreenSelection = (mousePosition: MousePosition): void => {
		if (this.props.isLiveMode) return
		if (!this.props.isShiftKeyPressed) return
		if (this.props.isMouseButtonPressed) return
		if (this.props.isAddMarkerMode) return
		if (this.props.isAddConnectionMode) return
		if (this.props.isConnectLeftNeighborMode ||
			this.props.isConnectRightNeighborMode ||
			this.props.isConnectFrontNeighborMode) return
		if (this.props.isJoinAnnotationMode) return
		if (!this.state.isImageScreensVisible) return

		if (!this.imageManager.imageScreenMeshes.length) return this.unHighlightImageScreenBox()

		const mouse = mousePositionToGLSpace(mousePosition, this.props.rendererSize!)
		this.raycasterImageScreen.setFromCamera(mouse, this.props.camera!)
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

	private clickImageScreenBox = (event: MouseEvent): void => {
		if (this.props.isLiveMode) return
		if (this.props.isMouseDragging) return
		if (!this.state.isImageScreensVisible) return

		switch (event.button) {
			// Left click released
			case 0: {
				if (!this.highlightedImageScreenBox) return

				const mouse = mousePositionToGLSpace(event, this.props.rendererSize!)
				this.raycasterImageScreen.setFromCamera(mouse, this.props.camera!)
				const intersects = this.raycasterImageScreen.intersectObject(this.highlightedImageScreenBox)

				if (intersects.length) {
					const image = this.highlightedImageScreenBox.userData as CalibratedImage
					this.unHighlightImageScreenBox()
					this.imageManager.loadImageIntoWindow(image)
				}
				break
				// Middle click released
			} case 1: {
				// no actions
				break
			// Right  click released
			} case 2: {
				if (this.props.isShiftKeyPressed) return

				const mouse = mousePositionToGLSpace(event, this.props.rendererSize!)
				this.raycasterImageScreen.setFromCamera(mouse, this.props.camera!)
				const intersects = this.raycasterImageScreen.intersectObjects(this.imageManager.imageScreenMeshes)
				// Get intersected screen
				if (intersects.length) {
					const first = intersects[0].object as THREE.Mesh
					const material = first.material as THREE.MeshBasicMaterial
					material.opacity = this.state.imageScreenOpacity

					const screen = this.imageManager.getImageScreen(first)
					if (screen) screen.unloadImage()

					this.state.annotatedSceneController!.shouldRender()
				}
				break
			} default:
				log.warn('This should never happen.')
		}
	}

	// Draw the box with max opacity to indicate that it is active.
	private highlightImageScreenBox(imageScreenBox: THREE.Mesh): void {
		if (this.props.isLiveMode) return
		if (!this.props.isShiftKeyPressed) return

		if (imageScreenBox === this.highlightedImageScreenBox) {
			return
		}

		this.highlightedImageScreenBox = imageScreenBox

		const screen = this.imageManager.getImageScreen(imageScreenBox)
		if (screen)
			screen.loadImage()
				.then(loaded => {if (loaded) {
					this.state.annotatedSceneController!.shouldRender()
				}})
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
		this.state.annotatedSceneController!.shouldRender()
	}

	// Draw the box with default opacity like all the other boxes.
	private unHighlightImageScreenBox(): void {
		if (this.highlightedLightboxImage) {
			if (this.imageManager.unhighlightImageInLightbox(this.highlightedLightboxImage))
				this.highlightedLightboxImage = null
		}

		if (!this.highlightedImageScreenBox) return

		const material = this.highlightedImageScreenBox.material as THREE.MeshBasicMaterial
		material.opacity = this.state.imageScreenOpacity
		this.highlightedImageScreenBox = null
		this.state.annotatedSceneController!.shouldRender()
	}

	// TODO JOE eventually we need to remove this filesystem stuff from the
	// shared lib so that the shared lib can work in regular browsers
	// {{

	/*
	 * Make a best effort to save annotations before exiting. There is no guarantee the
	 * promise will complete, but it seems to work in practice.
	 */
	private onBeforeUnload: (e: BeforeUnloadEvent) => void = (_: BeforeUnloadEvent) => {
		this.state.annotationManager!.immediateAutoSave()
	}

	private onFocus = (): void => {
		this.state.annotationManager!.enableAutoSave()
	}
	private onBlur = (): void => {
		this.setLastMousePosition(null)
		this.state.annotationManager!.disableAutoSave()
	}

	// }}

	mapKey(key: Key, fn: (e?: KeyboardEvent | KeyboardEventHighlights) => void): void {
		this.state.annotatedSceneController!.mapKey(key, fn)
	}

	mapKeyDown(key: Key, fn: (e?: KeyboardEvent | KeyboardEventHighlights) => void): void {
		this.state.annotatedSceneController!.mapKeyDown(key, fn)
	}

	mapKeyUp(key: Key, fn: (e?: KeyboardEvent | KeyboardEventHighlights) => void): void {
		this.state.annotatedSceneController!.mapKeyUp(key, fn)
	}

	keyHeld(key: Key, fn: (held: boolean) => void): void {
		this.state.annotatedSceneController!.keyHeld(key, fn)
	}

	setKeys(): void {

		// TODO JOE later: better keymap organization, a way to specify stuff like
		// `ctrl+a` and let users customize. Perhaps built on ELectron
		// accelerators and possibly similar to Atom key maps.

		this.mapKey('Backspace', () => this.uiDeleteActiveAnnotation())
		this.mapKey('Escape', () => this.uiEscapeSelection())
		this.mapKeyDown('Shift', () => this.onShiftKeyDown())
		this.mapKeyUp('Shift', () => this.onShiftKeyUp())
		this.mapKey('A', () => this.uiDeleteAllAnnotations())
		this.mapKey('b', () => this.uiAddAnnotation(AnnotationType.BOUNDARY))
		this.mapKey('C', () => this.state.annotatedSceneController!.focusOnPointCloud())
		this.mapKey('d', () => this.state.annotationManager!.deleteLastMarker())
		this.mapKey('F', () => this.uiReverseLaneDirection())
		this.mapKey('h', () => this.uiToggleLayerVisibility())
		this.mapKey('m', () => this.uiSaveWaypointsKml())
		this.mapKey('N', () => this.uiExportAnnotationsTiles(OutputFormat.UTM))
		this.mapKey('n', () => this.uiAddAnnotation(AnnotationType.LANE))
		this.mapKey('S', () => this.uiSaveToFile(OutputFormat.LLA))
		this.mapKey('s', () => this.uiSaveToFile(OutputFormat.UTM))
		this.mapKey('R', () => this.state.annotatedSceneController!.resetTiltAndCompass())
		this.mapKey('T', () => this.uiAddAnnotation(AnnotationType.TERRITORY))
		this.mapKey('t', () => this.uiAddAnnotation(AnnotationType.TRAFFIC_DEVICE))
		this.mapKey('U', () => this.state.annotatedSceneController!.unloadPointCloudData())
		this.mapKey('V', () => this.state.annotatedSceneController!.toggleCameraType())
		this.mapKey('X', () => this.state.annotationManager!.toggleTransformControlsRotationMode())

		const actions = new AnnotatedSceneActions()
		this.keyHeld('a', held => actions.setAddMarkerMode(held))
		this.keyHeld('c', held => actions.setAddConnectionMode(held))
		this.keyHeld('f', held => actions.setConnectFrontNeighborMode(held))
		this.keyHeld('j', held => actions.setJoinAnnotationMode(held))
		this.keyHeld('l', held => actions.setConnectLeftNeighborMode(held))
		this.keyHeld('q', held => actions.setAddConflictOrDeviceMode(held))
		this.keyHeld('r', held => actions.setConnectRightNeighborMode(held))
	}

	addImageScreenLayer(): void {

		const imagesToggle = visible => {
			this.setState({ isImageScreensVisible: visible })
		}

		this.state.annotatedSceneController!.addLayer(Layers.IMAGE_SCREENS, imagesToggle)

	}

	/**
	 * Unselect whatever is selected in the UI:
	 *  - an active control point
	 *  - a selected annotation
	 */
	uiEscapeSelection(): void {
		if (this.props.isTransformControlsAttached) {
			this.state.annotatedSceneController!.cleanTransformControls()
		} else if (this.state.annotationManager!.activeAnnotation) {
			this.state.annotationManager!.unsetActiveAnnotation()
			this.deactivateAllAnnotationPropertiesMenus()
		}

        if (document.activeElement.tagName === 'INPUT')
			(document.activeElement as HTMLInputElement).blur()
	}

	private onShiftKeyDown = (): void => {
		if (this.state.lastMousePosition)
			this.checkForImageScreenSelection(this.state.lastMousePosition)
	}

	private onShiftKeyUp = (): void => {
		this.unHighlightImageScreenBox()
	}

	private uiDeleteActiveAnnotation(): void {
		// Delete annotation from scene
		if (this.state.annotationManager!.deleteActiveAnnotation()) {
			log.info("Deleted selected annotation")
			this.deactivateLanePropUI()
			this.state.annotationManager!.hideTransform()
		}
	}

	private uiDeleteAllAnnotations(): void {
		this.state.annotationManager!.immediateAutoSave()
			.then(() => {
				this.state.annotationManager!.unloadAllAnnotations()
			})
	}

	// Create an annotation, add it to the scene, and activate (highlight) it.
	private uiAddAnnotation(annotationType: AnnotationType): void {
		if (this.state.annotationManager!.createAndAddAnnotation(annotationType, true)[0]) {
			log.info(`Added new ${AnnotationType[annotationType]} annotation`)
			this.deactivateAllAnnotationPropertiesMenus(annotationType)
			this.resetAllAnnotationPropertiesMenuElements()
			this.state.annotationManager!.hideTransform()
		}
        else {
            throw new Error( 'unable to add annotation of type ' + AnnotationType[annotationType] )
        }
	}

	// Save all annotation data.
	private uiSaveToFile(format: OutputFormat): Promise<void> {
		// Attempt to insert a string representing the coordinate system format into the requested path, then save.
		const basePath = config['output.annotations.json.path']
		const i = basePath.indexOf('.json')
		const formattedPath = i >= 0
			? basePath.slice(0, i) + '-' + OutputFormat[format] + basePath.slice(i, basePath.length)
			: basePath
		log.info(`Saving annotations JSON to ${formattedPath}`)

		// TODO JOE saveAnnotationsToFile should come out of the library and into Annotor
		return this.state.annotationManager!.saveAnnotationsToFile(formattedPath, format)
			.catch(error => log.warn("save to file failed: " + error.message))
	}

	private uiExportAnnotationsTiles(format: OutputFormat): Promise<void> {
		const basePath = config['output.annotations.tiles_dir']
		const scale = scale3DToSpatialTileScale(this.scaleProvider.utmTileScale)
		if (isNullOrUndefined(scale))
			return Promise.reject(Error(`1can't create export path because of a bad scale: ${this.scaleProvider.utmTileScale}`))
		const scaleString = spatialTileScaleToString(scale)
		if (isNullOrUndefined(scaleString))
			return Promise.reject(Error(`2can't create export path because of a bad scale: ${this.scaleProvider.utmTileScale}`))
		const dir = basePath + '/' + dateToString(new Date()) + scaleString
		log.info(`Exporting annotations tiles to ${dir}`)

		// TODO JOE exportAnnotationsTiles should come out of the library and into Annotor
		return this.state.annotationManager!.exportAnnotationsTiles(dir, format)
			.catch(error => log.warn("export failed: " + error.message))
	}

	// Save lane waypoints only.
	private uiSaveWaypointsKml(): Promise<void> {
		const basePath = config['output.annotations.kml.path']
		log.info(`Saving waypoints KML to ${basePath}`)

		// TODO JOE saveToKML should come out of the library and into Annotor
		return this.state.annotationManager!.saveToKML(basePath)
			.catch(err => log.warn('saveToKML failed: ' + err.message))
	}

	private addFront(): void {
		log.info("Adding connected annotation to the front")
		if (this.state.annotationManager!.addConnectedLaneAnnotation(NeighborLocation.FRONT, NeighborDirection.SAME)) {
			Annotator.deactivateFrontSideNeighbours()
		}
	}

	private addLeftSame(): void {
		log.info("Adding connected annotation to the left - same direction")
		if (this.state.annotationManager!.addConnectedLaneAnnotation(NeighborLocation.LEFT, NeighborDirection.SAME)) {
			Annotator.deactivateLeftSideNeighbours()
		}
	}

	private addLeftReverse(): void {
		log.info("Adding connected annotation to the left - reverse direction")
		if (this.state.annotationManager!.addConnectedLaneAnnotation(NeighborLocation.LEFT, NeighborDirection.REVERSE)) {
			Annotator.deactivateLeftSideNeighbours()
		}
	}

	private addRightSame(): void {
		log.info("Adding connected annotation to the right - same direction")
		if (this.state.annotationManager!.addConnectedLaneAnnotation(NeighborLocation.RIGHT, NeighborDirection.SAME)) {
			Annotator.deactivateRightSideNeighbours()
		}
	}

	private addRightReverse(): void {
		log.info("Adding connected annotation to the right - reverse direction")
		if (this.state.annotationManager!.addConnectedLaneAnnotation(NeighborLocation.RIGHT, NeighborDirection.REVERSE)) {
			Annotator.deactivateRightSideNeighbours()
		}
	}

	private uiReverseLaneDirection(): void {
		log.info("Reverse lane direction.")
		const {result, existLeftNeighbour, existRightNeighbour}: { result: boolean, existLeftNeighbour: boolean, existRightNeighbour: boolean }
			= this.state.annotationManager!.reverseLaneDirection()
		if (result) {
			if (existLeftNeighbour) {
				Annotator.deactivateLeftSideNeighbours()
			} else {
				Annotator.activateLeftSideNeighbours()
			}
			if (existRightNeighbour) {
				Annotator.deactivateRightSideNeighbours()
			} else {
				Annotator.activateRightSideNeighbours()
			}
		}
	}

    // TODO JOE handle DOM events the React way {{

	/**
	 * Bind functions events to interface elements
	 */
	private bindLanePropertiesPanel(): void {
		const lcType = $('#lp_select_type')
		lcType.on('change', () => {
			lcType.blur()
			const activeAnnotation = this.state.annotationManager!.getActiveLaneAnnotation()
			if (activeAnnotation === null)
				return
			log.info("Adding lane type: " + lcType.children("option").filter(":selected").text())
			activeAnnotation.type = +lcType.val()
		})

		const lcLeftType = $('#lp_select_left_type')
		lcLeftType.on('change', () => {
			lcLeftType.blur()
			const activeAnnotation = this.state.annotationManager!.getActiveLaneAnnotation()
			if (activeAnnotation === null)
				return
			log.info("Adding left side type: " + lcLeftType.children("option").filter(":selected").text())
			activeAnnotation.leftLineType = +lcLeftType.val()
			activeAnnotation.updateVisualization()
		})

		const lcLeftColor = $('#lp_select_left_color')
		lcLeftColor.on('change', () => {
			lcLeftColor.blur()
			const activeAnnotation = this.state.annotationManager!.getActiveLaneAnnotation()
			if (activeAnnotation === null)
				return
			log.info("Adding left side type: " + lcLeftColor.children("option").filter(":selected").text())
			activeAnnotation.leftLineColor = +lcLeftColor.val()
			activeAnnotation.updateVisualization()
		})

		const lcRightType = $('#lp_select_right_type')
		lcRightType.on('change', () => {
			lcRightType.blur()
			const activeAnnotation = this.state.annotationManager!.getActiveLaneAnnotation()
			if (activeAnnotation === null)
				return
			log.info("Adding right side type: " + lcRightType.children("option").filter(":selected").text())
			activeAnnotation.rightLineType = +lcRightType.val()
			activeAnnotation.updateVisualization()
		})

		const lcRightColor = $('#lp_select_right_color')
		lcRightColor.on('change', () => {
			lcRightColor.blur()
			const activeAnnotation = this.state.annotationManager!.getActiveLaneAnnotation()
			if (activeAnnotation === null)
				return
			log.info("Adding left side type: " + lcRightColor.children("option").filter(":selected").text())
			activeAnnotation.rightLineColor = +lcRightColor.val()
			activeAnnotation.updateVisualization()
		})

		const lcEntry = $('#lp_select_entry')
		lcEntry.on('change', () => {
			lcEntry.blur()
			const activeAnnotation = this.state.annotationManager!.getActiveLaneAnnotation()
			if (activeAnnotation === null)
				return
			log.info("Adding entry type: " + lcEntry.children("option").filter(":selected").text())
			activeAnnotation.entryType = lcEntry.val()
		})

		const lcExit = $('#lp_select_exit')
		lcExit.on('change', () => {
			lcExit.blur()
			const activeAnnotation = this.state.annotationManager!.getActiveLaneAnnotation()
			if (activeAnnotation === null)
				return
			log.info("Adding exit type: " + lcExit.children("option").filter(":selected").text())
			activeAnnotation.exitType = lcExit.val()
		})
	}

	private bindLaneNeighborsPanel(): void {
		const lpAddLeftOpposite = document.getElementById('lp_add_left_opposite')
		if (lpAddLeftOpposite)
			lpAddLeftOpposite.addEventListener('click', () => {
				this.addLeftReverse()
			})
		else
			log.warn('missing element lp_add_left_opposite')

		const lpAddLeftSame = document.getElementById('lp_add_left_same')
		if (lpAddLeftSame)
			lpAddLeftSame.addEventListener('click', () => {
				this.addLeftSame()
			})
		else
			log.warn('missing element lp_add_left_same')

		const lpAddRightOpposite = document.getElementById('lp_add_right_opposite')
		if (lpAddRightOpposite)
			lpAddRightOpposite.addEventListener('click', () => {
				this.addRightReverse()
			})
		else
			log.warn('missing element lp_add_right_opposite')

		const lpAddRightSame = document.getElementById('lp_add_right_same')
		if (lpAddRightSame)
			lpAddRightSame.addEventListener('click', () => {
				this.addRightSame()
			})
		else
			log.warn('missing element lp_add_right_same')

		const lpAddFront = document.getElementById('lp_add_forward')
		if (lpAddFront)
			lpAddFront.addEventListener('click', () => {
				this.addFront()
			})
		else
			log.warn('missing element lp_add_forward')
	}

	private bindConnectionPropertiesPanel(): void {
		const cpType = $('#cp_select_type')
		cpType.on('change', () => {
			cpType.blur()
			const activeAnnotation = this.state.annotationManager!.getActiveConnectionAnnotation()
			if (activeAnnotation === null)
				return
			log.info("Adding connection type: " + cpType.children("options").filter(":selected").text())
			activeAnnotation.type = +cpType.val()
		})
	}

	private bindTerritoryPropertiesPanel(): void {
		const territoryLabel = document.getElementById('input_label_territory')
		if (territoryLabel) {
			// Select all text when the input element gains focus.
			territoryLabel.addEventListener('focus', event => {
				(event.target as HTMLInputElement).select()
			})

			// Update territory label text on any change to input.
			territoryLabel.addEventListener('input', (event: Event) => {
				const activeAnnotation = this.state.annotationManager!.getActiveTerritoryAnnotation()
				if (activeAnnotation)
					activeAnnotation.setLabel((event.target as HTMLInputElement).value)
			})

			// User is done editing: lose focus.
			territoryLabel.addEventListener('change', (event: Event) => {
				(event.target as HTMLInputElement).blur()
			})
		} else
			log.warn('missing element input_label_territory')
	}

	private bindTrafficDevicePropertiesPanel(): void {
		const tpType = $('#tp_select_type')
		tpType.on('change', () => {
			tpType.blur()
			const activeAnnotation = this.state.annotationManager!.getActiveTrafficDeviceAnnotation()
			if (activeAnnotation === null)
				return
			log.info("Adding traffic device type: " + tpType.children("option").filter(":selected").text())
			activeAnnotation.type = +tpType.val()
			activeAnnotation.updateVisualization()
			this.state.annotatedSceneController!.shouldRender()
		})
	}

	private bindBoundaryPropertiesPanel(): void {
		const bpType = $('#bp_select_type')
		bpType.on('change', () => {
			bpType.blur()
			const activeAnnotation = this.state.annotationManager!.getActiveBoundaryAnnotation()
			if (activeAnnotation === null)
				return
			log.info("Adding boundary type: " + bpType.children("options").filter(":selected").text())
			activeAnnotation.type = +bpType.val()
		})

		const bpColor = $('#bp_select_color')
		bpColor.on('change', () => {
			bpColor.blur()
			const activeAnnotation = this.state.annotationManager!.getActiveBoundaryAnnotation()
			if (activeAnnotation === null)
				return
			log.info("Adding boundary color: " + bpColor.children("options").filter(":selected").text())
			activeAnnotation.color = +bpColor.val()
		})
	}

	private bind(): void {
		this.bindLanePropertiesPanel()
		this.bindLaneNeighborsPanel()
		this.bindConnectionPropertiesPanel()
		this.bindTerritoryPropertiesPanel()
		this.bindTrafficDevicePropertiesPanel()
		this.bindBoundaryPropertiesPanel()

		const menuControlElement = document.getElementById('menu_control')
		if (menuControlElement)
			menuControlElement.style.visibility = 'visible'
		else
			log.warn('missing element menu_control')

		const toolsDelete = document.getElementById('tools_delete')
		if (toolsDelete)
			toolsDelete.addEventListener('click', () => {
				this.uiDeleteActiveAnnotation()
			})
		else
			log.warn('missing element tools_delete')

		const toolsAddLane = document.getElementById('tools_add_lane')
		if (toolsAddLane)
			toolsAddLane.addEventListener('click', () => {
				this.uiAddAnnotation(AnnotationType.LANE)
			})
		else
			log.warn('missing element tools_add_lane')

		const toolsAddTrafficDevice = document.getElementById('tools_add_traffic_device')
		if (toolsAddTrafficDevice)
			toolsAddTrafficDevice.addEventListener('click', () => {
				this.uiAddAnnotation(AnnotationType.TRAFFIC_DEVICE)
			})
		else
			log.warn('missing element tools_add_traffic_device')

		const toolsLoadImages = document.getElementById('tools_load_images')
		if (toolsLoadImages)
			toolsLoadImages.addEventListener('click', () => {
				this.imageManager.loadImagesFromOpenDialog()
					.catch(err => log.warn('loadImagesFromOpenDialog failed: ' + err.message))
			})
		else
			log.warn('missing element tools_load_images')

		const toolsLoadTerritoriesKml = document.getElementById('tools_load_territories_kml')
		if (toolsLoadTerritoriesKml)
			toolsLoadTerritoriesKml.addEventListener('click', () => {
				const options: Electron.OpenDialogOptions = {
					message: 'Load Territories KML File',
					properties: ['openFile'],
					filters: [{name: 'kml', extensions: ['kml']}],
				}
				const handler = (paths: string[]): void => {
					if (paths && paths.length)
						this.state.annotationManager!.loadTerritoriesKml(paths[0])
							.catch(err => log.warn('loadTerritoriesKml failed: ' + err.message))
				}
				dialog.showOpenDialog(options, handler)
			})
		else
			log.warn('missing element tools_load_territories_kml')

		const toolsLoadAnnotation = document.getElementById('tools_load_annotation')
		if (toolsLoadAnnotation)
			toolsLoadAnnotation.addEventListener('click', () => {
				const options: Electron.OpenDialogOptions = {
					message: 'Load Annotations File',
					properties: ['openFile'],
					filters: [{name: 'json', extensions: ['json']}],
				}
				const handler = (paths: string[]): void => {
					if (paths && paths.length)
						this.state.annotationManager!.loadAnnotations(paths[0])
							.catch(err => log.warn('loadAnnotations failed: ' + err.message))
				}
				dialog.showOpenDialog(options, handler)
			})
		else
			log.warn('missing element tools_load_annotation')

		const toolsSave = document.getElementById('tools_save')
		if (toolsSave)
			toolsSave.addEventListener('click', () => {
				this.uiSaveToFile(OutputFormat.UTM)
			})
		else
			log.warn('missing element tools_save')

		const toolsExportKml = document.getElementById('tools_export_kml')
		if (toolsExportKml)
			toolsExportKml.addEventListener('click', () => {
				this.uiSaveWaypointsKml()
			})
		else
			log.warn('missing element tools_export_kml')

		this.deactivateAllAnnotationPropertiesMenus()
	}

	// }}

	private expandAccordion(domId: string): void {
		if ( !this.props.uiMenuVisible ) return
		$(domId).accordion('option', {active: 0})
	}

	private collapseAccordion(domId: string): void {
		if ( !this.props.uiMenuVisible ) return
		$(domId).accordion('option', {active: false})
	}

    // TODO JOE this all will be controlled by React state + markup  at some point {{

	private resetAllAnnotationPropertiesMenuElements = (): void => {
		this.resetBoundaryProp()
		this.resetLaneProp()
		this.resetConnectionProp()
		this.resetTerritoryProp()
		this.resetTrafficDeviceProp()
	}

	/**
	 * Reset lane properties elements based on the current active lane
	 */
	private resetLaneProp(): void {
		const activeAnnotation = this.state.annotationManager!.getActiveLaneAnnotation()
		if (!activeAnnotation) return

		this.expandAccordion('#menu_lane')

		if (activeAnnotation.neighborsIds.left.length > 0) {
			Annotator.deactivateLeftSideNeighbours()
		} else {
			Annotator.activateLeftSideNeighbours()
		}

		if (activeAnnotation.neighborsIds.right.length > 0) {
			Annotator.deactivateRightSideNeighbours()
		} else {
			Annotator.activateRightSideNeighbours()
		}

		if (activeAnnotation.neighborsIds.front.length > 0) {
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

		const lpSelectType = $('#lp_select_type')
		lpSelectType.removeAttr('disabled')
		lpSelectType.val(activeAnnotation.type.toString())

		const lpSelectLeft = $('#lp_select_left_type')
		lpSelectLeft.removeAttr('disabled')
		lpSelectLeft.val(activeAnnotation.leftLineType.toString())

		const lpSelectLeftColor = $('#lp_select_left_color')
		lpSelectLeftColor.removeAttr('disabled')
		lpSelectLeftColor.val(activeAnnotation.leftLineColor.toString())

		const lpSelectRight = $('#lp_select_right_type')
		lpSelectRight.removeAttr('disabled')
		lpSelectRight.val(activeAnnotation.rightLineType.toString())

		const lpSelectRightColor = $('#lp_select_right_color')
		lpSelectRightColor.removeAttr('disabled')
		lpSelectRightColor.val(activeAnnotation.rightLineColor.toString())

		const lpSelectEntry = $('#lp_select_entry')
		lpSelectEntry.removeAttr('disabled')
		lpSelectEntry.val(activeAnnotation.entryType.toString())

		const lpSelectExit = $('#lp_select_exit')
		lpSelectExit.removeAttr('disabled')
		lpSelectExit.val(activeAnnotation.exitType.toString())
	}

	/**
	 * Reset territory properties elements based on the current active territory
	 */
	private resetTerritoryProp(): void {
		const activeAnnotation = this.state.annotationManager!.getActiveTerritoryAnnotation()
		if (!activeAnnotation) return

		this.expandAccordion('#menu_territory')

		const territoryLabel = document.getElementById('input_label_territory')
		if (territoryLabel) {
			(territoryLabel as HTMLInputElement).value = activeAnnotation.getLabel()
		} else
			log.warn('missing element input_label_territory')
	}

	/**
	 * Reset traffic device properties elements based on the current active traffic device
	 */
	private resetTrafficDeviceProp(): void {
		const activeAnnotation = this.state.annotationManager!.getActiveTrafficDeviceAnnotation()
		if (!activeAnnotation) return

		this.expandAccordion('#menu_traffic_device')

		const tpId = document.getElementById('tp_id_value')
		if (tpId)
			tpId.textContent = activeAnnotation.id.toString()
		else
			log.warn('missing element tp_id_value')

		const tpSelectType = $('#tp_select_type')
		tpSelectType.removeAttr('disabled')
		tpSelectType.val(activeAnnotation.type.toString())
	}

	/**
	 * Reset boundary properties elements based on the current active boundary
	 */
	private resetBoundaryProp(): void {
		const activeAnnotation = this.state.annotationManager!.getActiveBoundaryAnnotation()
		if (!activeAnnotation) return

		this.expandAccordion('#menu_boundary')

		const bpId = document.getElementById('bp_id_value')
		if (bpId)
			bpId.textContent = activeAnnotation.id.toString()
		else
			log.warn('missing element bp_id_value')

		const bpSelectType = $('#bp_select_type')
		bpSelectType.removeAttr('disabled')
		bpSelectType.val(activeAnnotation.type.toString())

		const bpSelectColor = $('#bp_select_color')
		bpSelectColor.removeAttr('disabled')
		bpSelectColor.val(activeAnnotation.color.toString())
	}

	/**
	 * Reset connection properties elements based on the current active connection
	 */
	private resetConnectionProp(): void {
		const activeAnnotation = this.state.annotationManager!.getActiveConnectionAnnotation()
		if (!activeAnnotation) return

		this.expandAccordion('#menu_connection')

		const cpId = document.getElementById('cp_id_value')
		if (cpId)
			cpId.textContent = activeAnnotation.id.toString()
		else
			log.warn('missing element bp_id_value')

		const cpSelectType = $('#cp_select_type')
		cpSelectType.removeAttr('disabled')
		cpSelectType.val(activeAnnotation.type.toString())
	}

	private deactivateAllAnnotationPropertiesMenus = (exceptFor: AnnotationType = AnnotationType.UNKNOWN): void => {
		if ( !this.props.uiMenuVisible ) return
		if (exceptFor !== AnnotationType.BOUNDARY) this.deactivateBoundaryProp()
		if (exceptFor !== AnnotationType.LANE) this.deactivateLanePropUI()
		if (exceptFor !== AnnotationType.CONNECTION) this.deactivateConnectionProp()
		if (exceptFor !== AnnotationType.TERRITORY) this.deactivateTerritoryProp()
		if (exceptFor !== AnnotationType.TRAFFIC_DEVICE) this.deactivateTrafficDeviceProp()
	}

	/**
	 * Deactivate lane properties menu panel
	 */
	private deactivateLanePropUI(): void {
		this.collapseAccordion('#menu_lane')

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
	}

	/**
	 * Deactivate boundary properties menu panel
	 */
	private deactivateBoundaryProp(): void {
		this.collapseAccordion('#menu_boundary')

		const bpId = document.getElementById('bp_id_value')
		if (bpId)
			bpId.textContent = 'UNKNOWN'
		else
			log.warn('missing element bp_id_value')

		const bpType = document.getElementById('bp_select_type')
		if (bpType)
			bpType.setAttribute('disabled', 'disabled')
		else
			log.warn('missing element bp_select_type')

		const bpColor = document.getElementById('bp_select_color')
		if (bpColor)
			bpColor.setAttribute('disabled', 'disabled')
		else
			log.warn('missing element bp_select_color')

		const boundaryProp = document.getElementById('boundary_prop')
		if (boundaryProp) {
			const selects = boundaryProp.getElementsByTagName('select')
			for (let i = 0; i < selects.length; ++i) {
				selects.item(i).selectedIndex = 0
				selects.item(i).setAttribute('disabled', 'disabled')
			}
		} else
			log.warn('missing element boundary_prop')
	}

	/**
	 * Deactivate connection properties menu panel
	 */
	private deactivateConnectionProp(): void {
		this.collapseAccordion('#menu_connection')

		const cpId = document.getElementById('cp_id_value')
		if (cpId)
			cpId.textContent = 'UNKNOWN'
		else
			log.warn('missing element cp_id_value')

		const cpType = document.getElementById('cp_select_type')
		if (cpType)
			cpType.setAttribute('disabled', 'disabled')
		else
			log.warn('missing element cp_select_type')

		const connectionProp = document.getElementById('connection_prop')
		if (connectionProp) {
			const selects = connectionProp.getElementsByTagName('select')
			for (let i = 0; i < selects.length; ++i) {
				selects.item(i).selectedIndex = 0
				selects.item(i).setAttribute('disabled', 'disabled')
			}
		} else
			log.warn('missing element boundary_prop')
	}

	/**
	 * Deactivate territory properties menu panel
	 */
	private deactivateTerritoryProp(): void {
		this.collapseAccordion('#menu_territory')

		const territoryLabel = document.getElementById('input_label_territory')
		if (territoryLabel)
			(territoryLabel as HTMLInputElement).value = ''
		else
			log.warn('missing element input_label_territory')
	}

	/**
	 * Deactivate traffic device properties menu panel
	 */
	private deactivateTrafficDeviceProp(): void {
		this.collapseAccordion('#menu_traffic_device')

		const tpId = document.getElementById('tp_id_value')
		if (tpId)
			tpId.textContent = 'UNKNOWN'
		else
			log.warn('missing element tp_id_value')

		const tpType = document.getElementById('tp_select_type')
		if (tpType)
			tpType.setAttribute('disabled', 'disabled')
		else
			log.warn('missing element tp_select_type')
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

	// Toggle the visibility of data by cycling through the groups defined in layerGroups.
	private uiToggleLayerVisibility(): void {
		let { layerGroupIndex } = this.state

		layerGroupIndex++

		if (!layerGroups[layerGroupIndex])
			layerGroupIndex = defaultLayerGroupIndex

		this.state.annotatedSceneController!.setLayerVisibility(layerGroups[layerGroupIndex], true)
		this.setState({ layerGroupIndex })
	}

	componentDidMount(): void {
		window.addEventListener('focus', this.onFocus)
		window.addEventListener('blur', this.onBlur)
		window.addEventListener('beforeunload', this.onBeforeUnload)

		document.addEventListener('mousemove', this.setLastMousePosition)
		document.addEventListener('mousemove', this.checkForImageScreenSelection)
		document.addEventListener('mouseup', this.clickImageScreenBox)

		this.bind()
	}

	componentWillUnmount(): void {
		this.destroyControlsGui()

		// TODO JOE  - remove event listeners  - clean up child windows
	}

	componentDidUpdate(_oldProps: AnnotatorProps, oldState: AnnotatorState): void {
		if (!oldState.annotationManager && this.state.annotationManager) {
			this.createControlsGui()
		}

		if (!oldState.annotatedSceneController && this.state.annotatedSceneController) {

			const {utmCoordinateSystem, channel} = this.state.annotatedSceneController

			this.imageManager = new ImageManager( utmCoordinateSystem, channel )

			// events from ImageManager
			channel.on(Events.KEYDOWN, this.state.annotatedSceneController.onKeyDown)
			channel.on(Events.KEYUP, this.state.annotatedSceneController.onKeyUp)
			channel.on(Events.IMAGE_SCREEN_LOAD_UPDATE, this.onImageScreenLoad)
			channel.on(Events.LIGHTBOX_CLOSE, this.clearLightboxImageRays)

			// IDEA JOE maybe we need a separate LightBoxRayManager? Or at least move to ImageManager
			channel.on(Events.LIGHT_BOX_IMAGE_RAY_UPDATE, this.onLightboxImageRay)
			channel.on(Events.GET_LIGHTBOX_IMAGE_RAYS, this.getLightboxImageRays)
			channel.on(Events.CLEAR_LIGHTBOX_IMAGE_RAYS, this.clearLightboxImageRays)

			this.addImageScreenLayer()

			// UI updates
			// TODO JOE move UI logic to React/JSX, and get state from Redux
			channel.on('deactivateFrontSideNeighbours', Annotator.deactivateFrontSideNeighbours)
			channel.on('deactivateLeftSideNeighbours', Annotator.deactivateLeftSideNeighbours)
			channel.on('deactivateRightSideNeighbours', Annotator.deactivateRightSideNeighbours)
			channel.on('deactivateAllAnnotationPropertiesMenus', this.deactivateAllAnnotationPropertiesMenus)
			channel.on('resetAllAnnotationPropertiesMenuElements', this.resetAllAnnotationPropertiesMenuElements)

			this.setKeys()

		}

		if (oldState.isImageScreensVisible !== this.state.isImageScreensVisible) {
			if (this.state.isImageScreensVisible) {
				this.imageManager.showImageScreens()
			} else {
				this.imageManager.hideImageScreens()
			}
		}
	}

	getAnnotatedSceneRef = (ref: any) => {
		ref && this.setState({ annotatedSceneController: ref.getWrappedInstance() as AnnotatedSceneController })
	}

	// TODO JOE don't get refs directly, proxy functionality through AnnotatedSceneController
	getAnnotationManagerRef = (ref: AnnotationManager) => {
		ref && this.setState({ annotationManager: ref })
	}

	render(): JSX.Element {
		return (
			<React.Fragment>
				<AnnotatedSceneController
					ref={this.getAnnotatedSceneRef}
					backgroundColor={this.state.background}
					getAnnotationManagerRef={this.getAnnotationManagerRef}
					initialBoundingBox={config['startup.point_cloud_bounding_box'] || ConfigDefault.StartupPointCloudBoundingBox}

					lockBoundaries={this.state.lockBoundaries}
					lockTerritories={this.state.lockTerritories}
					lockLanes={this.state.lockLanes}
					lockTrafficDevices={this.state.lockTrafficDevices}
				/>
				<AnnotatorMenuView uiMenuVisible={this.props.uiMenuVisible!}/>
			</React.Fragment>
		)
	}
}
