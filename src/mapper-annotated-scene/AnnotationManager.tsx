/**
 *  Copyright 2017 Mapper Inc. Part of the mapper-annotator project.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as React from 'react'
import * as Electron from 'electron'
import * as lodash from 'lodash'
import * as THREE from 'three'
import {getClosestPoints} from './geometry/ThreeHelpers'
import config from '../config'
import {dateToString} from '../util/dateToString'
import mousePositionToGLSpace from '../util/mousePositionToGLSpace'
import {isNullOrUndefined} from 'util' // eslint-disable-line node/no-deprecated-api
import {AnnotationType} from './annotations/AnnotationType'
import {AnnotationConstructResult} from './annotations/AnnotationConstructResult'
import {currentAnnotationFileVersion, toCurrentAnnotationVersion} from './annotations/SerializedVersion'
import {
	Annotation, AnnotationId, AnnotationJsonInputInterface,
	AnnotationJsonOutputInterface, AnnotationUuid, LlaJson, UtmJson,
} from './annotations/AnnotationBase'
import {
	Lane, NeighborDirection, NeighborLocation,
} from './annotations/Lane'
import * as AnnotationFactory from './annotations/AnnotationFactory'
import {TrafficDevice} from './annotations/TrafficDevice'
import {Territory} from './annotations/Territory'
import {Connection} from './annotations/Connection'
import {Boundary} from './annotations/Boundary'
import {SimpleKML} from '../util/KmlUtils'
import * as EM from './ErrorMessages'
import * as AsyncFile from 'async-file'
import * as mkdirp from 'mkdirp'
import {UtmCoordinateSystem} from './UtmCoordinateSystem'
import * as CRS from './CoordinateReferenceSystem'
import Logger from '../util/log'
import {tileIndexFromVector3} from './tile-model/TileIndex'
import {ScaleProvider} from './tile/ScaleProvider'
import LayerManager, {Layer} from './src/services/LayerManager'
import AnnotatedSceneActions from './src/store/actions/AnnotatedSceneActions'
import {typedConnect} from './src/styles/Themed'
import toProps from '../util/toProps'
import {AnnotationSuperTile} from './tile/AnnotationSuperTile'
import {RangeSearch} from './tile-model/RangeSearch'
import {CoordinateFrameType} from './geometry/CoordinateFrame'
import PointCloudManager from './src/services/PointCloudManager'
import GroundPlaneManager from './src/services/GroundPlaneManager'
import {AnnotationTileManager} from './tile/AnnotationTileManager'
import {SceneManager} from './src/services/SceneManager'
import {EventEmitter} from 'events'
import {Events} from './src/models/Events'
import {kmlToTerritories} from '../util/KmlToTerritories'

const log = Logger(__filename)
const dialog = Electron.remote.dialog

// tslint:disable:no-string-literal

export enum OutputFormat {
	UTM = 1,
	LLA = 2,
}
export interface AnnotationManagerJsonOutputInterface {
	version: number
	created: string
	coordinateReferenceSystem: CRS.CoordinateReferenceSystem
	annotations: Array<AnnotationJsonOutputInterface>
}

interface IProps {

	handleTileManagerLoadError: (msg: string, err: Error) => void

	scaleProvider: ScaleProvider
	utmCoordinateSystem: UtmCoordinateSystem
	pointCloudManager: PointCloudManager
	groundPlaneManager: GroundPlaneManager
	annotationTileManager?: AnnotationTileManager
	sceneManager: SceneManager
	layerManager: LayerManager

	// Replacing uiState in the short term
	isMouseDragging?: boolean
	isRotationModeActive?: boolean
	isConnectLeftNeighborMode?: boolean
	isConnectRightNeighborMode?: boolean
	isConnectFrontNeighborMode?: boolean
	isAddMarkerMode?: boolean
	isLiveMode?: boolean
	isAddConnectionMode?: boolean
	isJoinAnnotationMode?: boolean
	isControlKeyPressed?: boolean
	isAddConflictOrDeviceMode?: boolean
	isMouseDown?: boolean
	numberKeyPressed?: number | null

	areaOfInterest?: RangeSearch[]
	rendererSize?: Electron.Size
	camera?: THREE.Camera

	lockBoundaries?: boolean
	lockTerritories?: boolean
	lockLanes?: boolean
	lockTrafficDevices?: boolean
	channel: EventEmitter

	isInitialOriginSet?: boolean
}

interface IState {
}

/**
 * The AnnotationManager is in charge of maintaining a set of annotations and all operations
 * to modify, add or delete them. It also keeps an index to the "active" annotation as well
 * as its markers. The "active" annotation is the only one that can be modified.
 */
@typedConnect(toProps(
	'isMouseDragging',
	'isRotationModeActive',
	'isConnectLeftNeighborMode',
	'isConnectRightNeighborMode',
	'isConnectFrontNeighborMode',
	'isAddMarkerMode',

	'isLiveMode',
	'isAddConnectionMode',
	'isJoinAnnotationMode',
	'isControlKeyPressed',
	'isAddConflictOrDeviceMode',
	'isMouseDown',
	'numberKeyPressed',

	'lockBoundaries',
	'lockTerritories',
	'lockLanes',
	'lockTrafficDevices',

	'areaOfInterest',
	'rendererSize',
	'camera',
	'isInitialOriginSet',
))
export class AnnotationManager extends React.Component<IProps, IState> {
	laneAnnotations: Array<Lane> = []
	boundaryAnnotations: Array<Boundary> = []
	trafficDeviceAnnotations: Array<TrafficDevice> = []
	territoryAnnotations: Array<Territory> = []
	connectionAnnotations: Array<Connection> = []
	annotationObjects: Array<THREE.Object3D> = []
	activeAnnotation: Annotation | null = null
	private metadataState: AnnotationState = new AnnotationState(this) // eslint-disable-line no-use-before-define
	bezierScaleFactor = 6 // Used when creating connections
	private raycasterPlane: THREE.Raycaster = new THREE.Raycaster()
	private raycasterMarker: THREE.Raycaster = new THREE.Raycaster()
	private raycasterAnnotation: THREE.Raycaster = new THREE.Raycaster()
	private hovered: THREE.Object3D | null = null // a marker which the user is interacting with
	private annotationGroup: THREE.Group = new THREE.Group()

	constructor(props: IProps) {
		super(props)

		this.raycasterPlane.params.Points!.threshold = 0.1

		this.props.channel.on(Events.SUPER_TILE_CREATED, this.addSuperTile)
		this.props.channel.on(Events.SUPER_TILE_REMOVED, this.removeSuperTile)

		this.props.channel.on('transformUpdate', this.updateActiveAnnotationMesh)
	}

	componentDidMount(): void {
		new AnnotatedSceneActions().addObjectToScene(this.annotationGroup)
		this.props.layerManager.addLayer(Layer.ANNOTATIONS, this.showAnnotations)

		const annotationsPath = config['startup.annotations_path']

		if (annotationsPath) this.loadAnnotations(annotationsPath).then()
	}

	componentWillUnmount(): void {
		this.props.layerManager.removeLayer(Layer.ANNOTATIONS)
		new AnnotatedSceneActions().removeObjectFromScene(this.annotationGroup)
	}

	componentDidUpdate(previousProps: IProps): void {
		// NOTE JOE isInitialOriginSet will be replaced with a dynamically changing origin
		if (
			previousProps.areaOfInterest !== this.props.areaOfInterest &&
			this.props.isInitialOriginSet &&
			this.props.areaOfInterest &&
			this.props.layerManager.isLayerVisible(Layer.ANNOTATIONS)
		) {
			this.loadAnnotationDataFromMapServer(this.props.areaOfInterest, true)
				.catch(err => {
					log.warn(err.message)
				})
		}

		if (previousProps.isRotationModeActive !== this.props.isRotationModeActive) {
			const mode = this.props.isRotationModeActive ? 'rotate' : 'translate'

			new AnnotatedSceneActions().setTransformControlsMode(mode)
		}
	}

	render(): JSX.Element | null {
		return null
	}

	/**
	 * 	Get all markers for the active annotation, if any.
	 */
	activeMarkers(): Array<THREE.Mesh> {
		return this.activeAnnotation
			? this.activeAnnotation.markers
			: []
	}

	getActiveLaneAnnotation(): Lane | null {
		if (this.activeAnnotation && this.activeAnnotation instanceof Lane)
			return this.activeAnnotation as Lane
		else
			return null
	}

	getActiveConnectionAnnotation(): Connection | null {
		if (this.activeAnnotation && this.activeAnnotation instanceof Connection)
			return this.activeAnnotation as Connection
		else
			return null
	}

	getActiveBoundaryAnnotation(): Boundary | null {
		if (this.activeAnnotation && this.activeAnnotation instanceof Boundary)
			return this.activeAnnotation as Boundary
		else
			return null
	}

	getActiveTerritoryAnnotation(): Territory | null {
		if (this.activeAnnotation && this.activeAnnotation instanceof Territory)
			return this.activeAnnotation as Territory
		else
			return null
	}

	getActiveTrafficDeviceAnnotation(): TrafficDevice | null {
		if (this.activeAnnotation && this.activeAnnotation instanceof TrafficDevice)
			return this.activeAnnotation as TrafficDevice
		else
			return null
	}

	neighboringMarkers(origin: THREE.Mesh, distance: number): Array<THREE.Mesh> {
		if (this.activeAnnotation)
			return this.activeAnnotation.neighboringMarkers(origin, distance)
		else
			return []
	}

	private static createAnnotationFromJson(obj: AnnotationJsonInputInterface): [Annotation | null, AnnotationConstructResult] {
		const annotationType = AnnotationType[obj.annotationType]
		const newAnnotation = AnnotationFactory.construct(annotationType, obj)

		if (!newAnnotation)
			return [null, AnnotationConstructResult.CONSTRUCTOR_ERROR]
		if (!newAnnotation.isValid())
			return [null, AnnotationConstructResult.INVALID_INPUT]

		return [newAnnotation, AnnotationConstructResult.SUCCESS]
	}

	private static createAnnotationByType(annotationType: AnnotationType): [Annotation | null, AnnotationConstructResult] {
		const newAnnotation = AnnotationFactory.construct(annotationType)

		if (!newAnnotation)
			return [null, AnnotationConstructResult.CONSTRUCTOR_ERROR]

		return [newAnnotation, AnnotationConstructResult.SUCCESS]
	}

	/**
	 * Create a new annotation.
	 * @param annotationType  Construct a new annotation with the given type
	 * @param activate Activate the new annotation after creation
	 * @return either an Annotation with success result code
	 * or null with a failure result code
	 */
	createAndAddAnnotation(
		annotationType: AnnotationType,
		activate = false
	): [Annotation | null, AnnotationConstructResult] {
		const result = AnnotationManager.createAnnotationByType(annotationType)
		const annotation = result[0]

		if (annotation === null)
			return result
		else
			return this.addAnnotation(annotation, activate)
	}

	addSuperTile = (superTile: AnnotationSuperTile): void => {
		if (!(superTile instanceof AnnotationSuperTile)) return
		superTile.annotations.forEach(a => this.addAnnotation(a))
	}

	removeSuperTile = (superTile: AnnotationSuperTile): void => {
		if (!(superTile instanceof AnnotationSuperTile)) return
		superTile.annotations.forEach(a => this.deleteAnnotation(a))
	}

	addAnnotation(
		annotation: Annotation,
		activate = false
	): [Annotation | null, AnnotationConstructResult] {
		// Can't create a new annotation if the current active annotation doesn't have any markers (because if we did
		// that annotation wouldn't be selectable and it would be lost).
		if (this.activeAnnotation && !this.activeAnnotation.isValid()) return [null, AnnotationConstructResult.INVALID_STATE]

		// Discard duplicate annotations.
		const similarAnnotations = this.annotationTypeToSimilarAnnotationsList(annotation.annotationType)

		if (similarAnnotations === null) {
			log.warn(`discarding annotation with invalid type ${annotation.annotationType}`)
			return [null, AnnotationConstructResult.INVALID_INPUT]
		}

		if (similarAnnotations.some(a => a.uuid === annotation.uuid))
			return [null, AnnotationConstructResult.DUPLICATE]

		// Set state.
		similarAnnotations.push(annotation)
		this.annotationObjects.push(annotation.renderingObject)
		this.annotationGroup.add(annotation.renderingObject)
		this.props.channel.emit(Events.SCENE_SHOULD_RENDER)
		if (activate)
			this.setActiveAnnotation(annotation)

		return [annotation, AnnotationConstructResult.SUCCESS]
	}

	// Get a reference to the list containing matching AnnotationType.
	private annotationTypeToSimilarAnnotationsList(annotationType: AnnotationType): Annotation[] | null {
		switch (annotationType) {
			case AnnotationType.BOUNDARY: return this.boundaryAnnotations
			case AnnotationType.CONNECTION: return this.connectionAnnotations
			case AnnotationType.LANE: return this.laneAnnotations
			case AnnotationType.TERRITORY: return this.territoryAnnotations
			case AnnotationType.TRAFFIC_DEVICE: return this.trafficDeviceAnnotations
			default: return null
		}
	}

	/**
	 * Add a new relation between two existing lanes
	 */
	addRelation(fromId: AnnotationId, toId: AnnotationId, relation: string): boolean {
		let laneFrom: Lane | null = null

		for (const annotation of this.laneAnnotations) {
			if (annotation.id === fromId) {
				laneFrom = annotation
				break
			}
		}

		let laneTo: Lane | null = null

		for (const annotation of this.laneAnnotations) {
			if (annotation.id === toId) {
				laneTo = annotation
				break
			}
		}

		if (laneTo === null || laneFrom === null) {
			dialog.showErrorBox(EM.ET_RELATION_ADD_FAIL, 'Given lane ids are not valid.')
			return false
		}

		switch (relation) {
			case 'left':
				laneFrom.neighborsIds.left.push(laneTo.uuid)
				laneTo.neighborsIds.right.push(laneFrom.uuid)
				break
			case 'left reverse':
				laneFrom.neighborsIds.left.push(laneTo.uuid)
				laneTo.neighborsIds.left.push(laneFrom.uuid)
				break
			case 'right':
				laneFrom.neighborsIds.right.push(laneTo.uuid)
				laneTo.neighborsIds.left.push(laneFrom.uuid)
				break
			case 'back':
			case 'front':
				if (relation === 'back') {
					const temp = laneFrom

					laneFrom = laneTo
					laneTo = temp
				}

				const index1 = laneFrom.neighborsIds.front.findIndex(neighbor =>
					neighbor === laneTo!.uuid
				)
				const index2 = laneTo.neighborsIds.back.findIndex(neighbor =>
					neighbor === laneFrom!.uuid
				)

				if (index1 === -1 && index2 === -1) {
					// check if close enough
					const laneFromPoint = laneFrom.markers[laneFrom.markers.length - 1].position
					const laneToPoint = laneTo.markers[1].position

					if (laneFromPoint.distanceTo(laneToPoint) < 1.0) {
						laneTo.neighborsIds.back.push(laneFrom.uuid)
						laneFrom.neighborsIds.front.push(laneTo.uuid)
					} else {
						// Connection lane needed
						this.addConnectionWithBezier(laneFrom, laneTo)
					}
				} else {
					dialog.showErrorBox(EM.ET_RELATION_ADD_FAIL, `${relation} relation already exists`)
					return false
				}

				break
			default:
				dialog.showErrorBox(EM.ET_RELATION_ADD_FAIL, 'Unknown relation to be added: ' + relation)
				return false
		}

		this.metadataState.dirty()
		return true
	}

	/**
	 * Create a new inactive lane annotation connected to the current active annotation at the given location and with
	 * the given direction of traffic.
	 */
	addConnectedLaneAnnotation(neighborLocation: NeighborLocation, neighborDirection: NeighborDirection): boolean {
		const activeLane = this.getActiveLaneAnnotation()

		if (!activeLane) {
			log.info("Can't add connected lane. No annotation is active.")
			return false
		}

		if (activeLane.markers.length < 4) {
			log.warn("Current active lane doesn't have an area. Can't add neighbor")
			return false
		}

		switch (neighborLocation) {
			case NeighborLocation.FRONT:
				return this.addFrontConnection(activeLane)
			case NeighborLocation.LEFT:
				return this.addLeftConnection(activeLane, neighborDirection)
			case NeighborLocation.RIGHT:
				return this.addRightConnection(activeLane, neighborDirection)
			case NeighborLocation.BACK:
				log.info('Adding back connection is not supported')
				return false
			default:
				log.warn('Unrecognized neighbor location')
				return false
		}
	}

	/**
	 * Join two annotations, if they are of the same type
	 */
	joinAnnotations(annotation1: Annotation, annotation2: Annotation): boolean {
		// Check if the 2 annotation are of the same type
		if (annotation1.constructor !== annotation2.constructor) {
			log.warn(`Clicked objects are not of the same type.`)
			return false
		}

		// merge
		if (!annotation1.join(annotation2)) {
			log.warn(`Unable to join the two annotations.`)
			return false
		}

		// create new neighbours connections
		if (annotation1 instanceof Lane)
			this.refreshLaneNeighbours(annotation1)

		// delete
		this.setActiveAnnotation(annotation1)
		this.deleteAnnotation(annotation2)

		this.metadataState.dirty()

		this.props.channel.emit(Events.SCENE_SHOULD_RENDER)
		return true
	}

	/**
	 * Refresh neighbours links for the given lane.
	 * The results of this function is that all neighbours of the current lane
	 * have the link back to this lane.
	 */
	refreshLaneNeighbours(annotation: Lane): void {
		if (!annotation.isValid()) return

		// Front neighbours
		annotation.neighborsIds.front.forEach(NeighbourUuid => {
			const neighbour = this.findAnnotationByUuid(NeighbourUuid)

			if (neighbour && neighbour instanceof Lane)
				neighbour.addNeighbor(annotation.uuid, NeighborLocation.BACK)
			else
				log.error("Couldn't find front neighbor. This should never happen.")
		})

		// Back neighbours
		annotation.neighborsIds.back.forEach(NeighbourUuid => {
			const neighbour = this.findAnnotationByUuid(NeighbourUuid)

			if (neighbour && neighbour instanceof Lane)
				neighbour.addNeighbor(annotation.uuid, NeighborLocation.FRONT)
			else
				log.error("Couldn't find back neighbor. This should never happen.")
		})

		// Left neighbours
		const p1: THREE.Vector3 = annotation.waypoints[1].sub(annotation.waypoints[0])

		annotation.neighborsIds.left.forEach(NeighbourUuid => {
			const neighbour = this.findAnnotationByUuid(NeighbourUuid)

			if (neighbour && neighbour instanceof Lane && neighbour.isValid()) {
				const p2: THREE.Vector3 = neighbour.waypoints[1].sub(neighbour.waypoints[0])
				const angle = p1.angleTo(p2)

				if (angle < (Math.PI / 3)) {
					// same direction
					neighbour.addNeighbor(annotation.uuid, NeighborLocation.RIGHT)
				} else {
					// opposite direction
					neighbour.addNeighbor(annotation.uuid, NeighborLocation.LEFT)
				}
			} else {
				log.error("Couldn't find left neighbor. This should never happen.")
			}
		})

		// Right neighbours
		annotation.neighborsIds.right.forEach(NeighbourUuid => {
			const neighbour = this.findAnnotationByUuid(NeighbourUuid)

			if (neighbour && neighbour instanceof Lane && neighbour.isValid()) {
				const p2: THREE.Vector3 = neighbour.waypoints[1].sub(neighbour.waypoints[0])
				const angle = p1.angleTo(p2)

				if (angle < (Math.PI / 3)) {
					// same direction
					neighbour.addNeighbor(annotation.uuid, NeighborLocation.LEFT)
				} else {
					// opposite direction
					neighbour.addNeighbor(annotation.uuid, NeighborLocation.RIGHT)
				}
			} else {
				log.error("Couldn't find right neighbor. This should never happen.")
			}
		})
	}

	/**
	 * If current annotation is a lane, try to reverse its direction. The presence
	 * of neighbours to the left and right is returned to the caller (mainly for UI updates)
	 * @returns [result, existLeftNeighbour, existRightNeighbour]
	 */
	reverseLaneDirection(): {result: boolean, existLeftNeighbour: boolean, existRightNeighbour: boolean} {
		const activeLane = this.getActiveLaneAnnotation()

		if (!activeLane) {
			log.info("Can't reverse lane. No annotation is active.")
			return {result: false, existLeftNeighbour: false, existRightNeighbour: false}
		}

		if (!activeLane.reverseMarkers()) {
			log.info('Reverse lane failed.')
			return {result: false, existLeftNeighbour: false, existRightNeighbour: false}
		}

		this.props.channel.emit(Events.SCENE_SHOULD_RENDER)

		return {result: true,
			existLeftNeighbour: activeLane.neighborsIds.left.length > 0,
			existRightNeighbour: activeLane.neighborsIds.right.length > 0}
	}

	/**
	 * Eliminate the current active annotation from the manager. Delete its associated
	 * mesh and markers and reset any active annotation variables.
	 */
	deleteActiveAnnotation(): boolean {
		if (!this.activeAnnotation) {
			log.warn("Can't delete active annotation. No active annotation selected.")
			return false
		}

		if (!this.deleteAnnotation(this.activeAnnotation)) {
			log.warn(`deleteAnnotation() failed for ${this.activeAnnotation.annotationType}, ${this.activeAnnotation.uuid}`)
			return false
		}

		this.unsetActiveAnnotation()
		this.metadataState.dirty()

		return true
	}

	addMarkerToActiveAnnotation(position: THREE.Vector3): void {
		if (!this.activeAnnotation) {
			log.info("No active annotation. Can't add marker")
			return
		}

		if (this.activeAnnotation.addMarker(position, true)) {
			this.metadataState.dirty()
			this.props.channel.emit(Events.SCENE_SHOULD_RENDER)
		}
	}

	/**
	 * Close the loop of markers or do any other clean-up to designate an annotation "complete".
	 */
	completeActiveAnnotation(): boolean {
		if (!this.activeAnnotation) {
			log.info("No active annotation. Can't complete")
			return false
		}

		if (this.activeAnnotation.complete()) {
			this.metadataState.dirty()
			return true
		} else {
			return false
		}
	}

	deleteLastMarker(): boolean {
		if (!this.activeAnnotation) {
			log.info("No active annotation. Can't delete marker")
			return false
		}

		this.activeAnnotation.deleteLastMarker()

		this.metadataState.dirty()
		this.hideTransform()
		return true
	}

	private showAnnotations = (show: boolean): void => {
		this.annotationGroup.visible = show
	}

	/**
	 * Gets lane index given the list of lanes and the id of the desired lane
	 * @param annotations List of annotations
	 * @param uuid Desired id
	 * @returns Array index, or -1 if uuid not found
	 */
	getAnnotationIndexFromUuid(annotations: Array<Annotation>, uuid: AnnotationUuid): number {
		return annotations.findIndex((item) => {
			return item.uuid === uuid
		})
	}

	/**
	 * Check if the passed mesh corresponds to an inactive annotation.
	 */
	checkForInactiveAnnotation(object: THREE.Object3D): Annotation | null {
		const annotation = this.allAnnotations().find(a => a.renderingObject === object)

		if (annotation) {
			if (this.activeAnnotation && this.activeAnnotation.uuid === annotation.uuid)
				return null
			else
				return annotation
		}

		return null
	}

	/**
	 * Activate (i.e. make editable), the given annotation.
	 */
	setActiveAnnotation(changeTo: Annotation | null): void {
		if (!changeTo) return

		// Trying to activate the currently active annotation, there is nothing to do
		if (this.activeAnnotation && this.activeAnnotation.uuid === changeTo.uuid)
			return

		// Deactivate current active annotation
		this.unsetActiveAnnotation()

		// Set new active annotation
		this.activeAnnotation = changeTo
		this.activeAnnotation.makeActive()

		// If the new active annotation is a connection, change the rendering of it's conflicting connections
		if (this.activeAnnotation instanceof Connection) {
			const activeConnection = this.activeAnnotation as Connection

			activeConnection.conflictingConnections.forEach((id: AnnotationUuid) => {
				const connection = this.connectionAnnotations.find(a => a.uuid === id)

				if (!isNullOrUndefined(connection))
					connection.setConflictMode()
				else
					log.warn("Conflicting connection doesn't exist")
			})

			activeConnection.associatedTrafficDevices.forEach((id: AnnotationUuid) => {
				const device = this.trafficDeviceAnnotations.find(a => a.uuid === id)

				if (!isNullOrUndefined(device))
					device.setAssociatedMode(activeConnection.waypoints[0])
				else
					log.warn("Associated traffic device doesn't exist")
			})
		} else if (this.activeAnnotation instanceof Lane) {
			this.activeAnnotation.neighborsIds.left.forEach((id: AnnotationUuid) => {
				const neighbor = this.laneAnnotations.find(a => a.uuid === id)

				if (!isNullOrUndefined(neighbor))
					neighbor.setNeighborMode(NeighborLocation.LEFT)
			})

			this.activeAnnotation.neighborsIds.right.forEach((id: AnnotationUuid) => {
				const neighbor = this.laneAnnotations.find(a => a.uuid === id)

				if (!isNullOrUndefined(neighbor))
					neighbor.setNeighborMode(NeighborLocation.RIGHT)
			})

			this.activeAnnotation.neighborsIds.front.forEach((id: AnnotationUuid) => {
				const neighbor = this.laneAnnotations.find(a => a.uuid === id)

				if (!isNullOrUndefined(neighbor))
					neighbor.setNeighborMode(NeighborLocation.FRONT)
			})
		}

		if (this.props.isRotationModeActive && !this.activeAnnotation.isRotatable)
			this.toggleTransformControlsRotationMode()

		this.props.channel.emit(Events.SCENE_SHOULD_RENDER)
	}

	// Make no annotations active.
	unsetActiveAnnotation(): void {
		if (!this.activeAnnotation) return

		// If the active annotation was a connection make sure its conflicting connections appearance is set back
		// to inactive mode. In the future this behavior should happen inside the makeInactive function
		// but at this moment we don't have access to other annotations inside an annotation.
		if (this.activeAnnotation instanceof Connection) {
			this.activeAnnotation.conflictingConnections.forEach((id: AnnotationUuid) => {
				const connection = this.connectionAnnotations.find(a => a.uuid === id)

				if (!isNullOrUndefined(connection))
					connection.makeInactive()
				else
					log.warn("Conflicting connection doesn't exist")
			})

			this.activeAnnotation.associatedTrafficDevices.forEach((id: AnnotationUuid) => {
				const device = this.trafficDeviceAnnotations.find(a => a.uuid === id)

				if (!isNullOrUndefined(device))
					device.makeInactive()
				else
					log.warn("Associated traffic device doesn't exist")
			})
		} else if (this.activeAnnotation instanceof Lane) {
			// If the active annotation was a lane make sure its neighbors appearance is set back to inactive mode.
			this.activeAnnotation.neighborsIds.left.forEach((id: AnnotationUuid) => {
				const neighbor = this.laneAnnotations.find(a => a.uuid === id)

				if (!isNullOrUndefined(neighbor))
					neighbor.makeInactive()
			})

			this.activeAnnotation.neighborsIds.right.forEach((id: AnnotationUuid) => {
				const neighbor = this.laneAnnotations.find(a => a.uuid === id)

				if (!isNullOrUndefined(neighbor))
					neighbor.makeInactive()
			})

			this.activeAnnotation.neighborsIds.front.forEach((id: AnnotationUuid) => {
				const neighbor = this.laneAnnotations.find(a => a.uuid === id)

				if (!isNullOrUndefined(neighbor))
					neighbor.makeInactive()
			})
		}

		this.activeAnnotation.makeInactive()
		this.activeAnnotation = null

		this.props.channel.emit(Events.SCENE_SHOULD_RENDER)
	}

	/**
	 * Update the mesh of the active annotation. This is used if the lane marker positions
	 * where changed externally (e.g. by the transform controls)
	 */
	updateActiveAnnotationMesh = (): void => {
		if (!this.activeAnnotation) {
			log.warn("No active annotation. Can't update mesh")
			return
		}

		this.activeAnnotation.updateVisualization()
	}

	/**
	 * Draw the markers a little larger.
	 */
	highlightMarkers(markers: Array<THREE.Mesh>): void {
		if (this.activeAnnotation)
			this.activeAnnotation.highlightMarkers(markers)
	}

	/**
	 * Load territories from KML which is generated elsewhere. Build the objects and add them to the Annotator scene.
	 * @returns NULL or the center point of the bottom of the bounding box of the data; hopefully
	 *   there will be something to look at there
	 */
	loadKmlTerritoriesFromFile(fileName: string): Promise<THREE.Vector3 | null> {
		return kmlToTerritories(this.props.utmCoordinateSystem, fileName)
			.then(territories => {
				if (!territories)
					throw Error(`territories KML file ${fileName} has no territories`)
				log.info(`found ${territories.length} territories`)
				return this.addAnnotationsList(territories)
			})
	}

	/**
	 * Load annotations from file. Store all annotations and add them to the Annotator scene.
	 * This requires UTM as the input format.
	 * @returns NULL or the center point of the bottom of the bounding box of the data; hopefully
	 *   there will be something to look at there
	 */
	loadAnnotationsFromFile(fileName: string): Promise<THREE.Vector3 | null> {
		return AsyncFile.readFile(fileName, 'ascii')
			.then((text: string) => {
				const annotations = this.objectToAnnotations(JSON.parse(text))

				if (!annotations)
					throw Error(`annotation file ${fileName} has no annotations`)
				return this.addAnnotationsList(annotations)
			})
	}

	unloadAllAnnotations(): void {
		log.info('deleting all annotations')
		this.unsetActiveAnnotation()
		this.allAnnotations().forEach(a => this.deleteAnnotation(a))
		this.metadataState.clean()
	}

	enableAutoSave(): void {
		this.metadataState.enableAutoSave()
	}

	disableAutoSave(): void {
		this.metadataState.disableAutoSave()
	}

	immediateAutoSave(): Promise<void> {
		return this.metadataState.immediateAutoSave()
	}

	saveAnnotationsToFile(fileName: string, format: OutputFormat): Promise<void> {
		const annotations = this.allAnnotations()
			.filter(a => a.isValid())

		if (!annotations.length)
			return Promise.reject(Error('failed to save empty set of annotations'))

		if (!this.props.utmCoordinateSystem.hasOrigin && !config['output.annotations.debug.allow_annotations_without_utm_origin'])
			return Promise.reject(Error('failed to save annotations: UTM origin is not set'))

		const self = this
		const dirName = fileName.substring(0, fileName.lastIndexOf('/'))

		return Promise.resolve(mkdirp.sync(dirName))
			.then(() => AsyncFile.writeTextFile(fileName, JSON.stringify(self.toJSON(format, annotations), null, 2)))
			.then(() => self.metadataState.clean())
	}

	// Parcel out the annotations to tile files. This produces output similar to the Perception
	// TileManager, which conveniently is ready to be consumed by the Strabo LoadTiles script.
	// https://github.com/Signafy/mapper-annotator/blob/develop/documentation/tile_service.md
	exportAnnotationsTiles(directory: string, format: OutputFormat): Promise<void> {
		const annotations = this.allAnnotations()
			.filter(a => a.isValid())

		if (!annotations.length)
			return Promise.reject(Error('failed to save empty set of annotations'))

		if (!this.props.utmCoordinateSystem.hasOrigin && !config['output.annotations.debug.allow_annotations_without_utm_origin'])
			return Promise.reject(Error('failed to save annotations: UTM origin is not set'))

		if (format !== OutputFormat.UTM)
			return Promise.reject(Error('exportAnnotationsTiles() is implemented only for UTM'))

		mkdirp.sync(directory)

		// Repeat the entire annotation record in each tile that is intersected by the annotation.
		// TODO CLYDE For now the intersection algorithm only checks the markers (vertices) of the annotation
		// TODO CLYDE   geometry. It might be nice to interpolate between markers to find all intersections.
		const groups: Map<string, Set<Annotation>> = new Map()

		annotations.forEach(annotation => {
			annotation.markers.forEach(marker => {
				const utmPosition = this.props.utmCoordinateSystem.threeJsToUtm(marker.position)
				const key = tileIndexFromVector3(this.props.scaleProvider.utmTileScale, utmPosition).toString('_')
				const existing = groups.get(key)

				if (existing)
					groups.set(key, existing.add(annotation))
				else
					groups.set(key, new Set<Annotation>().add(annotation))
			})
		})

		// Generate a file for each tile.
		const promises: Promise<void>[] = []

		groups.forEach((tileAnnotations, key) => {
			const fileName = directory + '/' + key + '.json'

			promises.push(AsyncFile.writeTextFile(fileName,
				JSON.stringify(this.toJSON(format, Array.from(tileAnnotations)))
			))
		})

		return Promise.all(promises)
			.then(() => {})
	}

	toJSON(format: OutputFormat, annotations: Annotation[]): AnnotationManagerJsonOutputInterface {
		const crs = this.outputFormatToCoordinateReferenceSystem(format)
		const pointConverter = this.outputFormatToPointConverter(format)
		const data: AnnotationManagerJsonOutputInterface = {
			version: currentAnnotationFileVersion,
			created: new Date().toISOString(),
			coordinateReferenceSystem: crs,
			annotations: [],
		}

		data.annotations = annotations
			.map(a => a.toJSON(pointConverter))

		return data
	}

	private outputFormatToPointConverter(format: OutputFormat): (p: THREE.Vector3) => Object {
		switch (format) {
			case OutputFormat.UTM:
				return this.threeJsToUtmJsonObject()
			case OutputFormat.LLA:
				return this.threeJsToLlaJsonObject()
			default:
				throw Error('unknown OutputFormat: ' + format)
		}
	}

	private outputFormatToCoordinateReferenceSystem(format: OutputFormat): CRS.CoordinateReferenceSystem {
		switch (format) {
			case OutputFormat.UTM:
				return {
					coordinateSystem: 'UTM',
					datum: this.props.utmCoordinateSystem.datum,
					parameters: {
						utmZoneNumber: this.props.utmCoordinateSystem.utmZoneNumber,
						utmZoneNorthernHemisphere: this.props.utmCoordinateSystem.utmZoneNorthernHemisphere,
					},
				} as CRS.UtmCrs
			case OutputFormat.LLA:
				return {
					coordinateSystem: 'LLA',
					datum: this.props.utmCoordinateSystem.datum,
				} as CRS.LlaCrs
			default:
				throw Error('unknown OutputFormat: ' + format)
		}
	}

	/**
	 * 	Save lane waypoints (only) to KML.
	 */
	saveToKML(fileName: string): Promise<void> {
		// Get all the points and convert to lat lon
		const geopoints: Array<THREE.Vector3> =
			lodash.flatten(
				this.laneAnnotations.map(lane =>
					lane.waypoints.map(p => this.props.utmCoordinateSystem.threeJsToLngLatAlt(p))
				)
			)
		// Save file
		const kml = new SimpleKML()

		kml.addPath(geopoints)
		return kml.saveToFile(fileName)
	}

	private findAnnotationByUuid(uuid: AnnotationUuid): Annotation | null {
		const annotation = this.allAnnotations().find(a => a.uuid === uuid)

		if (annotation) return annotation

		return null
	}

	/**
	 * Get a usable data structure from raw JSON. There are plenty of ways for this to throw errors.
	 * Assume that they are caught and handled upstream.
	 */
	objectToAnnotations(json: Object): Annotation[] {
		// Check versioning and coordinate system
		const data = toCurrentAnnotationVersion(json)

		if (!data['annotations']) return []

		if (!this.checkCoordinateSystem(data)) {
			const params = data['coordinateReferenceSystem']['parameters']
			const zoneId = `${params['utmZoneNumber']}${params['utmZoneNorthernHemisphere']}`

			throw Error(`UTM Zone for new annotations (${zoneId}) does not match existing zone in ${this.props.utmCoordinateSystem}`)
		}

		this.convertCoordinates(data)

		// Convert data to annotations
		const errors: Map<string, number> = new Map()
		const annotations: Annotation[] = []

		data['annotations'].forEach((obj: AnnotationJsonInputInterface) => {
			const [newAnnotation, result]: [Annotation | null, AnnotationConstructResult] = AnnotationManager.createAnnotationFromJson(obj)

			if (newAnnotation) {
				annotations.push(newAnnotation)
			} else {
				const errorString = AnnotationConstructResult[result]
				const count = errors.get(errorString)

				if (count)
					errors.set(errorString, count + 1)
				else
					errors.set(errorString, 1)
			}
		})

		// Clean up and go home
		errors.forEach((v: number, k: string) =>
			log.warn(`discarding ${v} annotations with error ${k}`)
		)

		return annotations
	}

	private addAnnotationsList(annotations: Annotation[]): THREE.Vector3 | null {
		// Unset active, to pass a validation check in addAnnotation().
		this.unsetActiveAnnotation()

		// Convert data to annotations
		let boundingBox = new THREE.Box3()

		const errors: Map<string, number> = new Map()

		annotations.forEach((annotation: Annotation) => {
			const [newAnnotation, result]: [Annotation | null, AnnotationConstructResult] = this.addAnnotation(annotation)

			if (newAnnotation) {
				boundingBox = boundingBox.union(newAnnotation.boundingBox())
			} else {
				const errorString = AnnotationConstructResult[result]
				const count = errors.get(errorString)

				if (count)
					errors.set(errorString, count + 1)
				else
					errors.set(errorString, 1)
			}
		})

		// Clean up and go home
		errors.forEach((v: number, k: string) =>
			log.warn(`discarding ${v} annotations with error ${k}`)
		)

		this.metadataState.clean()

		if (boundingBox.isEmpty())
			return null
		else
			return boundingBox.getCenter().setY(boundingBox.min.y)
	}

	/**
	 * Concatenate all annotation types into a single array.
	 */
	allAnnotations(): Annotation[] {
		return ([] as Annotation[])
			.concat(this.boundaryAnnotations)
			.concat(this.connectionAnnotations)
			.concat(this.laneAnnotations)
			.concat(this.territoryAnnotations)
			.concat(this.trafficDeviceAnnotations)
	}

	/**
	 * Adds a new lane annotation and initializes its first two points to be the last two points of
	 * the source annotation and its next two points to be an extension in the direction of
	 * the last four points of the source annotation.
	 */
	private addFrontConnection(source: Lane): boolean {
		const newAnnotation = this.createAndAddAnnotation(AnnotationType.LANE)[0] as Lane

		if (!newAnnotation) return false

		const lastMarkerIndex = source.markers.length - 1
		const direction1 = new THREE.Vector3()
		const direction2 = new THREE.Vector3()

		direction1.subVectors(
			source.markers[lastMarkerIndex - 1].position,
			source.markers[lastMarkerIndex - 3].position
		)

		direction2.subVectors(
			source.markers[lastMarkerIndex].position,
			source.markers[lastMarkerIndex - 2].position
		)

		const thirdMarkerPosition = new THREE.Vector3()
		const fourthMarkerPosition = new THREE.Vector3()

		thirdMarkerPosition.addVectors(source.markers[lastMarkerIndex - 1].position, direction1)
		fourthMarkerPosition.addVectors(source.markers[lastMarkerIndex].position, direction2)

		newAnnotation.addRawMarker(source.markers[lastMarkerIndex - 1].position)
		newAnnotation.addRawMarker(source.markers[lastMarkerIndex].position)
		newAnnotation.addRawMarker(thirdMarkerPosition)
		newAnnotation.addRawMarker(fourthMarkerPosition)

		newAnnotation.addNeighbor(source.uuid, NeighborLocation.BACK)
		source.addNeighbor(newAnnotation.uuid, NeighborLocation.FRONT)

		newAnnotation.updateVisualization()
		newAnnotation.makeInactive()

		this.metadataState.dirty()

		this.props.channel.emit(Events.SCENE_SHOULD_RENDER)
		return true
	}

	/**
	 * Adds a new lane annotation to the left of the source annotation. It initializes its
	 * lane markers as a mirror of the source annotation. The order of the markers depends on the
	 * given direction of the neighbor.
	 */
	private addLeftConnection(source: Lane, neighborDirection: NeighborDirection): boolean {
		const newAnnotation = this.createAndAddAnnotation(AnnotationType.LANE)[0] as Lane

		if (!newAnnotation) return false

		switch (neighborDirection) {
			case NeighborDirection.SAME:
				for (let i = 0; i < source.markers.length; i += 2) {
					const rightMarkerPosition = source.markers[i + 1].position.clone()
					const direction = new THREE.Vector3()

					direction.subVectors(source.markers[i].position, rightMarkerPosition)

					const leftMarkerPosition = new THREE.Vector3()

					leftMarkerPosition.subVectors(rightMarkerPosition, direction)
					newAnnotation.addRawMarker(rightMarkerPosition)
					newAnnotation.addRawMarker(leftMarkerPosition)
				}

				// Record connection
				newAnnotation.addNeighbor(source.uuid, NeighborLocation.RIGHT)
				source.addNeighbor(newAnnotation.uuid, NeighborLocation.LEFT)

				break

			case NeighborDirection.REVERSE:
				for (let i = source.markers.length - 1; i >= 0; i -= 2) {
					const leftMarkerPosition = source.markers[i].position.clone()
					const direction = new THREE.Vector3()

					direction.subVectors(source.markers[i - 1].position, leftMarkerPosition)

					const rightMarkerPosition = new THREE.Vector3()

					rightMarkerPosition.subVectors(leftMarkerPosition, direction)
					newAnnotation.addRawMarker(rightMarkerPosition)
					newAnnotation.addRawMarker(leftMarkerPosition)
				}

				// Record connection
				newAnnotation.addNeighbor(source.uuid, NeighborLocation.LEFT)
				source.addNeighbor(newAnnotation.uuid, NeighborLocation.LEFT)

				break

			default:
				log.warn('Unrecognized neighbor direction.')
				return false
		}

		newAnnotation.updateVisualization()
		newAnnotation.makeInactive()

		this.metadataState.dirty()
		this.props.channel.emit(Events.SCENE_SHOULD_RENDER)
		return true
	}

	/**
	 * Adds a new lane annotation to the right of the source annotation. It initializes its
	 * lane markers as a mirror of the source annotation. The order of the markers depends on the
	 * given direction of the neighbor.
	 */
	private addRightConnection(source: Lane, neighborDirection: NeighborDirection): boolean {
		const newAnnotation = this.createAndAddAnnotation(AnnotationType.LANE)[0] as Lane

		if (!newAnnotation) return false

		switch (neighborDirection) {
			case NeighborDirection.SAME:
				for (let i = 0; i < source.markers.length; i += 2) {
					const leftMarkerPosition = source.markers[i].position.clone()
					const direction = new THREE.Vector3()

					direction.subVectors(source.markers[i + 1].position, leftMarkerPosition)

					const rightMarkerPosition = new THREE.Vector3()

					rightMarkerPosition.subVectors(leftMarkerPosition, direction)
					newAnnotation.addRawMarker(rightMarkerPosition)
					newAnnotation.addRawMarker(leftMarkerPosition)
				}

				// Record connection
				newAnnotation.addNeighbor(source.uuid, NeighborLocation.LEFT)
				source.addNeighbor(newAnnotation.uuid, NeighborLocation.RIGHT)

				break

			case NeighborDirection.REVERSE:
				for (let i = source.markers.length - 1; i >= 0; i -= 2) {
					const rightMarkerPosition = source.markers[i - 1].position.clone()
					const direction = new THREE.Vector3()

					direction.subVectors(source.markers[i].position, rightMarkerPosition)

					const leftMarkerPosition = new THREE.Vector3()

					leftMarkerPosition.subVectors(rightMarkerPosition, direction)
					newAnnotation.addRawMarker(rightMarkerPosition)
					newAnnotation.addRawMarker(leftMarkerPosition)
				}

				// Record connection
				newAnnotation.addNeighbor(source.uuid, NeighborLocation.RIGHT)
				source.addNeighbor(newAnnotation.uuid, NeighborLocation.RIGHT)

				break

			default:
				log.warn('Unrecognized neighbor direction.')
				return false
		}

		newAnnotation.updateVisualization()
		newAnnotation.makeInactive()

		this.metadataState.dirty()
		this.props.channel.emit(Events.SCENE_SHOULD_RENDER)
		return true
	}

	private deleteConnectionToNeighbors(annotation: Lane): void {
		let modifications = 0

		for (const neighborRightID of annotation.neighborsIds.right) {
			const rightNeighbor = this.findAnnotationByUuid(neighborRightID)

			if (rightNeighbor && rightNeighbor instanceof Lane) {
				if (rightNeighbor.deleteLeftOrRightNeighbor(annotation.uuid))
					modifications++
				else
					log.error('Non-reciprocal neighbor relation detected. This should never happen.')
			} else {
				log.error("Couldn't find right neighbor. This should never happen.")
			}
		}

		for (const neighborLeftID of annotation.neighborsIds.left) {
			const leftNeighbor = this.findAnnotationByUuid(neighborLeftID)

			if (leftNeighbor && leftNeighbor instanceof Lane) {
				if (leftNeighbor.deleteLeftOrRightNeighbor(annotation.uuid))
					modifications++
				else
					log.error('Non-reciprocal neighbor relation detected. This should never happen.')
			} else {
				log.error("Couldn't find left neighbor. This should never happen.")
			}
		}

		for (let i = 0; i < annotation.neighborsIds.front.length; i++) {
			const frontNeighbor = this.findAnnotationByUuid(annotation.neighborsIds.front[i])

			if (frontNeighbor instanceof Lane) {
				// If the front neighbor is another lane, delete the reference to this lane from its neighbors
				if (frontNeighbor.deleteBackNeighbor(annotation.uuid))
					modifications++
				else
					log.error("Couldn't find connection to back neighbor. This should never happen.")
			} else if (frontNeighbor instanceof Connection) {
				// If the front neighbor is a connection delete it
				if (this.deleteAnnotation(frontNeighbor))
					modifications++
			} else if (frontNeighbor) {
				log.error('Not valid front neighbor')
			}
		}

		for (let i = 0; i < annotation.neighborsIds.back.length; i++) {
			const backNeighbor = this.findAnnotationByUuid(annotation.neighborsIds.back[i])

			if (backNeighbor instanceof Lane) {
				// If the back neighbor is another lane, delete the reference to this lane from its neighbors
				if (backNeighbor.deleteFrontNeighbor(annotation.uuid))
					modifications++
				else
					log.error("Couldn't find connection to front neighbor. This should never happen.")
			} else if (backNeighbor instanceof Connection) {
				// If the back neighbor is a connection delete it
				if (this.deleteAnnotation(backNeighbor))
					modifications++
			} else if (backNeighbor) {
				log.error('Not valid back neighbor')
			}
		}

		if (modifications) this.metadataState.dirty()
	}

	/**
	 * Create a new lane connection between given lanes using a cubic Bezier curve
	 * This is the new implementation of former "addConnection" function.
	 */
	private addConnectionWithBezier(laneFrom: Lane, laneTo: Lane): void {
		if (laneFrom.markers.length < 4 || laneTo.markers.length < 4) {
			dialog.showErrorBox(EM.ET_RELATION_ADD_FAIL, 'Unable to generate forward relation.' +
				'Possible reasons: one of the two lanes connected does not have at least 4 markers.')

			return
		}

		// Create new connection
		const connection = new Connection()

		connection.setConnectionEndPoints(laneFrom.uuid, laneTo.uuid)
		this.connectionAnnotations.push(connection)

		// Glue neighbors
		laneFrom.neighborsIds.front.push(connection.uuid)
		laneTo.neighborsIds.back.push(connection.uuid)

		// Compute path
		const lastIndex = laneFrom.markers.length - 1
		const lp0 = laneFrom.markers[lastIndex - 3].position.clone()
		const lp1 = laneFrom.markers[lastIndex - 1].position.clone()
		const lp2 = laneTo.markers[0].position.clone()
		const lp3 = laneTo.markers[2].position.clone()
		const rp0 = laneFrom.markers[lastIndex - 2].position.clone()
		const rp1 = laneFrom.markers[lastIndex].position.clone()
		const rp2 = laneTo.markers[1].position.clone()
		const rp3 = laneTo.markers[3].position.clone()
		const lcp1 = new THREE.Vector3()
		const lcp2 = new THREE.Vector3()

		lcp1.subVectors(lp1, lp0).normalize().multiplyScalar(this.bezierScaleFactor).add(lp1)
		lcp2.subVectors(lp2, lp3).normalize().multiplyScalar(this.bezierScaleFactor).add(lp2)

		const rcp1 = new THREE.Vector3()
		const rcp2 = new THREE.Vector3()

		rcp1.subVectors(rp1, rp0).normalize().multiplyScalar(this.bezierScaleFactor).add(rp1)
		rcp2.subVectors(rp2, rp3).normalize().multiplyScalar(this.bezierScaleFactor).add(rp2)

		const curveLeft = new THREE.CubicBezierCurve3(lp1, lcp1, lcp2, lp2)
		const curveRight = new THREE.CubicBezierCurve3(rp1, rcp1, rcp2, rp2)
		const numPoints = 10
		const leftPoints = curveLeft.getPoints(numPoints)
		const rightPoints = curveRight.getPoints(numPoints)

		for (let i = 0; i < numPoints; i++) {
			connection.addMarker(getMarkerInBetween(rightPoints[i], leftPoints[i], 0.4), false)
			connection.addMarker(getMarkerInBetween(rightPoints[i], leftPoints[i], 0.6), false)
		}

		connection.addMarker(getMarkerInBetween(rp2, lp2, 0.4), false)
		connection.addMarker(getMarkerInBetween(rp2, lp2, 0.6), false)

		// Add annotation to the scene
		this.annotationObjects.push(connection.renderingObject)
		this.annotationGroup.add(connection.renderingObject)

		connection.makeInactive()
		connection.updateVisualization()
		this.metadataState.dirty()

		this.props.channel.emit(Events.SCENE_SHOULD_RENDER)
	}

	/**
	 * Delete an annotation and tear down references to it.
	 */
	deleteAnnotation(annotation: Annotation): boolean {
		// Get data structures appropriate to the type.
		const similarAnnotations = this.annotationTypeToSimilarAnnotationsList(annotation.annotationType)

		if (!similarAnnotations) return false

		// Side effect: remove references to this annotation from its neighbors
		if (annotation instanceof Lane) {
			this.deleteConnectionToNeighbors(annotation)
		} else if (annotation instanceof Connection) {
			this.removeUuidFromLaneNeighbors(annotation.startLaneUuid, annotation.uuid)
			this.removeUuidFromLaneNeighbors(annotation.endLaneUuid, annotation.uuid)
		}

		// Set state.
		const eraseIndex = this.getAnnotationIndexFromUuid(similarAnnotations, annotation.uuid)

		similarAnnotations.splice(eraseIndex, 1)
		this.removeRenderingObjectFromArray(this.annotationObjects, annotation.renderingObject)
		this.annotationGroup.remove(annotation.renderingObject)
		this.props.channel.emit(Events.SCENE_SHOULD_RENDER)

		return true
	}

	private threeJsToUtmJsonObject(): (p: THREE.Vector3) => UtmJson {
		const {utmCoordinateSystem} = this.props

		return function(p: THREE.Vector3): UtmJson {
			const utm = utmCoordinateSystem.threeJsToUtm(p)

			return {E: utm.x, N: utm.y, alt: utm.z}
		}
	}

	private threeJsToLlaJsonObject(): (p: THREE.Vector3) => LlaJson {
		const {utmCoordinateSystem} = this.props

		return function(p: THREE.Vector3): LlaJson {
			const lngLatAlt = utmCoordinateSystem.threeJsToLngLatAlt(p)

			return {lng: lngLatAlt.x, lat: lngLatAlt.y, alt: lngLatAlt.z}
		}
	}

	/**
	 * This expects the serialized UtmCrs structure produced by toJSON().
	 */
	private checkCoordinateSystem(data: Object): boolean {
		const crs = data['coordinateReferenceSystem']

		if (crs['coordinateSystem'] !== 'UTM') return false
		if (crs['datum'] !== this.props.utmCoordinateSystem.datum) return false

		if (isNullOrUndefined(crs['parameters']['utmZoneNumber'])) return false

		const num = crs['parameters']['utmZoneNumber']

		if (isNullOrUndefined(crs['parameters']['utmZoneNorthernHemisphere'])) return false

		const northernHemisphere = !!crs['parameters']['utmZoneNorthernHemisphere']

		if (!data['annotations'])
			return !this.props.utmCoordinateSystem.hasOrigin || this.props.utmCoordinateSystem.zoneMatch(num, northernHemisphere)

		// generate an arbitrary offset for internal use, given the first point in the data set
		let first: THREE.Vector3 | null = null

		// and round off the values for nicer debug output
		const trunc = function(x: number): number {
			return Math.trunc(x / 10) * 10
		}

		for (let i = 0; !first && i < data['annotations'].length; i++) {
			const annotation = data['annotations'][i]

			if (annotation['markers'] && annotation['markers'].length > 0) {
				const pos = annotation['markers'][0] as UtmJson

				first = new THREE.Vector3(trunc(pos['E']), trunc(pos['N']), trunc(pos['alt']))
			}
		}

		if (!first)
			return !this.props.utmCoordinateSystem.hasOrigin || this.props.utmCoordinateSystem.zoneMatch(num, northernHemisphere)

		return this.props.utmCoordinateSystem.setOrigin(num, northernHemisphere, first) ||
			this.props.utmCoordinateSystem.zoneMatch(num, northernHemisphere)
	}

	/**
	 * Convert markers from UTM objects to vectors in local coordinates, for downstream consumption.
	 */
	private convertCoordinates(data: Object): void {
		data['annotations'].forEach((annotation: {}) => {
			if (annotation['markers']) {
				for (let i = 0; i < annotation['markers'].length; i++) {
					const pos = annotation['markers'][i] as UtmJson

					annotation['markers'][i] = this.props.utmCoordinateSystem.utmToThreeJs(pos['E'], pos['N'], pos['alt'])
				}
			}
		})
	}

	private removeRenderingObjectFromArray(allObjects: Array<THREE.Object3D>, queryObject: THREE.Object3D): boolean {
		const index = allObjects.findIndex((obj) => {
			return obj === queryObject
		})

		if (index < 0) {
			log.error("Couldn't find associated object in internal object array. This should never happen")
			return false
		}

		this.annotationObjects.splice(index, 1)
		return true
	}

	private removeUuidFromArray(uuidArray: Array<AnnotationUuid>, uuidToRemove: AnnotationUuid): boolean {
		const index = uuidArray.findIndex((element) => {
			return element === uuidToRemove
		})

		if (index < 0)
			return false

		uuidArray.splice(index, 1)
		return true
	}

	private removeUuidFromLaneNeighbors(laneUuid: AnnotationUuid, uuidToRemove: AnnotationUuid): boolean {
		const lane = this.laneAnnotations.find(a => a.uuid === laneUuid)

		if (!lane) {
			log.error("Couldn't remove neighbor. Requested lane uuid doesn't exist")
			return false
		}

		// Check on all directions for the uuid to remove
		if (this.removeUuidFromArray(lane.neighborsIds.back, uuidToRemove))
			return true

		if (this.removeUuidFromArray(lane.neighborsIds.front, uuidToRemove))
			return true

		let index = lane.neighborsIds.left.indexOf(uuidToRemove, 0)

		if (index > -1) {
			lane.neighborsIds.left.splice(index, 1)
			return true
		}

		index = lane.neighborsIds.right.indexOf(uuidToRemove, 0)

		if (index > -1) {
			lane.neighborsIds.right.splice(index, 1)
			return true
		}

		return false
	}

	// Load tiles within a bounding box and add them to the scene.
	// ANNOTATOR ONLY???
	loadAnnotationDataFromMapServer(searches: RangeSearch[], loadAllPoints = false): Promise<void> {
		return this.props.annotationTileManager!.loadFromMapServer(searches, CoordinateFrameType.STANDARD, loadAllPoints)
			.then(loaded => {
				if (loaded) this.annotationLoadedSideEffects()
			})
			.catch(err => this.props.handleTileManagerLoadError('Annotations', err))
	}

	private annotationLoadedSideEffects(): void {
		// nothing here at the moment
	}

	loadTerritoriesKml(fileName: string): Promise<void> {
		log.info('Loading KML Territories from ' + fileName)
		this.props.layerManager!.setLayerVisibility([Layer.ANNOTATIONS])

		return this.loadKmlTerritoriesFromFile(fileName)
			.then(focalPoint => {
				if (focalPoint)
					this.props.sceneManager.setStage(focalPoint.x, focalPoint.y, focalPoint.z)
			})
			.catch(err => {
				log.error(err.message)
				dialog.showErrorBox('Territories Load Error', err.message)
			})
	}

	/**
	 * Load annotations from file. Add all annotations to the annotation manager
	 * and to the scene.
	 * Center the stage and the camera on the annotations model.
	 */
	loadAnnotations(fileName: string): Promise<void> {
		log.info('Loading annotations from ' + fileName)
		this.props.layerManager!.setLayerVisibility([Layer.ANNOTATIONS])

		return this.loadAnnotationsFromFile(fileName)
			.then(focalPoint => {
				if (focalPoint)
					this.props.sceneManager.setStage(focalPoint.x, focalPoint.y, focalPoint.z)
			})
			.catch(err => {
				log.error(err.message)
				dialog.showErrorBox('Annotation Load Error', err.message)
			})
	}

	private intersectWithLightboxImageRay(mousePosition: THREE.Vector2, lightboxImageRays: THREE.Line[]): THREE.Intersection[] {
		if (lightboxImageRays.length) {
			this.raycasterAnnotation.setFromCamera(mousePosition, this.props.camera!)
			return this.raycasterAnnotation.intersectObjects(lightboxImageRays)
		} else {
			return []
		}
	}

	/**
	 * If the mouse was clicked while pressing the "a" key, drop an annotation marker.
	 */
	addAnnotationMarker = (event: MouseEvent): void => {
		const {isMouseDragging, isConnectLeftNeighborMode, isConnectRightNeighborMode,
			isConnectFrontNeighborMode, isAddMarkerMode} = this.props

		if (
			!isAddMarkerMode ||
			isMouseDragging || isConnectLeftNeighborMode ||
			isConnectRightNeighborMode || isConnectFrontNeighborMode ||
			!this.activeAnnotation || !this.activeAnnotation.allowNewMarkers
		)
			return

		const mouse = mousePositionToGLSpace(event, this.props.rendererSize!)

		// If the click intersects the first marker of a ring-shaped annotation, close the annotation and return.
		if (this.activeAnnotation.markersFormRing()) {
			this.raycasterMarker.setFromCamera(mouse, this.props.camera!)

			const markers = this.activeMarkers()

			if (markers.length && this.raycasterMarker.intersectObject(markers[0]).length) {
				if (this.completeActiveAnnotation()) this.unsetActiveAnnotation()

				return
			}
		}

		this.raycasterPlane.setFromCamera(mouse, this.props.camera!)

		let intersections: THREE.Intersection[] = []

		// Find a 3D point where to place the new marker.
		if (this.activeAnnotation.snapToGround) {
			intersections = this.props.groundPlaneManager!.intersectWithGround()
		} else {
			// get app specific intersections
			const receiveRays = (lightboxImageRays: THREE.Line[]): void => {
				// If this is part of a two-step interaction with the lightbox, handle that.
				if (lightboxImageRays.length) {
					intersections = this.intersectWithLightboxImageRay(mouse, lightboxImageRays)

					// On success, clean up the ray from the lightbox.
					if (intersections.length)
						this.props.channel.emit(Events.CLEAR_LIGHTBOX_IMAGE_RAYS)
				}
			}

			this.props.channel.emit(Events.GET_LIGHTBOX_IMAGE_RAYS, receiveRays)

			// Otherwise just find the closest point.
			if (!intersections.length)
				intersections = this.props.pointCloudManager.intersectWithPointCloud(this.raycasterPlane)
		}

		if (intersections.length)
			this.addMarkerToActiveAnnotation(intersections[0].point)
	}

	/**
	 * If the mouse was clicked while pressing the "c" key, add new lane connection
	 * between current active lane and the "clicked" lane
	 */
	// ANNOTATOR ONLY
	addLaneConnection = (event: MouseEvent): void => {
		if (!this.props.isAddConnectionMode || this.props.isMouseDragging) return

		// reject connection if active annotation is not a lane
		const activeLane = this.getActiveLaneAnnotation()

		if (!activeLane) {
			log.info('No lane annotation is active.')
			return
		}

		// get clicked object
		const mouse = mousePositionToGLSpace(event, this.props.rendererSize!)

		this.raycasterAnnotation.setFromCamera(mouse, this.props.camera!)

		const intersects = this.raycasterAnnotation.intersectObjects(this.annotationObjects, true)

		if (intersects.length === 0)
			return

		const object = intersects[0].object.parent
		// check if clicked object is an inactive lane
		const inactive = this.checkForInactiveAnnotation(object as THREE.Object3D)

		if (!(inactive && inactive instanceof Lane)) {
			log.warn(`Clicked object is not an inactive lane.`)
			return
		}

		// find lane order based on distances between end points: active --> inactive lane or inactive --> active lane
		const inactiveToActive = inactive.markers[inactive.markers.length - 1].position.distanceTo(activeLane.markers[0].position)
		const activeToInactive = activeLane.markers[activeLane.markers.length - 1].position.distanceTo(inactive.markers[0].position)
		const fromUID = activeToInactive < inactiveToActive ? activeLane.id : inactive.id
		const toUID = activeToInactive < inactiveToActive ? inactive.id : activeLane.id

		// add connection
		if (!this.addRelation(fromUID, toUID, 'front')) {
			log.warn(`Lane connection failed.`)
			return
		}

		// update UI panel
		if (activeLane.id === fromUID)
			this.props.channel.emit('deactivateFrontSideNeighbours')
	}

	/**
	 * If the mouse was clicked while pressing the "l"/"r"/"f" key, then
	 * add new neighbor between current active lane and the "clicked" lane
	 */
	connectNeighbor = (event: MouseEvent): void => {
		const {isAddConnectionMode, isJoinAnnotationMode, isConnectLeftNeighborMode,
			isConnectRightNeighborMode, isConnectFrontNeighborMode, isMouseDragging} = this.props

		if (isAddConnectionMode || isJoinAnnotationMode || isMouseDragging)
			return

		if (!isConnectLeftNeighborMode &&
			!isConnectRightNeighborMode &&
			!isConnectFrontNeighborMode) return

		// reject neighbor if active annotation is not a lane
		const activeLane = this.getActiveLaneAnnotation()

		if (!activeLane) {
			log.info('No lane annotation is active.')
			return
		}

		// get clicked object
		const mouse = mousePositionToGLSpace(event, this.props.rendererSize!)

		this.raycasterAnnotation.setFromCamera(mouse, this.props.camera!)

		const intersects = this.raycasterAnnotation.intersectObjects(this.annotationObjects, true)

		if (intersects.length === 0)
			return

		const object = intersects[0].object.parent
		// check if clicked object is an inactive lane
		const inactive = this.checkForInactiveAnnotation(object as THREE.Object3D)

		if (!(inactive && inactive instanceof Lane)) {
			log.warn(`Clicked object is not an inactive lane.`)
			return
		}

		// Check if relation already exist.
		// In the case this already exist, the relation is removed
		if (activeLane.deleteNeighbor(inactive.uuid)) {
			if (inactive.deleteNeighbor(activeLane.uuid)) {
				inactive.makeInactive()
				this.props.channel.emit(Events.SCENE_SHOULD_RENDER)
			} else {
				log.error('Non-reciprocal neighbor relation detected. This should never happen.')
			}

			return
		}

		// Check if the neighbor must be added to the front
		if (this.props.isConnectFrontNeighborMode) {
			activeLane.addNeighbor(inactive.uuid, NeighborLocation.FRONT)
			inactive.setNeighborMode(NeighborLocation.FRONT)
			inactive.addNeighbor(activeLane.uuid, NeighborLocation.BACK)

			this.props.channel.emit('deactivateFrontSideNeighbours')
			this.props.channel.emit(Events.SCENE_SHOULD_RENDER)

			return
		}

		// otherwise, compute direction of the two lanes
		const threshold = 4 // meters

		let {index1: index11, index2: index21}: {index1: number, index2: number} =
			getClosestPoints(activeLane.waypoints, inactive.waypoints, threshold)

		if (index11 < 0 || index21 < 0) {
			log.warn(`Clicked objects do not have a common segment.`)
			return
		}

		// find active lane direction
		let index12 = index11 + 1

		if (index12 >= activeLane.waypoints.length) {
			index12 = index11
			index11 = index11 - 1
		}

		const pt1: THREE.Vector3 = activeLane.waypoints[index12].clone()

		pt1.sub(activeLane.waypoints[index11])

		// find inactive lane direction
		let index22 = index21 + 1

		if (index22 >= inactive.waypoints.length) {
			index22 = index21
			index21 = index21 - 1
		}

		const pt2: THREE.Vector3 = inactive.waypoints[index22].clone()

		pt2.sub(inactive.waypoints[index21])

		// add neighbor based on lane direction and selected side
		const sameDirection: boolean = Math.abs(pt1.angleTo(pt2)) < (Math.PI / 2)

		if (this.props.isConnectLeftNeighborMode) {
			activeLane.addNeighbor(inactive.uuid, NeighborLocation.LEFT)
			inactive.setNeighborMode(NeighborLocation.LEFT)

			this.props.channel.emit('deactivateLeftSideNeighbours')

			if (sameDirection)
				inactive.addNeighbor(activeLane.uuid, NeighborLocation.RIGHT)
			else
				inactive.addNeighbor(activeLane.uuid, NeighborLocation.LEFT)
		} else {
			activeLane.addNeighbor(inactive.uuid, NeighborLocation.RIGHT)
			inactive.setNeighborMode(NeighborLocation.RIGHT)

			this.props.channel.emit('deactivateRightSideNeighbours')

			if (sameDirection)
				inactive.addNeighbor(activeLane.uuid, NeighborLocation.LEFT)
			else
				inactive.addNeighbor(activeLane.uuid, NeighborLocation.RIGHT)
		}

		this.props.channel.emit(Events.SCENE_SHOULD_RENDER)
	}

	/**
	 * Check if we clicked an annotation. If so, make it active for editing
	 */
	checkForAnnotationSelection = (event: MouseEvent): void => {
		const {
			isLiveMode, isMouseDragging, isControlKeyPressed, isAddMarkerMode, isAddConnectionMode,
			isConnectLeftNeighborMode, isConnectRightNeighborMode, isConnectFrontNeighborMode,
			isAddConflictOrDeviceMode, isJoinAnnotationMode,
		} = this.props

		if (
			isLiveMode || isMouseDragging || isControlKeyPressed || isAddMarkerMode || isAddConnectionMode ||
			isConnectLeftNeighborMode || isConnectRightNeighborMode || isConnectFrontNeighborMode ||
			isAddConflictOrDeviceMode || isJoinAnnotationMode
		)
			return

		const mouse = mousePositionToGLSpace(event, this.props.rendererSize!)

		this.raycasterAnnotation.setFromCamera(mouse, this.props.camera!)

		const intersects = this.raycasterAnnotation.intersectObjects(this.annotationObjects, true)

		if (intersects.length === 0) return

		const object = intersects[0].object.parent
		const inactive = this.checkForInactiveAnnotation(object as THREE.Object3D)

		// We clicked an inactive annotation, make it active
		if (!inactive) return

		if (this.isAnnotationLocked(inactive)) return

		this.cleanTransformControls()

		this.props.channel.emit('deactivateAllAnnotationPropertiesMenus', inactive.annotationType)

		this.setActiveAnnotation(inactive)

		this.props.channel.emit('resetAllAnnotationPropertiesMenuElements')

		this.props.channel.emit(Events.SCENE_SHOULD_RENDER)
	}

	/**
	 * Check if the mouse is on top of an editable lane marker. If so, attach the
	 * marker to the transform control for editing.
	 */
	checkForActiveMarker = (event: MouseEvent): void => {
		// If the mouse is down we might be dragging a marker so avoid
		// picking another marker
		if (
			this.props.isMouseDown ||
			this.props.isControlKeyPressed ||
			this.props.isAddMarkerMode ||
			this.props.isAddConnectionMode ||
			this.props.isConnectLeftNeighborMode ||
			this.props.isConnectRightNeighborMode ||
			this.props.isConnectFrontNeighborMode ||
			this.props.isAddConflictOrDeviceMode ||
			this.props.isJoinAnnotationMode
		)
			return

		const markers = this.activeMarkers()

		if (!markers) return

		const mouse = mousePositionToGLSpace(event, this.props.rendererSize!)

		this.raycasterMarker.setFromCamera(mouse, this.props.camera!)

		const intersects = this.raycasterMarker.intersectObjects(markers)

		if (intersects.length > 0) {
			const marker = intersects[0].object as THREE.Mesh

			if (this.hovered !== marker) {
				this.cleanTransformControls()

				let moveableMarkers: Array<THREE.Mesh>

				if (this.props.numberKeyPressed === null) {
					moveableMarkers = [marker]
				} else {
					// special case: 0 searches for all neighbors, so set distance to infinity
					const distance = this.props.numberKeyPressed || Number.POSITIVE_INFINITY
					const neighbors = this.neighboringMarkers(marker, distance)

					this.highlightMarkers(neighbors)
					neighbors.unshift(marker)
					moveableMarkers = neighbors
				}

				// HOVER ON
				this.hovered = marker
				this.cancelHideTransform()
				new AnnotatedSceneActions().isHoveringOnMarker(true)
				new AnnotatedSceneActions().setTransformedObjects(moveableMarkers)
			}
		} else {
			if (this.hovered !== null) {
				// HOVER OFF
				this.hovered = null
				this.delayHideTransform()
				new AnnotatedSceneActions().isHoveringOnMarker(false)
			}
		}
	}

	/**
	 * Check if we clicked a connection or device while pressing the add conflict/device key
	 */
	checkForConflictOrDeviceSelection = (event: MouseEvent): void => {
		const {isLiveMode, isMouseDragging, isAddConflictOrDeviceMode} = this.props

		if (isLiveMode || isMouseDragging || !isAddConflictOrDeviceMode)
			return

		log.info('checking for conflict selection')

		const srcAnnotation = this.getActiveConnectionAnnotation()

		if (!srcAnnotation) return

		const mouse = mousePositionToGLSpace(event, this.props.rendererSize!)

		this.raycasterAnnotation.setFromCamera(mouse, this.props.camera!)

		const intersects = this.raycasterAnnotation.intersectObjects(this.annotationObjects, true)

		if (intersects.length === 0) return

		const object = intersects[0].object.parent
		const dstAnnotation = this.checkForInactiveAnnotation(object as THREE.Object3D)

		if (!dstAnnotation) return

		// If we clicked a connection, add it to the set of conflicting connections
		if (dstAnnotation !== srcAnnotation && dstAnnotation instanceof Connection) {
			const wasAdded = srcAnnotation.toggleConflictingConnection(dstAnnotation.uuid)

			if (wasAdded) {
				log.info('added conflict')
				dstAnnotation.setConflictMode()
			} else {
				log.info('removed conflict')
				dstAnnotation.makeInactive()
			}

			this.props.channel.emit(Events.SCENE_SHOULD_RENDER)

		// If we clicked a traffic device, add it or remove it from the connection's set of associated devices.
		} else if (dstAnnotation instanceof TrafficDevice) {
			const wasAdded = srcAnnotation.toggleAssociatedDevice(dstAnnotation.uuid)

			if (wasAdded) {
				log.info('added traffic device')
				dstAnnotation.setAssociatedMode(srcAnnotation.waypoints[0])

				// Attempt to align the traffic device with the lane that leads to it.
				if (!dstAnnotation.orientationIsSet()) {
					const inboundLane = this.laneAnnotations.find(l => l.uuid === srcAnnotation.startLaneUuid)

					if (inboundLane) {
						const laneTrajectory = inboundLane.finalTrajectory()

						if (laneTrajectory) {
							// Look at a distant point which will leave the traffic device's face roughly perpendicular to the lane.
							const aPointBackOnTheHorizon = laneTrajectory.at(-1000)

							dstAnnotation.lookAt(aPointBackOnTheHorizon)
						}
					}
				}
			} else {
				log.info('removed traffic device')
				dstAnnotation.makeInactive()
			}

			this.props.channel.emit(Events.SCENE_SHOULD_RENDER)
		}
	}

	/**
	 * If the mouse was clicked while pressing the "j" key, then join active
	 * annotation with the clicked one, if they are of the same type
	 */
	joinAnnotationsEventHandler = (event: MouseEvent): void => {
		if (this.props.isMouseDragging || !this.props.isJoinAnnotationMode) return

		// get active annotation
		const activeAnnotation = this.activeAnnotation

		if (!activeAnnotation) {
			log.info('No annotation is active.')
			return
		}

		// get clicked object
		const mouse = mousePositionToGLSpace(event, this.props.rendererSize!)

		this.raycasterAnnotation.setFromCamera(mouse, this.props.camera!)

		const intersects = this.raycasterAnnotation.intersectObjects(this.annotationObjects, true)

		if (intersects.length === 0)
			return

		const object = intersects[0].object.parent
		const inactiveAnnotation = this.checkForInactiveAnnotation(object as THREE.Object3D)

		if (!inactiveAnnotation) {
			log.info('No clicked annotation.')
			return
		}

		// determine order based on distances between end points: active --> inactive lane or inactive --> active lane
		const inactiveToActive = inactiveAnnotation.markers[inactiveAnnotation.markers.length - 1].position
			.distanceTo(activeAnnotation.markers[0].position)
		const activeToInactive = activeAnnotation.markers[activeAnnotation.markers.length - 1].position
			.distanceTo(inactiveAnnotation.markers[0].position)

		let annotation1 = activeAnnotation
		let annotation2 = inactiveAnnotation

		if (activeToInactive > inactiveToActive) {
			annotation1 = inactiveAnnotation
			annotation2 = activeAnnotation
		}

		// join annotations
		if (!this.joinAnnotations(annotation1, annotation2)) return

		// update UI panel
		this.props.channel.emit('resetAllAnnotationPropertiesMenuElements')
	}

	isAnnotationLocked(annotation: Annotation): boolean {
		if (this.props.lockLanes && (annotation instanceof Lane || annotation instanceof Connection))
			return true
		else if (this.props.lockBoundaries && annotation instanceof Boundary)
			return true
		else if (this.props.lockTerritories && annotation instanceof Territory)
			return true
		else if (this.props.lockTrafficDevices && annotation instanceof TrafficDevice)
			return true
		return false
	}

	delayHideTransform = (): void => this.props.sceneManager.delayHideTransform()
	hideTransform = (): void => this.props.sceneManager.hideTransform()
	cancelHideTransform = (): void => this.props.sceneManager.cancelHideTransform()
	cleanTransformControls = (): void => {
		this.props.sceneManager.cleanTransformControls()
		this.unhighlightMarkers()
	}

	/**
	 * Draw all markers at normal size.
	 */
	unhighlightMarkers(): void {
		if (this.activeAnnotation) this.activeAnnotation.unhighlightMarkers()

		this.props.channel.emit(Events.SCENE_SHOULD_RENDER)
	}

	toggleTransformControlsRotationMode(): void {
		// TODO JOE toggle mode only if object is rotatable
		// if (!( this.activeAnnotation && this.activeAnnotation.isRotatable) ) return

		new AnnotatedSceneActions().toggleRotationModeActive()
	}
}
/**
 * This tracks transient metadata for the data model, for the duration of a user session.
 */
export class AnnotationState {
	private annotationManager: AnnotationManager
	private isDirty: boolean
	private autoSaveEnabled: boolean
	private autoSaveDirectory: string

	constructor(annotationManager: AnnotationManager) {
		const self = this

		this.annotationManager = annotationManager
		this.isDirty = false
		this.autoSaveEnabled = false
		this.autoSaveDirectory = config['output.annotations.autosave.directory.path']

		const autoSaveEventInterval = config['output.annotations.autosave.interval.seconds'] * 1000

		if (this.annotationManager && this.autoSaveDirectory && autoSaveEventInterval) {
			setInterval((): void => {
				if (self.doPeriodicSave()) self.saveAnnotations().then()
			}, autoSaveEventInterval)
		}
	}

	// Mark dirty if the in-memory model has information which is not recorded on disk.
	dirty(): void {
		this.isDirty = true
	}

	// Mark clean if the in-memory model is current with a saved file. Auto-saves don't count.
	clean(): void {
		this.isDirty = false
	}

	enableAutoSave(): void {
		this.autoSaveEnabled = true
	}

	disableAutoSave(): void {
		this.autoSaveEnabled = false
	}

	immediateAutoSave(): Promise<void> {
		if (this.doImmediateSave())
			return this.saveAnnotations()
		else
			return Promise.resolve()
	}

	private doPeriodicSave(): boolean {
		return this.autoSaveEnabled &&
			this.isDirty &&
			!!this.annotationManager.allAnnotations()
	}

	private doImmediateSave(): boolean {
		return this.isDirty &&
			!!this.annotationManager.allAnnotations()
	}

	private saveAnnotations(): Promise<void> {
		const savePath = this.autoSaveDirectory + '/' + dateToString(new Date()) + '.json'

		log.info('auto-saving annotations to: ' + savePath)
		return this.annotationManager.saveAnnotationsToFile(savePath, OutputFormat.UTM)
			.catch(error => log.warn('save annotations failed: ' + error.message))
	}
}

/**
 * Get point in between at a specific distance
 */
function getMarkerInBetween(marker1: THREE.Vector3, marker2: THREE.Vector3, atDistance: number): THREE.Vector3 {
	return marker2.clone().sub(marker1).multiplyScalar(atDistance).add(marker1)
}
