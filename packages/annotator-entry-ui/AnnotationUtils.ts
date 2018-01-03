/**
 *  Copyright 2017 Mapper Inc. Part of the mapper-annotator project.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

const config = require('../config')
const vsprintf = require("sprintf-js").vsprintf
import {isNullOrUndefined} from "util"
import * as THREE from 'three'
import {
	LaneAnnotation, LaneAnnotationInterface, NeighborDirection,
	NeighborLocation, AnnotationType, LaneId, LaneUuid, LaneNeighborsIds, LaneAnnotationJsonInterface
} from 'annotator-entry-ui/LaneAnnotation'
import {TrafficSign} from 'annotator-entry-ui/annotations/TrafficSign'
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

interface AnnotationManagerJsonInterface {
	version: number
	created: string
	coordinateReferenceSystem: CRS.CoordinateReferenceSystem
	annotations: Array<LaneAnnotationJsonInterface>
}

/**
 * The AnnotationManager is in charge of maintaining a set of annotations and all operations
 * to modify, add or delete them. It also keeps an index to the "active" annotation as well
 * as its markers. The "active" annotation is the only one that can be modified.
 */
export class AnnotationManager extends UtmInterface {
	datum: string = 'WGS84'
	annotations: Array<LaneAnnotation>
	trafficSignAnnotations: Array<TrafficSign>
	annotationMeshes: Array<THREE.Mesh>
	activeMarkers: Array<THREE.Mesh>
	activeAnnotationIndex: number
	activeTrafficSignAnnotationIndex: number
	carPath: Array<LaneUuid>
	carPathActivation: boolean
	metadataState: AnnotationState
	isLiveMode: boolean

	constructor() {
		super()
		this.annotations = []
		this.trafficSignAnnotations = []
		this.annotationMeshes = []
		this.activeMarkers = []
		this.activeAnnotationIndex = -1
		this.activeTrafficSignAnnotationIndex = -1
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

	/**
	 * Get the index of the annotation associated with the given mesh.
	 */
	getAnnotationIndex(object: THREE.Mesh): number {
		return this.annotations.findIndex((element) => {
			return element.laneMesh === object
		})
	}

	/**
	 * Get current active annotation
	 */
	getActiveAnnotation(): LaneAnnotation | null {
		if (this.activeAnnotationIndex < 0 &&
			this.activeAnnotationIndex >= this.annotations.length) {
			return null
		}

		return this.annotations[this.activeAnnotationIndex]
	}

	/**
	 * Get all existing ids
	 */
	getValidIds(): Array<LaneId> {
		const list: Array<LaneId> = []
		for (let i = 0; i < this.annotations.length; ++i) {
			if (this.annotations[i].type === AnnotationType.LANE) {
				list.push(this.annotations[i].id)
			}
		}
		return list
	}

	/**
	 * Create a new lane connection between given lanes
	 */
	private addForwardLaneConnection(scene: THREE.Scene, laneFrom: LaneAnnotation, laneTo: LaneAnnotation): void {

		if (laneFrom.laneMarkers.length < 4 || laneTo.laneMarkers.length < 4) {
			dialog.showErrorBox(EM.ET_RELATION_ADD_FAIL, "Unable to generate forward relation." +
				"Possible reasons: one of the two lanes connected does not have at least 4 markers.")
			return
		}

		// Create new connection
		const connection = new LaneAnnotation()
		connection.setType(AnnotationType.CONNECTION)
		this.annotations.push(connection)

		// Glue neighbors
		connection.neighborsIds.front.push(laneTo.uuid)
		connection.neighborsIds.back.push(laneFrom.uuid)
		laneFrom.neighborsIds.front.push(connection.uuid)
		laneTo.neighborsIds.back.push(connection.uuid)

		// Compute path
		const lastIndex = laneFrom.laneMarkers.length - 1
		const pointsRight: Array<Vector3> = []
		pointsRight.push(laneFrom.laneMarkers[lastIndex - 3].position)
		pointsRight.push(laneFrom.laneMarkers[lastIndex - 1].position)
		pointsRight.push(laneTo.laneMarkers[0].position)
		pointsRight.push(laneTo.laneMarkers[2].position)
		const pointsLeft: Array<Vector3> = []
		pointsLeft.push(laneFrom.laneMarkers[lastIndex - 2].position)
		pointsLeft.push(laneFrom.laneMarkers[lastIndex].position)
		pointsLeft.push(laneTo.laneMarkers[1].position)
		pointsLeft.push(laneTo.laneMarkers[3].position)

		const splineLeft = new THREE.CatmullRomCurve3(pointsLeft)
		const splineRight = new THREE.CatmullRomCurve3(pointsRight)

		// Add path to the connection
		connection.addRawMarker(getMarkerInBetween(pointsRight[1], pointsLeft[1], 0.4))
		connection.addRawMarker(getMarkerInBetween(pointsRight[1], pointsLeft[1], 0.6))
		connection.addRawMarker(getMarkerInBetween(splineRight.getPoint(0.45), splineLeft.getPoint(0.45), 0.4))
		connection.addRawMarker(getMarkerInBetween(splineRight.getPoint(0.45), splineLeft.getPoint(0.45), 0.6))
		connection.addRawMarker(getMarkerInBetween(splineRight.getPoint(0.55), splineLeft.getPoint(0.55), 0.4))
		connection.addRawMarker(getMarkerInBetween(splineRight.getPoint(0.55), splineLeft.getPoint(0.55), 0.6))
		connection.addRawMarker(getMarkerInBetween(pointsRight[2], pointsLeft[2], 0.4))
		connection.addRawMarker(getMarkerInBetween(pointsRight[2], pointsLeft[2], 0.6))

		// Add annotation to the scene
		this.annotationMeshes.push(connection.laneMesh)
		scene.add(connection.laneRenderingObject)
		connection.makeInactive()
		connection.updateVisualization()
		this.metadataState.dirty()
	}

	/**
	 * Add a new relation between two existing lanes
	 */
	addRelation(scene: THREE.Scene, fromId: LaneId, toId: LaneId, relation: string): boolean {
		if (this.isLiveMode) return false

		let laneFrom: LaneAnnotation | null = null
		for (const annotation of this.annotations) {
			if (annotation.id === fromId) {
				laneFrom = annotation
				break
			}
		}

		let laneTo: LaneAnnotation | null = null
		for (const annotation of this.annotations) {
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
					const laneFromPoint = laneFrom.laneMarkers[laneFrom.laneMarkers.length - 1].position
					const laneToPoint = laneTo.laneMarkers[1].position
					if (laneFromPoint.distanceTo(laneToPoint) < 1.0) {
						laneTo.neighborsIds.back.push(laneFrom.uuid)
						laneFrom.neighborsIds.front.push(laneTo.uuid)
					} else {
						// Connection lane needed
						this.addForwardLaneConnection(scene, laneFrom, laneTo)
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
	laneIndexInPath(laneUuid: LaneUuid): number {
		return this.carPath.findIndex((uuid) => {
			return laneUuid === uuid
		})
	}

	addLaneToPath(): boolean {
		if (this.isLiveMode) return false

		if (this.activeAnnotationIndex === -1) {
			log.error('No lane is active.')
			return false
		}

		// Check if lane already added
		const index = this.laneIndexInPath(this.annotations[this.activeAnnotationIndex].uuid)
		if (index === -1) {
			this.carPath.push(this.annotations[this.activeAnnotationIndex].uuid)
			this.annotations[this.activeAnnotationIndex].setTrajectory(this.carPathActivation)
			log.info("Lane added to the car path.")
		} else {
			this.annotations[this.activeAnnotationIndex].setTrajectory(false)
			this.carPath.splice(index, 1)
			log.info("Lane removed from the car path.")
		}

		this.metadataState.dirty()
		return true
	}

	deleteLaneFromPath(): boolean {
		if (this.isLiveMode) return false

		if (this.activeAnnotationIndex === -1) {
			log.error('No lane is active.')
			return false
		}

		const index = this.laneIndexInPath(this.annotations[this.activeAnnotationIndex].uuid)
		if (index !== -1) {
			this.annotations[index].setTrajectory(false)
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
			const index = this.annotations.findIndex((annotation) => {
				return annotation.uuid === uuid
			})
			if (index !== -1) {
				this.annotations[index].setTrajectory(this.carPathActivation)
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
			this.annotations.forEach((annotation) => {
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
			this.annotations.forEach((annotation) => {
				annotation.unsetLiveMode()
			})
			this.isLiveMode = false
		}
	}

	/**
	 * Gets lane index given the list of lanes and the id of the desired lane
	 * @param lanes List of lanes
	 * @param uuid  Desired lane id
	 * @returns Lane index, or -1 if lane id not found
	 */
	getLaneIndexFromUuid(lanes: Array<LaneAnnotation>, uuid: LaneUuid): number {
		return lanes.findIndex((item) => {
			return item.uuid === uuid
		})
	}

	/**
	 * Checks if the given is within a list of given ids
	 * @param laneUuids  List of ids
	 * @param uuid       Desired id
	 * @returns True if the id is within the list, false otherwise
	 */
	checkLaneUuidInList(laneUuids: Array<LaneUuid>, uuid: LaneUuid): boolean {
		return laneUuids.findIndex((laneUuid) => {
				return laneUuid === uuid
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
				this.checkLaneUuidInList(this.carPath, neighbor)) {
				return this.getLaneIndexFromUuid(this.annotations, neighbor)
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

				const frontLane = this.annotations[this.getLaneIndexFromUuid(this.annotations, neighbor)]
				const frontLaneNeighbors = frontLane.neighborsIds
				if (frontLaneNeighbors.right !== null &&
					this.checkLaneUuidInList(this.carPath, frontLaneNeighbors.right)) {
					return this.getLaneIndexFromUuid(this.annotations, frontLaneNeighbors.right)
				}

				if (frontLaneNeighbors.left !== null &&
					this.checkLaneUuidInList(this.carPath, frontLaneNeighbors.left)) {
					return this.getLaneIndexFromUuid(this.annotations, frontLaneNeighbors.left)
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
		newLink.index = this.getLaneIndexFromUuid(this.annotations, this.carPath[0])
		newLink.type = LinkType.FORWARD
		trajectoryAsOrderedLaneIndices.push(newLink)
		while (newLink.index !== -1 &&
		trajectoryAsOrderedLaneIndices.length <= this.carPath.length) {

			// Try to go straight
			const neighbors = this.annotations[newLink.index].neighborsIds
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
				if (laneIndex === null || laneIndex < 0 || laneIndex >= this.annotations.length) {
					dialog.showErrorBox(EM.ET_TRAJECTORY_GEN_FAIL,
						"Sorted car path contains invalid index: " + laneIndex)
					points = []
					hasValidIndexes = false
				}

				if (points.length > 0) {
					// If side link: make sure there is enough distance between first point of the link
					// and previous link last point added
					if (laneLink.type === LinkType.SIDE) {
						const firstPoint = this.annotations[laneIndex].laneMarkers[0].position.clone()
						firstPoint.add(this.annotations[laneIndex].laneMarkers[1].position).divideScalar(2)
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

				const lane: LaneAnnotation = this.annotations[laneIndex]
				for (let i = 0; i < lane.laneMarkers.length - 1; i += 2) {
					const waypoint = lane.laneMarkers[i].position.clone()
					waypoint.add(lane.laneMarkers[i + 1].position).divideScalar(2)
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

	/**
	 * Check if the passed mesh corresponds to an inactive lane
	 * annotation. If so, return it's index in the manager.
	 */
	checkForInactiveAnnotation(object: THREE.Mesh): number {
		let index = this.getAnnotationIndex(object)
		if (index === this.activeAnnotationIndex) {
			index = -1
		}
		return index
	}

	/**
	 * Activate (i.e. make editable), the annotation indexed by the
	 * given index.
	 */
	changeActiveAnnotation(annotationIndex: number): boolean {
		if (this.isLiveMode) return false

		if (annotationIndex < 0 &&
			annotationIndex >= this.annotations.length &&
			annotationIndex === this.activeAnnotationIndex) {
			return false
		}

		if (this.activeAnnotationIndex >= 0) {
			this.annotations[this.activeAnnotationIndex].makeInactive()
		}

		this.activeAnnotationIndex = annotationIndex
		this.annotations[this.activeAnnotationIndex].makeActive()
		this.activeMarkers = this.annotations[this.activeAnnotationIndex].laneMarkers

		return true
	}

	/**
	 * Make the last annotation in the manager the "active" one.
	 */
	makeLastAnnotationActive(): boolean {
		return this.changeActiveAnnotation(this.annotations.length - 1)
	}

	/**
	 * Add a new lane annotation and add its mesh to the scene for display.
	 */
	addLaneAnnotation(scene: THREE.Scene, obj?: LaneAnnotationInterface): THREE.Box3 | null {
		if (this.isLiveMode) return null

		if (obj) {
			// Create an annotation with data
			this.annotations.push(new LaneAnnotation(obj))
		} else {
			// Create a clean annotation
			this.annotations.push(new LaneAnnotation())
			this.annotations[this.annotations.length - 1].setType(AnnotationType.LANE)
		}
		const newAnnotationIndex = this.annotations.length - 1
		const mesh = this.annotations[newAnnotationIndex].laneMesh
		this.annotationMeshes.push(mesh)
		scene.add(this.annotations[newAnnotationIndex].laneRenderingObject)
		mesh.geometry.computeBoundingBox()
		return mesh.geometry.boundingBox
	}

	addTrafficSignAnnotation(scene: THREE.Scene): void {
		this.trafficSignAnnotations.push(new TrafficSign())
		const newAnnotationIndex = this.trafficSignAnnotations.length - 1
		this.activeTrafficSignAnnotationIndex = newAnnotationIndex
		scene.add(this.trafficSignAnnotations[newAnnotationIndex].renderingObject)
	}


	/**
	 * Delete given lane annotation
	 */
	private deleteLaneAnnotation(scene: THREE.Scene, lane: LaneAnnotation): boolean {
		// Remove lane from scene.
		scene.remove(lane.laneRenderingObject)

		// Remove mesh from internal array of meshes.
		const index = this.annotationMeshes.findIndex((mesh) => {
			return mesh === lane.laneMesh
		})
		if (index < 0) {
			log.error("Couldn't find associated mesh in internal mesh array. This should never happen")
			return false
		}
		this.annotationMeshes.splice(index, 1)

		// Make sure we remove references to this annotation from it's neighbors (if any).
		this.deleteConnectionToNeighbors(scene, lane)

		// Remove annotation from internal array of annotations.
		const laneIndex = this.getLaneIndexFromUuid(this.annotations, lane.uuid)
		this.annotations.splice(laneIndex, 1)

		this.metadataState.dirty()
		return true
	}

	/**
	 * Eliminate the current active annotation from the manager. Delete its associated
	 * mesh and markers from the scene and reset any active annotation variables.
	 */
	deleteActiveAnnotation(scene: THREE.Scene): boolean {
		if (this.isLiveMode) return false

		if (this.activeAnnotationIndex < 0) {
			log.warn("Can't delete active annotation. No active annotation selected.")
			return false
		}

		// Delete lane annotation
		this.deleteLaneAnnotation(scene, this.annotations[this.activeAnnotationIndex])

		// Reset active markers and active annotation index.
		this.activeAnnotationIndex = -1
		this.activeMarkers = []

		this.metadataState.dirty()
		return true
	}

	/**
	 * Add lane marker to the active annotation at the given position and add it
	 * to the scene. After the first two markers of a new annotation this function
	 * will add two markers subsequently. The second of those markers is computed
	 * as a linear combination of the first marker (given position) and the
	 * previous two markers.
	 */
	addLaneMarker(x: number, y: number, z: number): boolean {
		if (this.isLiveMode) return false
		if (this.activeAnnotationIndex < 0) {
			log.info("No active annotation. Can't add marker")
			return false
		}
		this.annotations[this.activeAnnotationIndex].addMarker(x, y, z)

		this.metadataState.dirty()
		return true
	}


	addTrafficSignMarker(position: THREE.Vector3, isLastMarker: boolean): void {
		this.trafficSignAnnotations[this.activeTrafficSignAnnotationIndex].addMarker(position, isLastMarker)
	}

	/**
	 * Remove last marker from the annotation. The marker is also removed from
	 * the scene.
	 */
	deleteLastLaneMarker(): boolean {
		if (this.isLiveMode) return false
		if (this.activeAnnotationIndex < 0) {
			log.info("No active annotation. Can't delete marker")
			return false
		}
		this.annotations[this.activeAnnotationIndex].deleteLast()

		this.metadataState.dirty()
		return true
	}

	/**
	 * Update the mesh of the active annotation. This is used if the lane marker positions
	 * where changed externally (e.g. by the transform controls)
	 */
	updateActiveLaneMesh(): void {
		if (this.activeAnnotationIndex < 0) {
			log.info("No active annotation. Can't update mesh")
			return
		}
		this.annotations[this.activeAnnotationIndex].updateVisualization()
	}

	/*
	 * Draw the markers a little larger.
	 */
	highlightMarkers(markers: Array<THREE.Mesh>): void {
		const active = this.getActiveAnnotation()
		if (active)
			active.highlightMarkers(markers)
	}

	/*
	 * Draw all markers at normal size.
	 */
	unhighlightMarkers(): void {
		const active = this.getActiveAnnotation()
		if (active)
			active.unhighlightMarkers()
	}

	/*
	 * Get all markers that share a lane edge with the origin, up to a given distance in either direction.
	 * Distance is a count of markers, not a physical distance.
	 * Origin is not included in the result.
	 * Sort order is not specified.
	 */
	neighboringLaneMarkers(origin: THREE.Mesh, distance: number): Array<THREE.Mesh> {
		const active = this.getActiveAnnotation()
		return active
			? active.neighboringLaneMarkers(origin, distance)
			: []
	}

	/**
	 * Create a new lane annotation connected to the current active annotation at the given location and with
	 * the given direction of traffic. The new annotation is added to the scene for display and set as
	 * inactive.
	 */
	addConnectedLaneAnnotation(scene: THREE.Scene, neighborLocation: NeighborLocation, neighborDirection: NeighborDirection): boolean {
		if (this.isLiveMode) return false

		if (this.activeAnnotationIndex < 0) {
			log.info("Can't add connected lane. No annotation is active.")
			return false
		}

		switch (neighborLocation) {
			case NeighborLocation.FRONT:
				return this.addFrontConnection(scene)
			case NeighborLocation.LEFT:
				return this.addLeftConnection(scene, neighborDirection)
			case NeighborLocation.RIGHT:
				return this.addRightConnection(scene, neighborDirection)
			case NeighborLocation.BACK:
				log.info("Adding back connection is not supported")
				return false
			default:
				log.warn("Unrecognized neighbor location")
				return false
		}
	}

	// Get the file-format version of a saved annotation.
	private static annotationsFileVersion(data: Object): number {
		let version = parseInt(data['version'], 10)
		if (isNaN(version))
			return 1
		else
			return version
	}

	/**
	 * This expects the serialized UtmCrs structure produced by toJSON().
	 */
	private checkCoordinateSystem(data: Object, version: number): boolean {
		const crs = data['coordinateReferenceSystem']
		if (crs['coordinateSystem'] !== 'UTM') return false
		if (crs['datum'] !== this.datum) return false
		let num: number
		let northernHemisphere: boolean
		if (version === 1) {
			// Files generated under this version, in late 2017, were marked with MGRS zone 18S regardless
			// of whether the data came from DC or SF. We have no way of knowing the difference. Assume SF.
			num = 10
			northernHemisphere = true
		} else {
			if (isNullOrUndefined(crs['parameters']['utmZoneNumber']))
				return false
			num = crs['parameters']['utmZoneNumber']
			if (isNullOrUndefined(crs['parameters']['utmZoneNorthernHemisphere']))
				return false
			northernHemisphere = !!crs['parameters']['utmZoneNorthernHemisphere']
		}

		if (!data['annotations']) return false
		// generate an arbitrary offset for internal use, given the first point in the data set
		let first: THREE.Vector3 | null = null
		// and round off the values for nicer debug output
		const trunc = function (x: number): number {return Math.trunc(x / 10) * 10}
		for (let i = 0; !first && i < data['annotations'].length; i++) {
			const annotation = data['annotations'][i]
			if (annotation['markerPositions'] && annotation['markerPositions'].length > 0) {
				const pos = annotation['markerPositions'][0]
				first = new THREE.Vector3(trunc(pos['E']), trunc(pos['N']), trunc(pos['alt']))
			}
		}
		if (!first) return false

		return this.setOrigin(num, northernHemisphere, first) ||
			this.utmZoneNumber === num && this.utmZoneNorthernHemisphere === northernHemisphere
	}

	/**
	 * Convert markerPositions from UTM objects to vectors in local coordinates, for downstream consumption.
	 */
	private convertCoordinates(data: Object): void {
		data['annotations'].forEach((annotation: any) => {
			if (annotation['markerPositions']) {
				for (let i = 0; i < annotation['markerPositions'].length; i++) {
					const pos = annotation['markerPositions'][i]
					annotation['markerPositions'][i] = this.utmToThreeJs(pos['E'], pos['N'], pos['alt'])
					// This is a hack to elevate the annotations above ground (for display purposes)
					annotation['markerPositions'][i].y += 0.2
				}
			}
		})
	}

	/**
	 * Load annotations from file. Store all annotations and add them to the Annotator scene.
	 * This requires UTM as the input format.
	 * @returns NULL or the center point of the bottom of the bounding box of the data; hopefully
	 *   there will be something to look at there
	 */
	loadAnnotationsFromFile(fileName: string, scene: THREE.Scene): Promise<THREE.Vector3 | null> {
		if (this.isLiveMode) return Promise.reject(new Error("can't load annotations while in live presentation mode"))

		const self = this
		return new Promise((resolve: (value: THREE.Vector3 | null) => void, reject: (reason: Error) => void): void => {
			AsyncFile.readFile(fileName, 'ascii').then((text: string) => {
				const data = JSON.parse(text)
				const version = AnnotationManager.annotationsFileVersion(data)
				if (self.checkCoordinateSystem(data, version)) {
					self.convertCoordinates(data)
					let boundingBox = new THREE.Box3()
					// Each element is an annotation
					data['annotations'].forEach((element: any) => {
						const box = self.addLaneAnnotation(scene, element)
						if (box) boundingBox = boundingBox.union(box)
					})
					self.metadataState.clean()
					if (boundingBox.isEmpty()) {
						resolve(null)
					} else {
						resolve(boundingBox.getCenter().setY(boundingBox.min.y))
					}
				} else {
					const zoneId = version === 1
						? `${data['coordinateReferenceSystem']['parameters']['utmZoneNumber']}${data['coordinateReferenceSystem']['parameters']['utmZoneLetter']}`
						: `${data['coordinateReferenceSystem']['parameters']['utmZoneNumber']}${data['coordinateReferenceSystem']['parameters']['utmZoneNorthernHemisphere']}`
					reject(Error(`UTM Zone for new annotations (${zoneId}) does not match existing zone in ${self.getOrigin()}`))
				}
			})
		})
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
		if (this.annotations.length === 0) {
			return Promise.reject(new Error('failed to save empty set of annotations'))
		}
		if (!this.hasOrigin() && !config.get('output.annotations.debug.allow_annotations_without_utm_origin')) {
			return Promise.reject(new Error('failed to save annotations: UTM origin is not set'))
		}
		const self = this
		const dirName = fileName.substring(0, fileName.lastIndexOf("/"))
		const writeFile = function (er: Error): Promise<void> {
			if (er) {
				return Promise.reject(er)
			} else {
				const strAnnotations = JSON.stringify(self.toJSON(format))
				return AsyncFile.writeTextFile(fileName, strAnnotations)
					.then(() => self.metadataState.clean())
			}
		}
		return mkdirp(dirName, writeFile)
	}

	private threeJsToUtmJsonObject(): (p: THREE.Vector3) => Object {
		const self = this
		return function (p: THREE.Vector3): Object {
			const utm = self.threeJsToUtm(p)
			return {'E': utm.x, 'N': utm.y, 'alt': utm.z}
		}
	}

	private threeJsToLlaJsonObject(): (p: THREE.Vector3) => Object {
		const self = this
		return function (p: THREE.Vector3): Object {
			const lngLatAlt = self.threeJsToLngLatAlt(p)
			return {'lng': lngLatAlt.x, 'lat': lngLatAlt.y, 'alt': lngLatAlt.z}
		}
	}

	toJSON(format: OutputFormat): AnnotationManagerJsonInterface {
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
		const data: AnnotationManagerJsonInterface = {
			version: 2,
			created: new Date().toISOString(),
			coordinateReferenceSystem: crs,
			annotations: [],
		}

		this.annotations.forEach((annotation) => {
			data.annotations = data.annotations.concat(annotation.toJSON(pointConverter))
		})

		return data
	}

	saveAndExportToKml(jar: string, main: string, input: string, output: string): Promise<void> {
		const exportToKml = (): void => {
			const command = [jar, main, input, output].join(' ')
			log.debug('executing child process: ' + command)
			const exec = require('child_process').exec
			exec(command, (error: Error | null, stdout: string, stderr: string) => {
				if (error) {
					log.error(`exec error: ${error}`)
					return
				}
				if (stdout) log.debug(`stdout: ${stdout}`)
				if (stderr) log.debug(`stderr: ${stderr}`)
			})
		}

		return this.saveAnnotationsToFile(input, OutputFormat.LLA)
			.then(() => exportToKml())
			.catch(error => log.warn('save-to-JSON failed for KML conversion; aborting: ' + error.message))
	}

	saveToKML(fileName: string): Promise<void> {
		// Get all the points
		let points: Array<THREE.Vector3> = []
		this.annotations.forEach((annotation) => {
			points = points.concat(annotation.waypoints)
		})

		// Convert points to lat lon
		const geopoints: Array<THREE.Vector3> = []
		points.forEach((p) => {
			geopoints.push(this.threeJsToLngLatAlt(p))
		})

		// Save file
		const kml = new SimpleKML()
		kml.addPath(geopoints)
		return kml.saveToFile(fileName)
	}

	/**
	 * Adds a new lane annotation and initializes it's first two points to be the last two points of
	 * the current active annotation and it's next two points to be an extension in the direction of
	 * the last four points of the current active annotation.
	 */
	private addFrontConnection(scene: THREE.Scene): boolean {
		this.addLaneAnnotation(scene)
		const newAnnotationIndex = this.annotations.length - 1

		if (this.activeMarkers.length < 4) {
			log.warn("Current active lane doesn't have an area. Can't add neighbor")
			return false
		}

		const lastMarkerIndex = this.activeMarkers.length - 1
		const direction1 = new THREE.Vector3()
		const direction2 = new THREE.Vector3()
		direction1.subVectors(
			this.activeMarkers[lastMarkerIndex - 1].position,
			this.activeMarkers[lastMarkerIndex - 3].position
		)
		direction2.subVectors(
			this.activeMarkers[lastMarkerIndex].position,
			this.activeMarkers[lastMarkerIndex - 2].position
		)
		const thirdMarkerPosition = new THREE.Vector3()
		const fourthMarkerPosition = new THREE.Vector3()
		thirdMarkerPosition.addVectors(this.activeMarkers[lastMarkerIndex - 1].position, direction1)
		fourthMarkerPosition.addVectors(this.activeMarkers[lastMarkerIndex].position, direction2)

		this.annotations[newAnnotationIndex].addRawMarker(this.activeMarkers[lastMarkerIndex - 1].position)
		this.annotations[newAnnotationIndex].addRawMarker(this.activeMarkers[lastMarkerIndex].position)
		this.annotations[newAnnotationIndex].addRawMarker(thirdMarkerPosition)
		this.annotations[newAnnotationIndex].addRawMarker(fourthMarkerPosition)

		this.annotations[newAnnotationIndex].addNeighbor(this.annotations[this.activeAnnotationIndex].uuid, NeighborLocation.BACK)
		this.annotations[this.activeAnnotationIndex].addNeighbor(this.annotations[newAnnotationIndex].uuid, NeighborLocation.FRONT)

		this.annotations[newAnnotationIndex].updateVisualization()
		this.annotations[newAnnotationIndex].makeInactive()

		this.metadataState.dirty()
		return true
	}

	/**
	 * Adds a new lane annotation to the left of the current active annotation. It initializes its
	 * lane markers as a mirror of the active annotation. The order of the markers depends on the
	 * given direction of the neighbor.
	 * @param scene
	 * @param neighborDirection [SAME, REVERSE]
	 */
	private addLeftConnection(scene: THREE.Scene, neighborDirection: NeighborDirection): boolean {

		if (this.annotations[this.activeAnnotationIndex].neighborsIds.left != null) {
			log.warn('This lane already has a neighbor to the LEFT. Aborting new connection.')
			return false
		}

		this.addLaneAnnotation(scene)
		const newAnnotationIndex = this.annotations.length - 1

		switch (neighborDirection) {

			case NeighborDirection.SAME:
				for (let i = 0; i < this.activeMarkers.length; i += 2) {
					const rightMarkerPosition = this.activeMarkers[i + 1].position.clone()
					const direction = new THREE.Vector3()
					direction.subVectors(this.activeMarkers[i].position, rightMarkerPosition)
					const leftMarkerPosition = new THREE.Vector3()
					leftMarkerPosition.subVectors(rightMarkerPosition, direction)
					this.annotations[newAnnotationIndex].addRawMarker(rightMarkerPosition)
					this.annotations[newAnnotationIndex].addRawMarker(leftMarkerPosition)
				}

				// Record connection
				this.annotations[newAnnotationIndex].addNeighbor(this.annotations[this.activeAnnotationIndex].uuid, NeighborLocation.RIGHT)
				this.annotations[this.activeAnnotationIndex].addNeighbor(this.annotations[newAnnotationIndex].uuid, NeighborLocation.LEFT)

				break

			case NeighborDirection.REVERSE:
				for (let i = this.activeMarkers.length - 1; i >= 0; i -= 2) {
					const leftMarkerPosition = this.activeMarkers[i].position.clone()
					const direction = new THREE.Vector3()
					direction.subVectors(this.activeMarkers[i - 1].position, leftMarkerPosition)
					const rightMarkerPosition = new THREE.Vector3()
					rightMarkerPosition.subVectors(leftMarkerPosition, direction)
					this.annotations[newAnnotationIndex].addRawMarker(rightMarkerPosition)
					this.annotations[newAnnotationIndex].addRawMarker(leftMarkerPosition)
				}

				// Record connection
				this.annotations[newAnnotationIndex].addNeighbor(this.annotations[this.activeAnnotationIndex].uuid, NeighborLocation.LEFT)
				this.annotations[this.activeAnnotationIndex].addNeighbor(this.annotations[newAnnotationIndex].uuid, NeighborLocation.LEFT)

				break

			default:
				log.warn('Unrecognized neighbor direction.')
				return false
		}

		this.annotations[newAnnotationIndex].updateVisualization()
		this.annotations[newAnnotationIndex].makeInactive()

		this.metadataState.dirty()
		return true
	}

	/**
	 * Adds a new lane annotation to the right of the current active annotation. It initializes its
	 * lane markers as a mirror of the active annotation. The order of the markers depends on the
	 * given direction of the neighbor.
	 * @param scene
	 * @param neighborDirection [SAME,REVERSE]
	 */
	private addRightConnection(scene: THREE.Scene, neighborDirection: NeighborDirection): boolean {
		if (this.annotations[this.activeAnnotationIndex].neighborsIds.right != null) {
			log.warn('This lane already has a neighbor to the RIGHT. Aborting new connection.')
			return false
		}

		this.addLaneAnnotation(scene)
		const newAnnotationIndex = this.annotations.length - 1

		switch (neighborDirection) {

			case NeighborDirection.SAME:
				for (let i = 0; i < this.activeMarkers.length; i += 2) {
					const leftMarkerPosition = this.activeMarkers[i].position.clone()
					const direction = new THREE.Vector3()
					direction.subVectors(this.activeMarkers[i + 1].position, leftMarkerPosition)
					const rightMarkerPosition = new THREE.Vector3()
					rightMarkerPosition.subVectors(leftMarkerPosition, direction)
					this.annotations[newAnnotationIndex].addRawMarker(rightMarkerPosition)
					this.annotations[newAnnotationIndex].addRawMarker(leftMarkerPosition)
				}

				// Record connection
				this.annotations[newAnnotationIndex].addNeighbor(this.annotations[this.activeAnnotationIndex].uuid, NeighborLocation.LEFT)
				this.annotations[this.activeAnnotationIndex].addNeighbor(this.annotations[newAnnotationIndex].uuid, NeighborLocation.RIGHT)

				break

			case NeighborDirection.REVERSE:
				for (let i = this.activeMarkers.length - 1; i >= 0; i -= 2) {
					const rightMarkerPosition = this.activeMarkers[i - 1].position.clone()
					const direction = new THREE.Vector3()
					direction.subVectors(this.activeMarkers[i].position, rightMarkerPosition)
					const leftMarkerPosition = new THREE.Vector3()
					leftMarkerPosition.subVectors(rightMarkerPosition, direction)
					this.annotations[newAnnotationIndex].addRawMarker(rightMarkerPosition)
					this.annotations[newAnnotationIndex].addRawMarker(leftMarkerPosition)
				}

				// Record connection
				this.annotations[newAnnotationIndex].addNeighbor(this.annotations[this.activeAnnotationIndex].uuid, NeighborLocation.RIGHT)
				this.annotations[this.activeAnnotationIndex].addNeighbor(this.annotations[newAnnotationIndex].uuid, NeighborLocation.RIGHT)

				break

			default:
				log.warn('Unrecognized neighbor direction.')
				return false
		}

		this.annotations[newAnnotationIndex].updateVisualization()
		this.annotations[newAnnotationIndex].makeInactive()

		this.metadataState.dirty()
		return true
	}

	private findAnnotationIndexByUuid(uuid: LaneUuid): number {
		return this.annotations.findIndex((annotation) => {
			return annotation.uuid === uuid
		})
	}

	private deleteConnectionToNeighbors(scene: THREE.Scene, annotation: LaneAnnotation): void {
		let modifications = 0

		if (annotation.neighborsIds.right != null) {
			const index = this.findAnnotationIndexByUuid(annotation.neighborsIds.right)
			if (index < 0) {
				log.error("Couldn't find right neighbor. This should never happen.")
			}
			const rightNeighbor = this.annotations[index]

			if (rightNeighbor.neighborsIds.right === annotation.uuid) {
				log.info("Deleted connection to right neighbor.")
				rightNeighbor.neighborsIds.right = null
				modifications++
			} else if (rightNeighbor.neighborsIds.left === annotation.uuid) {
				log.info("Deleted connection to right neighbor.")
				rightNeighbor.neighborsIds.left = null
				modifications++
			} else {
				log.error("Non-reciprocal neighbor relation detected. This should never happen.")
			}
		}

		if (annotation.neighborsIds.left != null) {
			const index = this.findAnnotationIndexByUuid(annotation.neighborsIds.left)
			if (index < 0) {
				log.error("Couldn't find left neighbor. This should never happen.")
			}
			const leftNeighbor = this.annotations[index]

			if (leftNeighbor.neighborsIds.right === annotation.uuid) {
				log.info("Deleted connection to left neighbor.")
				leftNeighbor.neighborsIds.right = null
				modifications++
			} else if (leftNeighbor.neighborsIds.left === annotation.uuid) {
				log.info("Deleted connection to left neighbor.")
				leftNeighbor.neighborsIds.left = null
				modifications++
			} else {
				log.error("Non-reciprocal neighbor relation detected. This should never happen.")
			}
		}

		for (let i = 0; i < annotation.neighborsIds.front.length; i++) {
			const index = this.findAnnotationIndexByUuid(annotation.neighborsIds.front[i])
			if (index < 0) {
				log.error("Couldn't find front neighbor. This should never happen.")
			}
			const frontNeighbor = this.annotations[index]

			const index2 = frontNeighbor.neighborsIds.back.findIndex((uuid) => {
				return uuid === annotation.uuid
			})
			if (index2 >= 0) {
				// delete the forward connection
				log.info("Deleted connection to front neighbor.")
				frontNeighbor.neighborsIds.back.splice(index2, 1)
				if (annotation.type === AnnotationType.LANE &&
					frontNeighbor.type === AnnotationType.CONNECTION) {
					// delete the connection LANE
					this.deleteLaneAnnotation(scene, frontNeighbor)
				}
				modifications++
			}
		}

		for (let i = 0; i < annotation.neighborsIds.back.length; i++) {
			const index = this.findAnnotationIndexByUuid(annotation.neighborsIds.back[i])
			if (index < 0) {
				log.error("Couldn't find back neighbor. This should never happen.")
			}
			const backNeighbor = this.annotations[index]

			const index2 = backNeighbor.neighborsIds.front.findIndex((uuid) => {
				return uuid === annotation.uuid
			})
			if (index2 >= 0) {
				// delete the backward connection
				log.info("Deleted connection to back neighbor.")
				backNeighbor.neighborsIds.front.splice(index2, 1)
				if (annotation.type === AnnotationType.LANE &&
					backNeighbor.type === AnnotationType.CONNECTION) {
					// delete the backward connection LANE
					this.deleteLaneAnnotation(scene, backNeighbor)
				}
				modifications++
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
		return this.autoSaveEnabled && this.isDirty && this.annotationManager.annotations.length > 0
	}

	private doImmediateSave(): boolean {
		return this.isDirty && this.annotationManager.annotations.length > 0
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
