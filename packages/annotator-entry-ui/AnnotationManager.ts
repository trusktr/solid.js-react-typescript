/**
 *  Copyright 2017 Mapper Inc. Part of the mapper-annotator project.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

const config = require('../config')
const vsprintf = require("sprintf-js").vsprintf
import * as lodash from 'lodash'
import {isNullOrUndefined} from "util"
import * as THREE from 'three'
import {AnnotationType} from "./annotations/AnnotationType"
import {currentAnnotationFileVersion, toCurrentAnnotationVersion} from "./annotations/SerializedVersion"
import {
	Annotation, AnnotationId, AnnotationJsonInputInterface,
	AnnotationJsonOutputInterface, AnnotationUuid, LlaJson, UtmJson
} from 'annotator-entry-ui/annotations/AnnotationBase'
import {
	Lane, NeighborDirection, NeighborLocation, LaneNeighborsIds
} from 'annotator-entry-ui/annotations/Lane'
import * as AnnotationFactory from "./annotations/AnnotationFactory"
import {TrafficSign} from 'annotator-entry-ui/annotations/TrafficSign'
import {Territory} from "./annotations/Territory"
import {Connection} from 'annotator-entry-ui/annotations/Connection'
import {Boundary} from 'annotator-entry-ui/annotations/Boundary'
import {SimpleKML} from 'annotator-entry-ui/KmlUtils'
import * as EM from 'annotator-entry-ui/ErrorMessages'
import * as TypeLogger from 'typelogger'
import * as AsyncFile from 'async-file'
import * as mkdirp from 'mkdirp'
import {UtmInterface} from "./UtmInterface"
import * as CRS from "./CoordinateReferenceSystem"

// tslint:disable-next-line:no-any
TypeLogger.setLoggerOutput(console as any)
const log = TypeLogger.getLogger(__filename)
const {dialog} = require('electron').remote

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
export class AnnotationManager extends UtmInterface {
	private datum: string = 'WGS84'
	private scene: THREE.Scene // where objects are placed on behalf of Annotator
	laneAnnotations: Array<Lane>
	boundaryAnnotations: Array<Boundary>
	trafficSignAnnotations: Array<TrafficSign>
	territoryAnnotations: Array<Territory>
	connectionAnnotations: Array<Connection>
	annotationObjects: Array<THREE.Object3D>
	activeAnnotation: Annotation | null
	bezierScaleFactor: number  // Used when creating connections
	private carPath: Array<AnnotationUuid>
	private carPathActivation: boolean
	private metadataState: AnnotationState
	private isLiveMode: boolean

	constructor(scene: THREE.Scene) {
		super()
		this.scene = scene
		this.laneAnnotations = []
		this.boundaryAnnotations = []
		this.trafficSignAnnotations = []
		this.territoryAnnotations = []
		this.connectionAnnotations = []
		this.annotationObjects = []
		this.activeAnnotation = null
		this.carPath = []
		this.carPathActivation = false
		this.metadataState = new AnnotationState(this)
		this.isLiveMode = false
		this.bezierScaleFactor = 6
	}

	toString(): string {
		let offsetStr
		if (this.offset === undefined) {
			offsetStr = 'undefined'
		} else {
			offsetStr = this.offset.x + ',' + this.offset.y + ',' + this.offset.z
		}
		return 'AnnotationManager(UTM Zone: ' + this.utmZoneNumber + this.utmZoneNorthernHemisphere + ', offset: [' + offsetStr + '])'
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

	getActiveTrafficSignAnnotation(): TrafficSign | null {
		if (this.activeAnnotation && this.activeAnnotation instanceof TrafficSign)
			return this.activeAnnotation as TrafficSign
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

	/**
	 * Create a new annotation. Add its associated rendering object to the scene for display.
	 * @param obj             Construct the annotation from a JSON object
	 * @param annotationType  Construct a new annotation with the given type
	 * @param activate        Activate the new annotation after creation
	 * One of obj and annotationType is required.
	 */
	addAnnotation(
		obj: AnnotationJsonInputInterface | null,
		annotationType: AnnotationType | null = null,
		activate: boolean = false
	): Annotation | null {
		if (this.isLiveMode) return null

		// Can't create a new annotation if the current active annotation doesn't have any markers (because if we did
		// that annotation wouldn't be selectable and it would be lost).
		if (this.activeAnnotation && !this.activeAnnotation.isValid()) return null

		// Figure out which type we are working with.
		let myAnnotationType: AnnotationType
		if (obj) {
			myAnnotationType = AnnotationType[obj.annotationType]
		} else if (annotationType) {
			myAnnotationType = annotationType
		} else {
			log.warn('addAnnotation() requires either an AnnotationJsonInputInterface or an AnnotationType input')
			return null
		}

		// Get methods and data structures appropriate to the type.
		const similarAnnotations = this.annotationTypeToSimilarAnnotationsList(myAnnotationType)
		if (similarAnnotations === null) {
			if (obj)
				log.warn(`discarding annotation with invalid type ${obj.annotationType}`)
			else
				log.warn(`discarding annotation with invalid type ${annotationType}`)
			return null
		}

		// Instantiate it.
		let newAnnotation: Annotation | null
		if (obj) {
			// Discard duplicate annotations.
			if (similarAnnotations.some(a => a.uuid === obj.uuid))
				return null

			// Instantiate and validate.
			newAnnotation = AnnotationFactory.construct(myAnnotationType, obj)
			if (!(newAnnotation && newAnnotation.isValid()))
				return null
		} else {
			newAnnotation = AnnotationFactory.construct(myAnnotationType)
		}
		if (!newAnnotation)
			return null

		// Set state.
		similarAnnotations.push(newAnnotation)
		this.annotationObjects.push(newAnnotation.renderingObject)
		this.scene.add(newAnnotation.renderingObject)
		if (activate)
			this.changeActiveAnnotation(newAnnotation)

		return newAnnotation
	}

	// Get a reference to the list containing matching AnnotationType.
	private annotationTypeToSimilarAnnotationsList(annotationType: AnnotationType): Annotation[] | null {
		switch (annotationType) {
			case AnnotationType.BOUNDARY: return this.boundaryAnnotations
			case AnnotationType.CONNECTION: return this.connectionAnnotations
			case AnnotationType.LANE: return this.laneAnnotations
			case AnnotationType.TERRITORY: return this.territoryAnnotations
			case AnnotationType.TRAFFIC_SIGN: return this.trafficSignAnnotations
			default: return null
		}
	}

	/**
	 * Add a new relation between two existing lanes
	 */
	addRelation(fromId: AnnotationId, toId: AnnotationId, relation: string): boolean {
		if (this.isLiveMode) return false

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
				if (laneFrom.neighborsIds.left === null &&
					laneTo.neighborsIds.right === null) {

					laneFrom.neighborsIds.left = laneTo.uuid
					laneTo.neighborsIds.right = laneFrom.uuid
				} else {
					dialog.showErrorBox(EM.ET_RELATION_ADD_FAIL, `${relation} relation already exists`)
					return false
				}
				break
			case 'left reverse':
				if (laneFrom.neighborsIds.left === null &&
					laneTo.neighborsIds.left === null) {

					laneFrom.neighborsIds.left = laneTo.uuid
					laneTo.neighborsIds.left = laneFrom.uuid
				} else {
					dialog.showErrorBox(EM.ET_RELATION_ADD_FAIL, `${relation} relation already exists`)
					return false
				}
				break
			case 'right':
				if (laneFrom.neighborsIds.right === null &&
					laneTo.neighborsIds.left === null) {

					laneFrom.neighborsIds.right = laneTo.uuid
					laneTo.neighborsIds.left = laneFrom.uuid
				} else {
					dialog.showErrorBox(EM.ET_RELATION_ADD_FAIL, `${relation} relation already exists`)
					return false
				}
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
	 * Create a new lane annotation connected to the current active annotation at the given location and with
	 * the given direction of traffic. The new annotation is added to the scene for display and set as
	 * inactive.
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
				existLeftNeighbour: activeLane.neighborsIds.left !== null,
				existRightNeighbour: activeLane.neighborsIds.right !== null}
	}

	/**
	 * Eliminate the current active annotation from the manager. Delete its associated
	 * mesh and markers from the scene and reset any active annotation variables.
	 */
	deleteActiveAnnotation(): boolean {
		if (this.isLiveMode) return false

		if (!this.activeAnnotation) {
			log.warn("Can't delete active annotation. No active annotation selected.")
			return false
		}

		if (!this.deleteAnnotation(this.activeAnnotation)) {
			log.warn(`deleteAnnotation() failed for ${this.activeAnnotation.annotationType}, ${this.activeAnnotation.uuid}`)
			return false
		}

		this.activeAnnotation = null
		this.metadataState.dirty()

		return true
	}

	/**
	 * Add marker to the active annotation at the given position and add it
	 * to the scene.
	 */
	addMarkerToActiveAnnotation(position: THREE.Vector3): boolean {
		if (this.isLiveMode) return false

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
		if (this.isLiveMode) return false

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

	/**
	 * Remove last marker from the annotation. The marker is also removed from
	 * the scene.
	 */
	deleteLastMarker(): boolean {
		if (this.isLiveMode) return false

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

	deleteActiveLaneFromPath(): boolean {
		const activeLane = this.getActiveLaneAnnotation()
		if (!activeLane) {
			return false
		}

		const index = this.laneIndexInPath(activeLane.uuid)
		if (index !== -1) {
			this.laneAnnotations[index].setTrajectory(false)
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
	 * Changes the rendering attribute of some objects and disables editing, for live presentation mode.
	 */
	setLiveMode(): void {
		if (!this.isLiveMode) {
			this.unsetActiveAnnotation()
			this.allAnnotations().forEach(a => a.setLiveMode())
			this.isLiveMode = true
		}
	}

	/**
	 * Reverses setLiveMode().
	 */
	unsetLiveMode(): void {
		if (this.isLiveMode) {
			this.allAnnotations().forEach(a => a.unsetLiveMode())
			this.isLiveMode = false
		}
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
				const frontLaneNeighbors = frontLane.neighborsIds
				if (frontLaneNeighbors.right !== null &&
					this.isUuidInList(this.carPath, frontLaneNeighbors.right)) {
					return this.getAnnotationIndexFromUuid(this.laneAnnotations, frontLaneNeighbors.right)
				}

				if (frontLaneNeighbors.left !== null &&
					this.isUuidInList(this.carPath, frontLaneNeighbors.left)) {
					return this.getAnnotationIndexFromUuid(this.laneAnnotations, frontLaneNeighbors.left)
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
			// Get latitude longitude
			const lngLatAlt = this.threeJsToLngLatAlt(marker)
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
	changeActiveAnnotation(changeTo: Annotation | null): boolean {
		if (!changeTo) return false
		// Can't activate annotations during live mode
		if (this.isLiveMode) return false

		// Trying to activate the currently active annotation, there is nothing to do
		if (this.activeAnnotation && this.activeAnnotation.uuid === changeTo.uuid) {
			return false
		}

		// Deactivate current active annotation
		if (this.activeAnnotation)
			this.activeAnnotation.makeInactive()

		// Set new active annotation
		this.activeAnnotation = changeTo
		this.activeAnnotation.makeActive()

		return true
	}

	// Make no annotations active.
	unsetActiveAnnotation(): boolean {
		if (this.isLiveMode) return false

		if (this.activeAnnotation) {
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
		if (this.isLiveMode) return Promise.reject(new Error("can't load annotations while in live presentation mode"))

		return AsyncFile.readFile(fileName, 'ascii')
			.then((text: string) => this.loadAnnotationsFromObject(JSON.parse(text)))
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

	async saveAnnotationsToFile(fileName: string, format: OutputFormat): Promise<void> {
		if (!this.allAnnotations().find(a => a.isValid()))
			return Promise.reject(new Error('failed to save empty set of annotations'))

		if (!this.hasOrigin() && !config.get('output.annotations.debug.allow_annotations_without_utm_origin'))
			return Promise.reject(new Error('failed to save annotations: UTM origin is not set'))

		const self = this
		const dirName = fileName.substring(0, fileName.lastIndexOf("/"))
		return Promise.resolve(mkdirp.sync(dirName))
			.then(() => AsyncFile.writeTextFile(fileName, JSON.stringify(self.toJSON(format))))
			.then(() => self.metadataState.clean())
	}

	toJSON(format: OutputFormat): AnnotationManagerJsonOutputInterface {
		let crs: CRS.CoordinateReferenceSystem
		let pointConverter: (p: THREE.Vector3) => Object
		if (format === OutputFormat.UTM) {
			crs = {
				coordinateSystem: 'UTM',
				datum: this.datum,
				parameters: {
					utmZoneNumber: this.utmZoneNumber,
					utmZoneNorthernHemisphere: this.utmZoneNorthernHemisphere,
				}
			} as CRS.UtmCrs
			pointConverter = this.threeJsToUtmJsonObject()
		} else if (format === OutputFormat.LLA) {
			crs = {
				coordinateSystem: 'LLA',
				datum: this.datum,
			} as CRS.LlaCrs
			pointConverter = this.threeJsToLlaJsonObject()
		} else {
			throw new Error('unknown OutputFormat: ' + format)
		}
		const data: AnnotationManagerJsonOutputInterface = {
			version: currentAnnotationFileVersion,
			created: new Date().toISOString(),
			coordinateReferenceSystem: crs,
			annotations: [],
		}

		data.annotations = this.allAnnotations()
			.filter(a => a.isValid())
			.map(a => a.toJSON(pointConverter))

		return data
	}

	/**
	 * 	Save lane waypoints (only) to KML.
	 */
	saveToKML(fileName: string): Promise<void> {
		// Get all the points and convert to lat lon
		const geopoints: Array<THREE.Vector3> =
			lodash.flatten(
				this.laneAnnotations.map(lane =>
					lane.waypoints.map(p => this.threeJsToLngLatAlt(p))
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
	private loadAnnotationsFromObject(rawData: Object): THREE.Vector3 | null {
		// Check versioning and coordinate system
		const data = toCurrentAnnotationVersion(rawData)
		if (!data['annotations']) {
			throw Error(`got an annotation file with no annotations`)
		}
		if (!this.checkCoordinateSystem(data)) {
			const params = data['coordinateReferenceSystem']['parameters']
			const zoneId = `${params['utmZoneNumber']}${params['utmZoneNorthernHemisphere']}`
			throw Error(`UTM Zone for new annotations (${zoneId}) does not match existing zone in ${this.getOrigin()}`)
		}
		this.convertCoordinates(data)

		// Unset active, to pass a validation check in addAnnotation().
		this.unsetActiveAnnotation()

		// Convert data to annotations
		let boundingBox = new THREE.Box3()
		let invalid = 0
		data['annotations'].forEach((obj: AnnotationJsonInputInterface) => {
			const newAnnotation = this.addAnnotation(obj)
			if (newAnnotation)
				boundingBox = boundingBox.union(newAnnotation.boundingBox())
			else
				invalid++
		})

		// Clean up and go home
		if (invalid)
			log.warn(`discarding ${invalid} invalid annotations`)
		this.metadataState.clean()

		if (boundingBox.isEmpty())
			return null
		else
			return boundingBox.getCenter().setY(boundingBox.min.y)
	}

	/**
	 * Concatenate all annotation types into a single array.
	 */
	private allAnnotations(): Annotation[] {
		return ([] as Annotation[])
			.concat(this.boundaryAnnotations)
			.concat(this.connectionAnnotations)
			.concat(this.laneAnnotations)
			.concat(this.territoryAnnotations)
			.concat(this.trafficSignAnnotations)
	}

	/**
	 * Adds a new lane annotation and initializes its first two points to be the last two points of
	 * the source annotation and its next two points to be an extension in the direction of
	 * the last four points of the source annotation.
	 */
	private addFrontConnection(source: Lane): boolean {

		const newAnnotation = this.addAnnotation(null, AnnotationType.LANE) as Lane
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

		if (source.neighborsIds.left != null) {
			log.warn('This lane already has a neighbor to the LEFT. Aborting new connection.')
			return false
		}

		const newAnnotation = this.addAnnotation(null, AnnotationType.LANE) as Lane
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
		if (source.neighborsIds.right != null) {
			log.warn('This lane already has a neighbor to the RIGHT. Aborting new connection.')
			return false
		}

		const newAnnotation = this.addAnnotation(null, AnnotationType.LANE) as Lane
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

		if (annotation.neighborsIds.right) {
			const rightNeighbor = this.findAnnotationByUuid(annotation.neighborsIds.right)
			if (rightNeighbor && rightNeighbor instanceof Lane) {
				if (rightNeighbor.deleteLeftOrRightNeighbor(annotation.uuid))
					modifications++
			} else {
				log.error("Couldn't find right neighbor. This should never happen.")
			}
		}

		if (annotation.neighborsIds.left) {
			const leftNeighbor = this.findAnnotationByUuid(annotation.neighborsIds.left)
			if (leftNeighbor && leftNeighbor instanceof Lane) {
				if (leftNeighbor.deleteLeftOrRightNeighbor(annotation.uuid))
					modifications++
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
			} else if (frontNeighbor instanceof Connection) {
				// If the front neighbor is a connection delete it
				if (this.deleteAnnotation(frontNeighbor))
					modifications++
			} else {
				log.error('Not valid front neighbor')
			}
		}

		for (let i = 0; i < annotation.neighborsIds.back.length; i++) {
			const backNeighbor = this.findAnnotationByUuid(annotation.neighborsIds.back[i])
			if (backNeighbor instanceof Lane) {
				// If the back neighbor is another lane, delete the reference to this lane from its neighbors
				if (backNeighbor.deleteFrontNeighbor(annotation.uuid))
					modifications++
			} else if (backNeighbor instanceof Connection) {
				// If the back neighbor is a connection delete it
				if (this.deleteAnnotation(backNeighbor))
					modifications++
			} else {
				log.error('Not valid back neighbor')
			}
		}

		if (modifications)
			this.metadataState.dirty()
	}

	/**
	 * Create a new lane connection between given lanes using a cubic spline.
	 * This is the old implementation of former "addConnection" function.
	 */
	private addConnectionWithSpline(laneFrom: Lane, laneTo: Lane): void {

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
		const pointsRight: Array<THREE.Vector3> = []
		pointsRight.push(laneFrom.markers[lastIndex - 3].position)
		pointsRight.push(laneFrom.markers[lastIndex - 1].position)
		pointsRight.push(laneTo.markers[0].position)
		pointsRight.push(laneTo.markers[2].position)
		const pointsLeft: Array<THREE.Vector3> = []
		pointsLeft.push(laneFrom.markers[lastIndex - 2].position)
		pointsLeft.push(laneFrom.markers[lastIndex].position)
		pointsLeft.push(laneTo.markers[1].position)
		pointsLeft.push(laneTo.markers[3].position)

		const splineLeft = new THREE.CatmullRomCurve3(pointsLeft)
		const splineRight = new THREE.CatmullRomCurve3(pointsRight)

		// Add path to the connection
		connection.addMarker(getMarkerInBetween(pointsRight[1], pointsLeft[1], 0.4), false)
		connection.addMarker(getMarkerInBetween(pointsRight[1], pointsLeft[1], 0.6), false)
		connection.addMarker(getMarkerInBetween(splineRight.getPoint(0.45), splineLeft.getPoint(0.45), 0.4), false)
		connection.addMarker(getMarkerInBetween(splineRight.getPoint(0.45), splineLeft.getPoint(0.45), 0.6), false)
		connection.addMarker(getMarkerInBetween(splineRight.getPoint(0.55), splineLeft.getPoint(0.55), 0.4), false)
		connection.addMarker(getMarkerInBetween(splineRight.getPoint(0.55), splineLeft.getPoint(0.55), 0.6), false)
		connection.addMarker(getMarkerInBetween(pointsRight[2], pointsLeft[2], 0.4), false)
		connection.addMarker(getMarkerInBetween(pointsRight[2], pointsLeft[2], 0.6), false)

		// Add annotation to the scene
		this.scene.add(connection.renderingObject)
		this.annotationObjects.push(connection.renderingObject)

		connection.makeInactive()
		connection.updateVisualization()
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
		this.scene.add(connection.renderingObject)
		this.annotationObjects.push(connection.renderingObject)

		connection.makeInactive()
		connection.updateVisualization()
		this.metadataState.dirty()
	}

	/**
	 * Delete an annotation and tear down references to it.
	 */
	private deleteAnnotation(annotation: Annotation): boolean {
		// Get data structures appropriate to the type.
		const similarAnnotations = this.annotationTypeToSimilarAnnotationsList(annotation.annotationType)
		if (!similarAnnotations)
			return false

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
		this.scene.remove(annotation.renderingObject)

		return true
	}

	private threeJsToUtmJsonObject(): (p: THREE.Vector3) => UtmJson {
		const self = this
		return function (p: THREE.Vector3): UtmJson {
			const utm = self.threeJsToUtm(p)
			return {'E': utm.x, 'N': utm.y, 'alt': utm.z}
		}
	}

	private threeJsToLlaJsonObject(): (p: THREE.Vector3) => LlaJson {
		const self = this
		return function (p: THREE.Vector3): LlaJson {
			const lngLatAlt = self.threeJsToLngLatAlt(p)
			return {'lng': lngLatAlt.x, 'lat': lngLatAlt.y, 'alt': lngLatAlt.z}
		}
	}

	/**
	 * This expects the serialized UtmCrs structure produced by toJSON().
	 */
	private checkCoordinateSystem(data: Object): boolean {
		const crs = data['coordinateReferenceSystem']
		if (crs['coordinateSystem'] !== 'UTM') return false
		if (crs['datum'] !== this.datum) return false
		if (isNullOrUndefined(crs['parameters']['utmZoneNumber']))
			return false
		const num = crs['parameters']['utmZoneNumber']
		if (isNullOrUndefined(crs['parameters']['utmZoneNorthernHemisphere']))
			return false
		const northernHemisphere = !!crs['parameters']['utmZoneNorthernHemisphere']

		if (!data['annotations']) return false
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
		if (!first) return false

		return this.setOrigin(num, northernHemisphere, first) ||
			this.utmZoneNumber === num && this.utmZoneNorthernHemisphere === northernHemisphere
	}

	/**
	 * Convert markers from UTM objects to vectors in local coordinates, for downstream consumption.
	 */
	private convertCoordinates(data: Object): void {
		data['annotations'].forEach((annotation: {}) => {
			if (annotation['markers']) {
				for (let i = 0; i < annotation['markers'].length; i++) {
					const pos = annotation['markers'][i] as UtmJson
					annotation['markers'][i] = this.utmToThreeJs(pos['E'], pos['N'], pos['alt'])
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

		if (lane.neighborsIds.left === uuidToRemove) {
			lane.neighborsIds.left = null
			return true
		}

		if (lane.neighborsIds.right === uuidToRemove) {
			lane.neighborsIds.right = null
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
			&& (this.annotationManager.laneAnnotations.length > 0 || this.annotationManager.boundaryAnnotations.length > 0)
	}

	private doImmediateSave(): boolean {
		return this.isDirty
			&& (this.annotationManager.laneAnnotations.length > 0 || this.annotationManager.boundaryAnnotations.length > 0)
	}

	private saveAnnotations(): Promise<void> {
		const now = new Date()
		const nowElements = [
			now.getUTCFullYear(),
			now.getUTCMonth() + 1,
			now.getUTCDate(),
			now.getUTCHours(),
			now.getUTCMinutes(),
			now.getUTCSeconds(),
			now.getUTCMilliseconds(),
		]
		const fileName = vsprintf("%04d-%02d-%02dT%02d-%02d-%02d.%03dZ.json", nowElements)
		const savePath = this.autoSaveDirectory + '/' + fileName
		log.info("auto-saving annotations to: " + savePath)
		return this.annotationManager.saveAnnotationsToFile(savePath, OutputFormat.UTM)
			.catch(error => log.warn('save annotations failed: ' + error.message))
	}
}
