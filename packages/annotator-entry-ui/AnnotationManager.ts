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
	Lane, NeighborDirection, NeighborLocation, LaneNeighborsIds, LaneJsonInputInterfaceV3
} from 'annotator-entry-ui/annotations/Lane'
import {TrafficSign, TrafficSignJsonInputInterface} from 'annotator-entry-ui/annotations/TrafficSign'
import {Connection, ConnectionJsonInputInterface} from 'annotator-entry-ui/annotations/Connection'
import {SimpleKML} from 'annotator-entry-ui/KmlUtils'
import * as EM from 'annotator-entry-ui/ErrorMessages'
import * as TypeLogger from 'typelogger'
import * as AsyncFile from 'async-file'
import * as mkdirp from 'mkdirp'
import Vector3 = THREE.Vector3
import {UtmInterface} from "./UtmInterface"
import * as CRS from "./CoordinateReferenceSystem"

// tslint:disable-next-line:no-any
TypeLogger.setLoggerOutput(console as any)
const log = TypeLogger.getLogger(__filename)
const {dialog} = require('electron').remote

// tslint:disable:no-string-literal

enum LinkType {
	FORWARD = 1,
	SIDE = 2,
	OTHER = 3
}

class Link {
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
function getMarkerInBetween(marker1: Vector3, marker2: Vector3, atDistance: number): Vector3 {
	return marker2.clone().sub(marker1).multiplyScalar(atDistance).add(marker1)
}

interface AnnotationManagerJsonOutputInterface {
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
	trafficSignAnnotations: Array<TrafficSign>
	connectionAnnotations: Array<Connection>
	annotationMeshes: Array<THREE.Mesh>
	activeAnnotation: Annotation | null
	private carPath: Array<AnnotationUuid>
	private carPathActivation: boolean
	private metadataState: AnnotationState
	private isLiveMode: boolean

	constructor(scene: THREE.Scene) {
		super()
		this.scene = scene
		this.laneAnnotations = []
		this.trafficSignAnnotations = []
		this.connectionAnnotations = []
		this.annotationMeshes = []
		this.activeAnnotation = null
		this.carPath = []
		this.carPathActivation = false
		this.metadataState = new AnnotationState(this)
		this.isLiveMode = false
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

	// Get all markers for the active annotation, if any.
	activeMarkers(): Array<THREE.Mesh> {
		return this.activeAnnotation
			? this.activeAnnotation.markers
			: []
	}

	/**
	 * Add a new lane annotation and add its mesh to the scene for display.
	 */
	addLaneAnnotation(obj?: LaneJsonInputInterfaceV3): Lane | null {
		if (this.isLiveMode) return null

		let newAnnotation: Lane
		if (obj) {
			newAnnotation = new Lane(obj)
			if (!newAnnotation.markers.length)
				return null
			if (this.laneAnnotations.some(a => a.uuid === newAnnotation.uuid))
				return null
		} else {
			newAnnotation = new Lane()
		}
		this.laneAnnotations.push(newAnnotation)

		this.annotationMeshes.push(newAnnotation.mesh)
		this.scene.add(newAnnotation.renderingObject)

		return newAnnotation
	}

	addTrafficSignAnnotation(obj?: TrafficSignJsonInputInterface): TrafficSign | null {
		if (this.isLiveMode) return null

		let newAnnotation: TrafficSign
		if (obj) {
			newAnnotation = new TrafficSign(obj)
			if (!newAnnotation.markers.length)
				return null
			if (this.trafficSignAnnotations.some(a => a.uuid === newAnnotation.uuid))
				return null
		} else {
			newAnnotation = new TrafficSign()
		}
		this.trafficSignAnnotations.push(newAnnotation)

		this.annotationMeshes.push(newAnnotation.mesh)
		this.scene.add(newAnnotation.renderingObject)

		return newAnnotation
	}

	addConnectionAnnotation(obj?: ConnectionJsonInputInterface): Connection | null {
		if (this.isLiveMode) return null

		let newAnnotation: Connection
		if (obj) {
			newAnnotation = new Connection(obj)
			if (!newAnnotation.markers.length)
				return null
			if (this.connectionAnnotations.some(a => a.uuid === newAnnotation.uuid))
				return null
		} else {
			newAnnotation = new Connection()
		}
		this.connectionAnnotations.push(newAnnotation)

		this.annotationMeshes.push(newAnnotation.mesh)
		this.scene.add(newAnnotation.renderingObject)

		return newAnnotation
	}

	getActiveLaneAnnotation(): Lane | null {
		if (this.activeAnnotation && this.activeAnnotation instanceof Lane)
			return this.activeAnnotation as Lane
		else
			return null
	}

	getActiveTrafficSignAnnotation(): TrafficSign | null {
		if (this.activeAnnotation && this.activeAnnotation instanceof TrafficSign)
			return this.activeAnnotation as TrafficSign
		else
			return null
	}

	/**
	 * Get all existing ids
	 */
	getValidIds(): Array<AnnotationId> {
		const list: Array<AnnotationId> = []

		this.laneAnnotations.forEach( (annotation: Lane) => {
			list.push(annotation.id)
		})

		this.trafficSignAnnotations.forEach( (annotation: TrafficSign) => {
			list.push(annotation.id)
		})

		this.connectionAnnotations.forEach( (annotation: Connection) => {
			list.push(annotation.id)
		})

		return list
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
					dialog.showErrorBox(EM.ET_RELATION_ADD_FAIL, "Left relation already exist.")
					return false
				}
				break
			case 'left reverse':
				if (laneFrom.neighborsIds.left === null &&
					laneTo.neighborsIds.left === null) {

					laneFrom.neighborsIds.left = laneTo.uuid
					laneTo.neighborsIds.left = laneFrom.uuid
				} else {
					dialog.showErrorBox(EM.ET_RELATION_ADD_FAIL, "Left relation already exist.")
					return false
				}
				break
			case 'right':
				if (laneFrom.neighborsIds.right === null &&
					laneTo.neighborsIds.left === null) {

					laneFrom.neighborsIds.right = laneTo.uuid
					laneTo.neighborsIds.left = laneFrom.uuid
				} else {
					dialog.showErrorBox(EM.ET_RELATION_ADD_FAIL, "Right relation already exist.")
					return false
				}
				break
			case 'front':
				const index1 = laneFrom.neighborsIds.front.findIndex((neighbor) => {
					return neighbor === laneTo!.uuid
				})
				const index2 = laneTo.neighborsIds.back.findIndex((neighbor) => {
					return neighbor === laneFrom!.uuid
				})
				if (index1 === -1 && index2 === -1) {
					// check if close enough
					const laneFromPoint = laneFrom.markers[laneFrom.markers.length - 1].position
					const laneToPoint = laneTo.markers[1].position
					if (laneFromPoint.distanceTo(laneToPoint) < 1.0) {
						laneTo.neighborsIds.back.push(laneFrom.uuid)
						laneFrom.neighborsIds.front.push(laneTo.uuid)
					} else {
						// Connection lane needed
						this.addConnection(laneFrom, laneTo)
					}
				} else {
					dialog.showErrorBox(EM.ET_RELATION_ADD_FAIL, "Front relation already exist.")
					return false
				}
				break
			case 'back':
				const index3 = laneFrom.neighborsIds.back.findIndex((neighbor) => {
					return neighbor === laneTo!.uuid
				})
				const index4 = laneTo.neighborsIds.front.findIndex((neighbor) => {
					return neighbor === laneFrom!.uuid
				})
				if (index3 === -1 && index4 === -1) {
					laneFrom.neighborsIds.back.push(laneTo.uuid)
					laneTo.neighborsIds.front.push(laneFrom.uuid)
				} else {
					dialog.showErrorBox(EM.ET_RELATION_ADD_FAIL, "Back relation already exist.")
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

	/**
	 * Changes the rendering attribute of some objects and disables editing, for live presentation mode.
	 */
	setLiveMode(): void {
		if (!this.isLiveMode) {
			this.laneAnnotations.forEach((annotation) => {
				annotation.setLiveMode()
			})
			this.trafficSignAnnotations.forEach((annotation) => {
				annotation.setLiveMode()
			})
			this.connectionAnnotations.forEach((annotation) => {
				annotation.setLiveMode()
			})
			this.isLiveMode = true
		}
	}

	/**
	 * Reverses setLiveMode().
	 */
	unsetLiveMode(): void {
		if (this.isLiveMode) {
			this.laneAnnotations.forEach((annotation) => {
				annotation.unsetLiveMode()
			})
			this.trafficSignAnnotations.forEach((annotation) => {
				annotation.unsetLiveMode()
			})
			this.connectionAnnotations.forEach((annotation) => {
				annotation.unsetLiveMode()
			})
			this.isLiveMode = false
			this.activeAnnotation = null
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
	generatePointsFromSortedCarPath(sortedCarPath: Array<Link>, minDistLaneChange: number): Array<Vector3> {

		let points: Array<Vector3> = []
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
	getFullInterpolatedTrajectory(step: number, minDistanceLaneChange: number): Array<Vector3> {

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
		const points: Array<Vector3> = this.generatePointsFromSortedCarPath(sortedCarPath, minDistanceLaneChange)
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
	convertAnnotationToCSV(data: Array<Vector3>, columnDelimiter: string = ',', lineDelimiter: string = '\n'): string {
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

	private findAnnotationByUuid(uuid: AnnotationUuid): Annotation | null {
		const lane = this.laneAnnotations.find(a => a.uuid === uuid)
		if (lane) return lane

		const connection = this.connectionAnnotations.find(a => a.uuid === uuid)
		if (connection) return connection

		const trafficSign = this.trafficSignAnnotations.find(a => a.uuid === uuid)
		if (trafficSign) return trafficSign

		return null
	}

	/**
	 * Check if the passed mesh corresponds to an inactive annotation.
	 */
	checkForInactiveAnnotation(object: THREE.Mesh): Annotation | null {
		// Check for lane annotations
		const laneAnnotation = this.laneAnnotations.find(a => a.mesh === object)
		if (laneAnnotation) {
			if (this.activeAnnotation && this.activeAnnotation.uuid === laneAnnotation.uuid)
				return null
			else
				return laneAnnotation
		}

		// Selected object didn't match any lanes. Check for traffic sign annotations
		const trafficSignAnnotation = this.trafficSignAnnotations.find(a => a.mesh === object)
		if (trafficSignAnnotation) {
			if (this.activeAnnotation && this.activeAnnotation.uuid === trafficSignAnnotation.uuid)
				return null
			else
				return trafficSignAnnotation
		}

		const connectionAnnotation = this.connectionAnnotations.find(a => a.mesh === object)
		if (connectionAnnotation) {
			if (this.activeAnnotation && this.activeAnnotation.uuid === connectionAnnotation.uuid)
				return null
			else
				return connectionAnnotation
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

		if (this.activeAnnotation instanceof Lane)
			this.deleteLane(this.activeAnnotation)
		else if (this.activeAnnotation instanceof Connection)
			this.deleteConnection(this.activeAnnotation)
		else if (this.activeAnnotation instanceof TrafficSign)
			this.deleteTrafficSign(this.activeAnnotation)
		else
			log.warn('Unrecognized annotation type')

		this.activeAnnotation = null

		this.metadataState.dirty()
		return true
	}

	/**
	 * Add marker to the active annotation at the given position and add it
	 * to the scene. After the first two markers of a new annotation this function
	 * will add two markers subsequently. The second of those markers is computed
	 * as a linear combination of the first marker (given position) and the
	 * previous two markers.
	 */
	addLaneMarker(position: Vector3): boolean {
		if (this.isLiveMode) return false

		const activeLane = this.getActiveLaneAnnotation()
		if (!activeLane) {
			log.info("No active lane annotation. Can't add marker")
			return false
		}

		activeLane.addMarker(position)

		this.metadataState.dirty()
		return true
	}

	addTrafficSignMarker(position: THREE.Vector3, isLastMarker: boolean): boolean {
		if (this.isLiveMode) return false

		const activeSign = this.getActiveTrafficSignAnnotation()
		if (!activeSign) {
			log.info("No active traffic sign annotation. Can't add marker")
			return false
		}

		activeSign.addMarker(position, isLastMarker)

		this.metadataState.dirty()
		return true
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
	 * Update the mesh of the active annotation. This is used if the lane marker positions
	 * where changed externally (e.g. by the transform controls)
	 */
	updateActiveAnnotationMesh(): void {
		if (!this.activeAnnotation) {
			log.info("No active annotation. Can't update mesh")
			return
		}

		this.activeAnnotation.updateVisualization()
	}

	/*
	 * Draw the markers a little larger.
	 */
	highlightMarkers(markers: Array<THREE.Mesh>): void {
		if (this.activeAnnotation)
			this.activeAnnotation.highlightMarkers(markers)
	}

	/*
	 * Draw all markers at normal size.
	 */
	unhighlightMarkers(): void {
		if (this.activeAnnotation)
			this.activeAnnotation.unhighlightMarkers()
	}

	/*
	 * Get all markers that share a lane edge with the origin, up to a given distance in either direction.
	 * Distance is a count of markers, not a physical distance.
	 * Origin is not included in the result.
	 * Sort order is not specified.
	 */
	neighboringLaneMarkers(origin: THREE.Mesh, distance: number): Array<THREE.Mesh> {
		const active = this.getActiveLaneAnnotation()

		if (active === null) {
			return []
		}

		return active.neighboringLaneMarkers(origin, distance)
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

	// Get a usable data structure from raw JSON. There are plenty of ways for this to throw errors.
	// Assume that they are caught and handled upstream.
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

		// Convert data to annotations
		let boundingBox = new THREE.Box3()
		let invalid = 0
		data['annotations'].forEach((element: AnnotationJsonInputInterface) => {
			const annotationType = AnnotationType[element.annotationType]
			let newAnnotation: Annotation | null = null
			switch (annotationType) {
				case AnnotationType.LANE:
					newAnnotation = this.addLaneAnnotation(element as LaneJsonInputInterfaceV3)
					break
				case AnnotationType.TRAFFIC_SIGN:
					newAnnotation = this.addTrafficSignAnnotation(element as TrafficSignJsonInputInterface)
					break
				case AnnotationType.CONNECTION:
					newAnnotation = this.addConnectionAnnotation(element as ConnectionJsonInputInterface)
					break
				default:
					log.warn(`discarding annotation with invalid type ${element.annotationType}`)
			}
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

	unloadAllAnnotations(): void {
		log.info('deleting all annotations')
		// slice() makes a local copy of each array, since the delete() methods mutate the arrays.
		this.connectionAnnotations.slice().forEach(a => this.deleteConnection(a))
		this.trafficSignAnnotations.slice().forEach(a => this.deleteTrafficSign(a))
		this.laneAnnotations.slice().forEach(a => this.deleteLane(a))
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
		if (this.laneAnnotations.filter(a => a.isValid()).length === 0
			&& this.connectionAnnotations.filter(a => a.isValid()).length === 0
			&& this.trafficSignAnnotations.filter(a => a.isValid()).length === 0) {
			return Promise.reject(new Error('failed to save empty set of annotations'))
		}
		if (!this.hasOrigin() && !config.get('output.annotations.debug.allow_annotations_without_utm_origin')) {
			return Promise.reject(new Error('failed to save annotations: UTM origin is not set'))
		}
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

		let allAnnotations: Annotation[] = []
		allAnnotations = allAnnotations.concat(this.laneAnnotations)
		allAnnotations = allAnnotations.concat(this.connectionAnnotations)
		allAnnotations = allAnnotations.concat(this.trafficSignAnnotations)
		data.annotations = allAnnotations
			.filter(a => a.isValid())
			.map(a => a.toJSON(pointConverter))

		return data
	}

	// Save lane waypoints (only) to KML.
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

	/**
	 * Create a new lane connection between given lanes
	 */
	private addConnection(laneFrom: Lane, laneTo: Lane): void {

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
		const pointsRight: Array<Vector3> = []
		pointsRight.push(laneFrom.markers[lastIndex - 3].position)
		pointsRight.push(laneFrom.markers[lastIndex - 1].position)
		pointsRight.push(laneTo.markers[0].position)
		pointsRight.push(laneTo.markers[2].position)
		const pointsLeft: Array<Vector3> = []
		pointsLeft.push(laneFrom.markers[lastIndex - 2].position)
		pointsLeft.push(laneFrom.markers[lastIndex].position)
		pointsLeft.push(laneTo.markers[1].position)
		pointsLeft.push(laneTo.markers[3].position)

		const splineLeft = new THREE.CatmullRomCurve3(pointsLeft)
		const splineRight = new THREE.CatmullRomCurve3(pointsRight)

		// Add path to the connection
		connection.addMarker(getMarkerInBetween(pointsRight[1], pointsLeft[1], 0.4))
		connection.addMarker(getMarkerInBetween(pointsRight[1], pointsLeft[1], 0.6))
		connection.addMarker(getMarkerInBetween(splineRight.getPoint(0.45), splineLeft.getPoint(0.45), 0.4))
		connection.addMarker(getMarkerInBetween(splineRight.getPoint(0.45), splineLeft.getPoint(0.45), 0.6))
		connection.addMarker(getMarkerInBetween(splineRight.getPoint(0.55), splineLeft.getPoint(0.55), 0.4))
		connection.addMarker(getMarkerInBetween(splineRight.getPoint(0.55), splineLeft.getPoint(0.55), 0.6))
		connection.addMarker(getMarkerInBetween(pointsRight[2], pointsLeft[2], 0.4))
		connection.addMarker(getMarkerInBetween(pointsRight[2], pointsLeft[2], 0.6))

		// Add annotation to the scene
		this.scene.add(connection.renderingObject)
		this.annotationMeshes.push(connection.mesh)

		connection.makeInactive()
		connection.updateVisualization()
		this.metadataState.dirty()
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

	private removeMeshFromArray(meshArray: Array<THREE.Mesh>, queryMesh: THREE.Mesh): boolean {
		const index = meshArray.findIndex((mesh) => {
			return mesh === queryMesh
		})
		if (index < 0) {
			log.error("Couldn't find associated mesh in internal mesh array. This should never happen")
			return false
		}

		this.annotationMeshes.splice(index, 1)
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

	/**
	 * Delete given annotation
	 */
	private deleteLane(annotation: Lane): boolean {
		// It can't be active after it's gone.
		if (this.activeAnnotation && this.activeAnnotation.uuid === annotation.uuid)
			this.activeAnnotation = null

		// Remove lane from scene.
		this.scene.remove(annotation.renderingObject)

		// Remove mesh from internal array of meshes.
		this.removeMeshFromArray(this.annotationMeshes, annotation.mesh)

		// Make sure we remove references to this annotation from it's neighbors (if any).
		this.deleteConnectionToNeighbors(annotation)

		// Remove annotation from internal array of annotations.
		const eraseIndex = this.getAnnotationIndexFromUuid(this.laneAnnotations, annotation.uuid)
		this.laneAnnotations.splice(eraseIndex, 1)

		this.metadataState.dirty()
		return true
	}

	private deleteTrafficSign(annotation: TrafficSign): boolean {
		// It can't be active after it's gone.
		if (this.activeAnnotation && this.activeAnnotation.uuid === annotation.uuid)
			this.activeAnnotation = null

		// Remove lane from scene.
		this.scene.remove(annotation.renderingObject)

		// Remove mesh from internal array of meshes.
		this.removeMeshFromArray(this.annotationMeshes, annotation.mesh)

		// Remove annotation from internal array of annotations.
		const eraseIndex = this.getAnnotationIndexFromUuid(this.trafficSignAnnotations, annotation.uuid)
		this.trafficSignAnnotations.splice(eraseIndex, 1)

		this.metadataState.dirty()
		return true
	}

	private deleteConnection(annotation: Connection): boolean {
		// It can't be active after it's gone.
		if (this.activeAnnotation && this.activeAnnotation.uuid === annotation.uuid)
			this.activeAnnotation = null

		// Remove connection from scene.
		this.scene.remove(annotation.renderingObject)

		// Remove mesh from internal array of meshes.
		this.removeMeshFromArray(this.annotationMeshes, annotation.mesh)

		// Make sure we remove references to this annotation from it's neighbors (if any).
		this.removeUuidFromLaneNeighbors(annotation.startLaneUuid, annotation.uuid)
		this.removeUuidFromLaneNeighbors(annotation.endLaneUuid, annotation.uuid)

		// Remove annotation from internal array of annotations.
		const eraseIndex = this.getAnnotationIndexFromUuid(this.connectionAnnotations, annotation.uuid)
		this.connectionAnnotations.splice(eraseIndex, 1)

		this.metadataState.dirty()
		return true
	}

	/**
	 * Adds a new lane annotation and initializes its first two points to be the last two points of
	 * the source annotation and its next two points to be an extension in the direction of
	 * the last four points of the source annotation.
	 */
	private addFrontConnection(source: Lane): boolean {

		const newAnnotation = this.addLaneAnnotation()
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

		const newAnnotation = this.addLaneAnnotation()
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

		const newAnnotation = this.addLaneAnnotation()
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
				if (this.deleteConnection(frontNeighbor))
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
				if (this.deleteConnection(backNeighbor))
					modifications++
			} else {
				log.error('Not valid back neighbor')
			}
		}

		if (modifications)
			this.metadataState.dirty()
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
		return this.autoSaveEnabled && this.isDirty && this.annotationManager.laneAnnotations.length > 0
	}

	private doImmediateSave(): boolean {
		return this.isDirty && this.annotationManager.laneAnnotations.length > 0
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
