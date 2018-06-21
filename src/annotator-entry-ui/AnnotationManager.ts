/**
 *  Copyright 2017 Mapper Inc. Part of the mapper-annotator project.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import config from '@/config'
import {dateToString} from "@/util/dateToString"
import * as Electron from 'electron'
import * as lodash from 'lodash'
import {isNullOrUndefined} from "util"
import * as THREE from 'three'
import {AnnotationType} from "./annotations/AnnotationType"
import {AnnotationConstructResult} from "./annotations/AnnotationConstructResult"
import {currentAnnotationFileVersion, toCurrentAnnotationVersion} from "./annotations/SerializedVersion"
import {
	Annotation, AnnotationId, AnnotationJsonInputInterface,
	AnnotationJsonOutputInterface, AnnotationUuid, LlaJson, UtmJson
} from './annotations/AnnotationBase'
import {
	Lane, NeighborDirection, NeighborLocation, LaneNeighborsIds
} from './annotations/Lane'
import * as AnnotationFactory from "./annotations/AnnotationFactory"
import {TrafficDevice} from 'annotator-entry-ui/annotations/TrafficDevice'
import {Territory} from "./annotations/Territory"
import {Connection} from 'annotator-entry-ui/annotations/Connection'
import {Boundary} from 'annotator-entry-ui/annotations/Boundary'
import {SimpleKML} from '../util/KmlUtils'
import * as EM from 'annotator-entry-ui/ErrorMessages'
import * as AsyncFile from 'async-file'
import * as mkdirp from 'mkdirp'
import {UtmCoordinateSystem} from "./UtmCoordinateSystem"
import * as CRS from "./CoordinateReferenceSystem"
import Logger from "@/util/log"
import {tileIndexFromVector3} from "@/annotator-entry-ui/model/TileIndex"
import {ScaleProvider} from "@/annotator-entry-ui/tile/ScaleProvider"

const log = Logger(__filename)

const dialog = Electron.remote.dialog

// tslint:disable:no-string-literal

export enum LinkType {
	FORWARD = 1,
	SIDE = 2,
	OTHER = 3
}

export class Link {
	index: number
	type: LinkType

	constructor() {
		this.index = -1
		this.type = LinkType.OTHER
	}
}

export enum OutputFormat {
	UTM = 1,
	LLA = 2,
}

/**
 * Get point in between at a specific distance
 */
function getMarkerInBetween(marker1: THREE.Vector3, marker2: THREE.Vector3, atDistance: number): THREE.Vector3 {
	return marker2.clone().sub(marker1).multiplyScalar(atDistance).add(marker1)
}

export interface AnnotationManagerJsonOutputInterface {
	version: number
	created: string
	coordinateReferenceSystem: CRS.CoordinateReferenceSystem
	annotations: Array<AnnotationJsonOutputInterface>
}

/**
 * The AnnotationManager is in charge of maintaining a set of annotations and all operations
 * to modify, add or delete them. It also keeps an index to the "active" annotation as well
 * as its markers. The "active" annotation is the only one that can be modified.
 */
export class AnnotationManager {
	laneAnnotations: Array<Lane>
	boundaryAnnotations: Array<Boundary>
	trafficDeviceAnnotations: Array<TrafficDevice>
	territoryAnnotations: Array<Territory>
	connectionAnnotations: Array<Connection>
	annotationObjects: Array<THREE.Object3D>
	activeAnnotation: Annotation | null
	bezierScaleFactor: number  // Used when creating connections
	private carPath: Array<AnnotationUuid>
	private carPathActivation: boolean
	private metadataState: AnnotationState

	constructor(
		private readonly isInteractiveMode: boolean, // Interactive allows annotations to be selected and edited; otherwise they can only be added or removed.
		private readonly scaleProvider: ScaleProvider,
		private readonly utmCoordinateSystem: UtmCoordinateSystem,
		private onAddAnnotation: (object: THREE.Object3D) => void,
		private onRemoveAnnotation: (object: THREE.Object3D) => void,
		private onChangeActiveAnnotation: (active: Annotation) => void
	) {
		this.laneAnnotations = []
		this.boundaryAnnotations = []
		this.trafficDeviceAnnotations = []
		this.territoryAnnotations = []
		this.connectionAnnotations = []
		this.annotationObjects = []
		this.activeAnnotation = null
		this.carPath = []
		this.carPathActivation = false
		this.metadataState = new AnnotationState(this)
		this.bezierScaleFactor = 6
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

	getValidIds(): Array<AnnotationId> {
		return this.allAnnotations().map(a => a.id)
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
	 * @param activate        Activate the new annotation after creation
	 * @return either an Annotation with success result code
	 *           or null with a failure result code
	 */
	createAndAddAnnotation(
		annotationType: AnnotationType,
		activate: boolean = false
	): [Annotation | null, AnnotationConstructResult] {
		const result = AnnotationManager.createAnnotationByType(annotationType)
		const annotation = result[0]
		if (annotation === null)
			return result
		else
			return this.addAnnotation(annotation, activate)
	}

	addAnnotation(
		annotation: Annotation,
		activate: boolean = false
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
		this.onAddAnnotation(annotation.renderingObject)
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
			dialog.showErrorBox(EM.ET_RELATION_ADD_FAIL, "Given lane ids are not valid.")
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
				dialog.showErrorBox(EM.ET_RELATION_ADD_FAIL, "Unknown relation to be added: " + relation)
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
				log.info("Adding back connection is not supported")
				return false
			default:
				log.warn("Unrecognized neighbor location")
				return false
		}
	}

	/**
	 * Join two annotations, if they are of the same type
	 */
	joinAnnotations (annotation1: Annotation, annotation2: Annotation): boolean {

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
		if (annotation1 instanceof Lane) {
			this.refreshLaneNeighbours(annotation1)
		}

		// delete
		this.setActiveAnnotation(annotation1)
		this.deleteAnnotation(annotation2)

		this.metadataState.dirty()
		return true
	}

	/**
	 * Refresh neighbours links for the given lane.
	 * The results of this function is that all neighbours of the current lane
	 * have the link back to this lane.
	 */
	refreshLaneNeighbours(annotation: Lane): void {

		if (!annotation.isValid())
			return

		// Front neighbours
		annotation.neighborsIds.front.forEach(NeighbourUuid => {
			let neighbour =  this.findAnnotationByUuid(NeighbourUuid)
			if (neighbour && neighbour instanceof Lane) {
				neighbour.addNeighbor(annotation.uuid, NeighborLocation.BACK)
			} else {
				log.error("Couldn't find front neighbor. This should never happen.")
			}
		})
		// Back neighbours
		annotation.neighborsIds.back.forEach(NeighbourUuid => {
			let neighbour =  this.findAnnotationByUuid(NeighbourUuid)
			if (neighbour && neighbour instanceof Lane) {
				neighbour.addNeighbor(annotation.uuid, NeighborLocation.FRONT)
			} else {
				log.error("Couldn't find back neighbor. This should never happen.")
			}
		})
		// Left neighbours
		let p1: THREE.Vector3 = annotation.waypoints[1].sub(annotation.waypoints[0])
		annotation.neighborsIds.left.forEach(NeighbourUuid => {
			let neighbour =  this.findAnnotationByUuid(NeighbourUuid)
			if (neighbour && neighbour instanceof Lane && neighbour.isValid()) {
				let p2: THREE.Vector3 = neighbour.waypoints[1].sub(neighbour.waypoints[0])
				let angle = p1.angleTo(p2)
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
			let neighbour =  this.findAnnotationByUuid(NeighbourUuid)
			if (neighbour && neighbour instanceof Lane && neighbour.isValid()) {
				let p2: THREE.Vector3 = neighbour.waypoints[1].sub(neighbour.waypoints[0])
				let angle = p1.angleTo(p2)
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
			log.info("Reverse lane failed.")
			return {result: false, existLeftNeighbour: false, existRightNeighbour: false}
		}

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

	addMarkerToActiveAnnotation(position: THREE.Vector3): boolean {
		if (!this.activeAnnotation) {
			log.info("No active annotation. Can't add marker")
			return false
		}

		if (this.activeAnnotation.addMarker(position, true)) {
			this.metadataState.dirty()
			return true
		} else {
			return false
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
		return true
	}

	/**
	 * Add current lane to the car path
	 */
	laneIndexInPath(laneUuid: AnnotationUuid): number {
		return this.carPath.findIndex((uuid) => {
			return laneUuid === uuid
		})
	}

	addLaneToPath(): boolean {
		const activeLane = this.getActiveLaneAnnotation()
		if (!activeLane) {
			return false
		}

		// Check if lane already added
		const index = this.laneIndexInPath(activeLane.uuid)
		if (index === -1) {
			this.carPath.push(activeLane.uuid)
			activeLane.setTrajectory(this.carPathActivation)
			log.info("Lane added to the car path.")
		} else {
			activeLane.setTrajectory(false)
			this.carPath.splice(index, 1)
			log.info("Lane removed from the car path.")
		}

		this.metadataState.dirty()
		return true
	}

	/**
	 * Show the car path in the visualizer
	 */
	showPath(): boolean {

		if (this.carPath.length === 0) {
			log.info("Empty car path.")
			return false
		}

		this.carPathActivation = !this.carPathActivation
		this.carPath.forEach((uuid) => {
			const index = this.laneAnnotations.findIndex((annotation) => {
				return annotation.uuid === uuid
			})
			if (index !== -1) {
				this.laneAnnotations[index].setTrajectory(this.carPathActivation)
			} else {
				log.warn("Trajectory contains invalid lane id.")
			}
		})
		return true
	}

	showAnnotations(): void {
		this.allAnnotations().forEach(a => a.makeVisible())
	}

	hideAnnotations(): void {
		this.allAnnotations().forEach(a => a.makeInvisible())
	}

	/**
	 * Gets lane index given the list of lanes and the id of the desired lane
	 * @param annotations List of annotations
	 * @param uuid        Desired id
	 * @returns Array index, or -1 if uuid not found
	 */
	getAnnotationIndexFromUuid(annotations: Array<Annotation>, uuid: AnnotationUuid): number {
		return annotations.findIndex((item) => {
			return item.uuid === uuid
		})
	}

	/**
	 * Checks if the given is within a list of given ids
	 * @param listUuids  List of ids
	 * @param queryUuid  Desired id
	 * @returns True if the id is within the list, false otherwise
	 */
	isUuidInList(listUuids: Array<AnnotationUuid>, queryUuid: AnnotationUuid): boolean {
		return listUuids.findIndex((uuid) => {
				return uuid === queryUuid
			}) !== -1
	}

	/**
	 * Tries to connect a forward lane with current lane
	 * @param neighbors   Current lane neighbors
	 * @returns Connected lane index from the list of annotations, or -1 if no connection found
	 */
	tryGoStraight(neighbors: LaneNeighborsIds): number {
		for (const neighbor of neighbors.front) {
			if (neighbor !== null &&
				this.isUuidInList(this.carPath, neighbor)) {
				return this.getAnnotationIndexFromUuid(this.laneAnnotations, neighbor)
			}
		}
		return -1
	}

	/**
	 * Tries to connect a side-forward lane with the current lane
	 * @param neighbors Current lane neighbors
	 * @returns Connected lane index from the list of annotations, or -1 if no connection found
	 */
	tryGoSides(neighbors: LaneNeighborsIds): number {

		// Try left and right neighbors of the front lane
		for (const neighbor of neighbors.front) {

			// check for valid front neighbor
			if (neighbor !== null) {

				const frontLaneIndex = this.getAnnotationIndexFromUuid(this.laneAnnotations, neighbor)
				if (frontLaneIndex === -1)
					return frontLaneIndex
				const frontLane = this.laneAnnotations[frontLaneIndex]

				for (const neighborRight of frontLane.neighborsIds.right) {
					if (this.isUuidInList(this.carPath, neighborRight)) {
						return this.getAnnotationIndexFromUuid(this.laneAnnotations, neighborRight)
					}
				}

				for (const neighborLeft of frontLane.neighborsIds.left) {
					if (this.isUuidInList(this.carPath, neighborLeft)) {
						return this.getAnnotationIndexFromUuid(this.laneAnnotations, neighborLeft)
					}
				}
			}
		}

		return -1
	}

	/**
	 * Sort car path such that each lane connects to the next in the list
	 * The list consist of lane indices from the list of annotations, for easy access
	 * @returns Sorted list of lane indices
	 */
	sortCarPath(): Array<Link> {
		const trajectoryAsOrderedLaneIndices: Array<Link> = []
		let newLink: Link = new Link()
		newLink.index = this.getAnnotationIndexFromUuid(this.laneAnnotations, this.carPath[0])
		newLink.type = LinkType.FORWARD
		trajectoryAsOrderedLaneIndices.push(newLink)
		while (newLink.index !== -1 &&
		trajectoryAsOrderedLaneIndices.length <= this.carPath.length) {

			// Try to go straight
			const neighbors = this.laneAnnotations[newLink.index].neighborsIds
			const nextFrontIndex = this.tryGoStraight(neighbors)
			if (nextFrontIndex !== -1) {
				newLink = new Link()
				newLink.index = nextFrontIndex
				newLink.type = LinkType.FORWARD
				trajectoryAsOrderedLaneIndices.push(newLink)
				continue
			}

			// Try to go sides
			const nextSideIndex = this.tryGoSides(neighbors)
			if (nextSideIndex !== -1) {
				newLink = new Link()
				newLink.index = nextSideIndex
				newLink.type = LinkType.SIDE
				trajectoryAsOrderedLaneIndices.push(newLink)
				continue
			}

			// If no valid next lane
			newLink = new Link()
			newLink.index = -1
			newLink.type = LinkType.OTHER
			trajectoryAsOrderedLaneIndices.push(newLink)
		}

		return trajectoryAsOrderedLaneIndices
	}

	/**
	 * Generate trajectory points from sorted lanes of the car path
	 * @param sortedCarPath      Trajectory sorted lanes
	 * @param minDistLaneChange  Minimum distance to interpolate lane change
	 * @returns {Array<Vector3>} Points along the trajectory
	 */
	generatePointsFromSortedCarPath(sortedCarPath: Array<Link>, minDistLaneChange: number): Array<THREE.Vector3> {

		let points: Array<THREE.Vector3> = []
		let hasValidIndexes = true
		sortedCarPath.forEach((laneLink) => {
			if (hasValidIndexes) {
				const laneIndex: number = laneLink.index
				if (laneIndex === null || laneIndex < 0 || laneIndex >= this.laneAnnotations.length) {
					dialog.showErrorBox(EM.ET_TRAJECTORY_GEN_FAIL,
						"Sorted car path contains invalid index: " + laneIndex)
					points = []
					hasValidIndexes = false
				}

				if (points.length > 0) {
					// If side link: make sure there is enough distance between first point of the link
					// and previous link last point added
					if (laneLink.type === LinkType.SIDE) {
						const firstPoint = this.laneAnnotations[laneIndex].markers[0].position.clone()
						firstPoint.add(this.laneAnnotations[laneIndex].markers[1].position).divideScalar(2)
						let distance: number = firstPoint.distanceTo(points[points.length - 1])
						while (points.length > 0 && distance < minDistLaneChange) {
							points.pop()
							distance = firstPoint.distanceTo(points[points.length - 1])
						}
					} else {
						// Delete the last point from lane since this is usually duplicated at the
						// beginning of the next lane
						points.pop()
					}
				}

				const lane: Lane = this.laneAnnotations[laneIndex]
				for (let i = 0; i < lane.markers.length - 1; i += 2) {
					const waypoint = lane.markers[i].position.clone()
					waypoint.add(lane.markers[i + 1].position).divideScalar(2)
					points.push(waypoint)
				}
			}
		})

		return points
	}

	/**
	 * Compute car trajectory by connecting all lane segments form the car path
	 * @param step  Distance between waypoints in meters
	 * @param minDistanceLaneChange Minimum distance between points when changing lane
	 * @returns Car trajectory from car path
	 */
	getFullInterpolatedTrajectory(step: number, minDistanceLaneChange: number): Array<THREE.Vector3> {

		// Check for car path size (at least one lane)
		if (this.carPath.length === 0) {
			dialog.showErrorBox(EM.ET_TRAJECTORY_GEN_FAIL, "Empty car path.")
			return []
		}

		// Sort lanes
		const sortedCarPath: Array<Link> = this.sortCarPath()
		if (sortedCarPath.length !== this.carPath.length + 1) {
			dialog.showErrorBox(EM.ET_TRAJECTORY_GEN_FAIL,
				"Annotator failed to sort car path. Possible reasons: path may have gaps.")
			return []
		}

		// Take out last index
		sortedCarPath.pop()

		// Create spline
		const points: Array<THREE.Vector3> = this.generatePointsFromSortedCarPath(sortedCarPath, minDistanceLaneChange)
		if (points.length === 0) {
			dialog.showErrorBox(EM.ET_TRAJECTORY_GEN_FAIL,
				"There are no waypoints in the selected car path lanes.")
			return []
		}
		const spline = new THREE.CatmullRomCurve3(points)
		const numPoints = spline.getLength() / step

		// Generate trajectory from spline
		return spline.getSpacedPoints(numPoints)
	}

	/**
	 * Saves car path to CSV file
	 */
	convertAnnotationToCSV(data: Array<THREE.Vector3>, columnDelimiter: string = ',', lineDelimiter: string = '\n'): string {
		if (data.length === 0) {
			log.warn("Empty annotation.")
			return ''
		}

		let result: string = ''
		data.forEach((marker) => {
			const lngLatAlt = this.utmCoordinateSystem.threeJsToLngLatAlt(marker)
			result += lngLatAlt.x.toString()
			result += columnDelimiter
			result += lngLatAlt.y.toString()
			result += lineDelimiter
		})

		return result
	}

	saveCarPath(fileName: string): void {
		const self = this
		const dirName = fileName.substring(0, fileName.lastIndexOf("/"))
		const writeFile = function (er: Error): void {
			if (!er) {
				const trajectoryData = self.getFullInterpolatedTrajectory(0.2, 5)
				// Debug only
				// self.annotations[0].tryTrajectory(trajectoryData)
				const strAnnotations = self.convertAnnotationToCSV(trajectoryData)
				AsyncFile.writeTextFile(fileName, strAnnotations)
					.catch((err: Error) => log.warn('saveCarPath failed: ' + err.message))
			}
		}
		mkdirp(dirName, writeFile)
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
	setActiveAnnotation(changeTo: Annotation | null): boolean {
		if (!changeTo) return false

		if (!this.isInteractiveMode) {
			log.warn("setActiveAnnotation() is allowed only in interactive mode")
			return false
		}

		// Trying to activate the currently active annotation, there is nothing to do
		if (this.activeAnnotation && this.activeAnnotation.uuid === changeTo.uuid) {
			return false
		}

		// Deactivate current active annotation
		this.unsetActiveAnnotation()

		// Set new active annotation
		this.activeAnnotation = changeTo
		this.activeAnnotation.makeActive()

		// If the new active annotation is a connection, change the rendering of it's conflicting connections
		if (this.activeAnnotation instanceof Connection) {
			const activeConnection = this.activeAnnotation as Connection
			activeConnection.conflictingConnections.forEach( (id: AnnotationUuid) => {
				const connection = this.connectionAnnotations.find( a => a.uuid === id)
				if (!isNullOrUndefined(connection)) {
					connection.setConflictMode()
				} else {
					log.warn("Conflicting connection doesn't exist")
				}
			})
			activeConnection.associatedTrafficDevices.forEach( (id: AnnotationUuid) => {
				const device = this.trafficDeviceAnnotations.find( a => a.uuid === id)
				if (!isNullOrUndefined(device)) {
					device.setAssociatedMode(activeConnection.waypoints[0])
				} else {
					log.warn("Associated traffic device doesn't exist")
				}
			})
		} else if (this.activeAnnotation instanceof Lane) {
			this.activeAnnotation.neighborsIds.left.forEach((id: AnnotationUuid) => {
				const neighbor = this.laneAnnotations.find(a => a.uuid === id)
				if (!isNullOrUndefined(neighbor)) {
					neighbor.setNeighborMode(NeighborLocation.LEFT)
				}
			})
			this.activeAnnotation.neighborsIds.right.forEach((id: AnnotationUuid) => {
				const neighbor = this.laneAnnotations.find(a => a.uuid === id)
				if (!isNullOrUndefined(neighbor)) {
					neighbor.setNeighborMode(NeighborLocation.RIGHT)
				}
			})
			this.activeAnnotation.neighborsIds.front.forEach((id: AnnotationUuid) => {
				const neighbor = this.laneAnnotations.find(a => a.uuid === id)
				if (!isNullOrUndefined(neighbor)) {
					neighbor.setNeighborMode(NeighborLocation.FRONT)
				}
			})
		}

		this.onChangeActiveAnnotation(this.activeAnnotation)
		return true
	}

	// Make no annotations active.
	unsetActiveAnnotation(): boolean {
		if (this.activeAnnotation) {
			// If the active annotation was a connection make sure its conflicting connections appearance is set back
			// to inactive mode. In the future this behavior should happen inside the makeInactive function
			// but at this moment we don't have access to other annotations inside an annotation.
			if (this.activeAnnotation instanceof Connection) {
				this.activeAnnotation.conflictingConnections.forEach( (id: AnnotationUuid) => {
					const connection = this.connectionAnnotations.find( a => a.uuid === id)
					if (!isNullOrUndefined(connection)) {
						connection.makeInactive()
					} else {
						log.warn("Conflicting connection doesn't exist")
					}
				})
				this.activeAnnotation.associatedTrafficDevices.forEach( (id: AnnotationUuid) => {
					const device = this.trafficDeviceAnnotations.find( a => a.uuid === id)
					if (!isNullOrUndefined(device)) {
						device.makeInactive()
					} else {
						log.warn("Associated traffic device doesn't exist")
					}
				})
			} else if (this.activeAnnotation instanceof  Lane) {
				// If the active annotation was a lane make sure its neighbors appearance is set back to inactive mode.
				this.activeAnnotation.neighborsIds.left.forEach((id: AnnotationUuid) => {
					const neighbor = this.laneAnnotations.find(a => a.uuid === id)
					if (!isNullOrUndefined(neighbor)) {
						neighbor.makeInactive()
					}
				})
				this.activeAnnotation.neighborsIds.right.forEach((id: AnnotationUuid) => {
					const neighbor = this.laneAnnotations.find(a => a.uuid === id)
					if (!isNullOrUndefined(neighbor)) {
						neighbor.makeInactive()
					}
				})
				this.activeAnnotation.neighborsIds.front.forEach((id: AnnotationUuid) => {
					const neighbor = this.laneAnnotations.find(a => a.uuid === id)
					if (!isNullOrUndefined(neighbor)) {
						neighbor.makeInactive()
					}
				})
			}

			this.activeAnnotation.makeInactive()
			this.activeAnnotation = null

			return true
		} else {
			return false
		}
	}

	/**
	 * Update the mesh of the active annotation. This is used if the lane marker positions
	 * where changed externally (e.g. by the transform controls)
	 */
	updateActiveAnnotationMesh = (): void => {
		if (!this.activeAnnotation) {
			log.info("No active annotation. Can't update mesh")
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
	 * Draw all markers at normal size.
	 */
	unhighlightMarkers(): void {
		if (this.activeAnnotation)
			this.activeAnnotation.unhighlightMarkers()
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

		if (!this.utmCoordinateSystem.hasOrigin && !config.get('output.annotations.debug.allow_annotations_without_utm_origin'))
			return Promise.reject(Error('failed to save annotations: UTM origin is not set'))

		const self = this
		const dirName = fileName.substring(0, fileName.lastIndexOf("/"))
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

		if (!this.utmCoordinateSystem.hasOrigin && !config.get('output.annotations.debug.allow_annotations_without_utm_origin'))
			return Promise.reject(Error('failed to save annotations: UTM origin is not set'))

		if (format !== OutputFormat.UTM)
			return Promise.reject(Error('exportAnnotationsTiles() is implemented only for UTM'))

		mkdirp.sync(directory)

		// Repeat the entire annotation record in each tile that is intersected by the annotation.
		// TODO For now the intersection algorithm only checks the markers (vertices) of the annotation
		// TODO   geometry. It might be nice to interpolate between markers to find all intersections.
		const groups: Map<string, Set<Annotation>> = new Map()
		annotations.forEach(annotation => {
			annotation.markers.forEach(marker => {
				const utmPosition = this.utmCoordinateSystem.threeJsToUtm(marker.position)
				const key = tileIndexFromVector3(this.scaleProvider.utmTileScale, utmPosition).toString('_')
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
			.then(() => {return})
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
					datum: this.utmCoordinateSystem.datum,
					parameters: {
						utmZoneNumber: this.utmCoordinateSystem.utmZoneNumber,
						utmZoneNorthernHemisphere: this.utmCoordinateSystem.utmZoneNorthernHemisphere,
					}
				} as CRS.UtmCrs
			case OutputFormat.LLA:
				return {
					coordinateSystem: 'LLA',
					datum: this.utmCoordinateSystem.datum,
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
					lane.waypoints.map(p => this.utmCoordinateSystem.threeJsToLngLatAlt(p))
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
		if (!data['annotations'])
			return []

		if (!this.checkCoordinateSystem(data)) {
			const params = data['coordinateReferenceSystem']['parameters']
			const zoneId = `${params['utmZoneNumber']}${params['utmZoneNorthernHemisphere']}`
			throw Error(`UTM Zone for new annotations (${zoneId}) does not match existing zone in ${this.utmCoordinateSystem}`)
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
					log.error("Non-reciprocal neighbor relation detected. This should never happen.")
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
					log.error("Non-reciprocal neighbor relation detected. This should never happen.")
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

		if (modifications)
			this.metadataState.dirty()
	}

	/**
	 * Create a new lane connection between given lanes using a cubic Bezier curve
	 * This is the new implementation of former "addConnection" function.
	 */
	private addConnectionWithBezier(laneFrom: Lane, laneTo: Lane): void {

		if (laneFrom.markers.length < 4 || laneTo.markers.length < 4) {
			dialog.showErrorBox(EM.ET_RELATION_ADD_FAIL, "Unable to generate forward relation." +
				"Possible reasons: one of the two lanes connected does not have at least 4 markers.")
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

		let lcp1 = new THREE.Vector3()
		let lcp2 = new THREE.Vector3()
		lcp1.subVectors(lp1, lp0).normalize().multiplyScalar(this.bezierScaleFactor).add(lp1)
		lcp2.subVectors(lp2, lp3).normalize().multiplyScalar(this.bezierScaleFactor).add(lp2)
		let rcp1 = new THREE.Vector3()
		let rcp2 = new THREE.Vector3()
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
		this.onAddAnnotation(connection.renderingObject)

		connection.makeInactive()
		connection.updateVisualization()
		this.metadataState.dirty()
	}

	/**
	 * Delete an annotation and tear down references to it.
	 */
	deleteAnnotation(annotation: Annotation): boolean {
		// Get data structures appropriate to the type.
		const similarAnnotations = this.annotationTypeToSimilarAnnotationsList(annotation.annotationType)
		if (!similarAnnotations)
			return false

		// Side effect: remove references to this annotation from its neighbors
		if (annotation instanceof Lane) {
			this.deleteConnectionToNeighbors(annotation)
			// Remove lane from path
			const index = this.laneIndexInPath(annotation.uuid)
			if (index !== -1) {
				this.laneAnnotations[index].setTrajectory(false)
				this.carPath.splice(index, 1)
				log.info("Lane removed from the car path.")
			}
		} else if (annotation instanceof Connection) {
			this.removeUuidFromLaneNeighbors(annotation.startLaneUuid, annotation.uuid)
			this.removeUuidFromLaneNeighbors(annotation.endLaneUuid, annotation.uuid)
		}

		// Set state.
		const eraseIndex = this.getAnnotationIndexFromUuid(similarAnnotations, annotation.uuid)
		similarAnnotations.splice(eraseIndex, 1)
		this.removeRenderingObjectFromArray(this.annotationObjects, annotation.renderingObject)
		this.onRemoveAnnotation(annotation.renderingObject)

		return true
	}

	private threeJsToUtmJsonObject(): (p: THREE.Vector3) => UtmJson {
		const self = this
		return function (p: THREE.Vector3): UtmJson {
			const utm = self.utmCoordinateSystem.threeJsToUtm(p)
			return {'E': utm.x, 'N': utm.y, 'alt': utm.z}
		}
	}

	private threeJsToLlaJsonObject(): (p: THREE.Vector3) => LlaJson {
		const self = this
		return function (p: THREE.Vector3): LlaJson {
			const lngLatAlt = self.utmCoordinateSystem.threeJsToLngLatAlt(p)
			return {'lng': lngLatAlt.x, 'lat': lngLatAlt.y, 'alt': lngLatAlt.z}
		}
	}

	/**
	 * This expects the serialized UtmCrs structure produced by toJSON().
	 */
	private checkCoordinateSystem(data: Object): boolean {
		const crs = data['coordinateReferenceSystem']
		if (crs['coordinateSystem'] !== 'UTM') return false
		if (crs['datum'] !== this.utmCoordinateSystem.datum) return false
		if (isNullOrUndefined(crs['parameters']['utmZoneNumber']))
			return false
		const num = crs['parameters']['utmZoneNumber']
		if (isNullOrUndefined(crs['parameters']['utmZoneNorthernHemisphere']))
			return false
		const northernHemisphere = !!crs['parameters']['utmZoneNorthernHemisphere']

		if (!data['annotations'])
			return !this.utmCoordinateSystem.hasOrigin || this.utmCoordinateSystem.zoneMatch(num, northernHemisphere)

		// generate an arbitrary offset for internal use, given the first point in the data set
		let first: THREE.Vector3 | null = null
		// and round off the values for nicer debug output
		const trunc = function (x: number): number {return Math.trunc(x / 10) * 10}
		for (let i = 0; !first && i < data['annotations'].length; i++) {
			const annotation = data['annotations'][i]
			if (annotation['markers'] && annotation['markers'].length > 0) {
				const pos = annotation['markers'][0] as UtmJson
				first = new THREE.Vector3(trunc(pos['E']), trunc(pos['N']), trunc(pos['alt']))
			}
		}
		if (!first)
			return !this.utmCoordinateSystem.hasOrigin || this.utmCoordinateSystem.zoneMatch(num, northernHemisphere)

		return this.utmCoordinateSystem.setOrigin(num, northernHemisphere, first) ||
			this.utmCoordinateSystem.zoneMatch(num, northernHemisphere)
	}

	/**
	 * Convert markers from UTM objects to vectors in local coordinates, for downstream consumption.
	 */
	private convertCoordinates(data: Object): void {
		data['annotations'].forEach((annotation: {}) => {
			if (annotation['markers']) {
				for (let i = 0; i < annotation['markers'].length; i++) {
					const pos = annotation['markers'][i] as UtmJson
					annotation['markers'][i] = this.utmCoordinateSystem.utmToThreeJs(pos['E'], pos['N'], pos['alt'])
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

	private removeUuidFromArray( uuidArray: Array<AnnotationUuid>, uuidToRemove: AnnotationUuid): boolean {
		const index = uuidArray.findIndex( (element) => {
			return element === uuidToRemove
		})

		if (index < 0) {
			return false
		}

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
		if (this.removeUuidFromArray(lane.neighborsIds.back, uuidToRemove)) {
			return true
		}

		if (this.removeUuidFromArray(lane.neighborsIds.front, uuidToRemove)) {
			return true
		}

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
		this.autoSaveDirectory = config.get('output.annotations.autosave.directory.path')
		const autoSaveEventInterval = config.get('output.annotations.autosave.interval.seconds') * 1000
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
		return this.autoSaveEnabled
			&& this.isDirty
			&& !!this.annotationManager.allAnnotations()
	}

	private doImmediateSave(): boolean {
		return this.isDirty
			&& !!this.annotationManager.allAnnotations()
	}

	private saveAnnotations(): Promise<void> {
		const savePath = this.autoSaveDirectory + '/' + dateToString(new Date()) + '.json'
		log.info("auto-saving annotations to: " + savePath)
		return this.annotationManager.saveAnnotationsToFile(savePath, OutputFormat.UTM)
			.catch(error => log.warn('save annotations failed: ' + error.message))
	}
}
