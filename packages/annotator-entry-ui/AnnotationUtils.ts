/**
 *  Copyright 2017 Mapper Inc. Part of the mapper-annotator project.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

const config = require('../config')
const vsprintf = require("sprintf-js").vsprintf
import * as THREE from 'three'
import {
	LaneAnnotation, LaneAnnotationInterface, NeighborDirection,
	NeighborLocation, AnnotationType
} from 'annotator-entry-ui/LaneAnnotation'
import {SuperTile} from "annotator-entry-ui/TileUtils"
import {SimpleKML} from 'annotator-entry-ui/KmlUtils'
import * as EM from 'annotator-entry-ui/ErrorMessages'
import * as TypeLogger from 'typelogger'
import * as AsyncFile from 'async-file'
import * as MkDirP from 'mkdirp'
import Vector3 = THREE.Vector3
import {UtmInterface} from "./UtmInterface"
import * as CRS from "./CoordinateReferenceSystem"

TypeLogger.setLoggerOutput(console as any)
const log = TypeLogger.getLogger(__filename)
const {dialog} = require('electron').remote

enum LinkType {
	FORWARD = 1,
	SIDE = 2,
	OTHER = 3
}
class Link {
	index : number
	type : LinkType
	
	constructor() {
		this.index = -1
		this.type = LinkType.OTHER
	}
}

export enum OutputFormat {
	UTM = 1,
	LLA = 2,
}

interface AnnotationManagerInterface {
	coordinateReferenceSystem: CRS.CoordinateReferenceSystem
	annotations: Array<LaneAnnotationInterface>
}

/**
 * The AnnotationManager is in charge of maintaining a set of annotations and all operations
 * to modify, add or delete them. It also keeps an index to the "active" annotation as well
 * as it's markers. The "active" annotation is the only one that can be modified.
 */
export class AnnotationManager extends UtmInterface {
	datum: string = 'WGS84'
	annotations : Array<LaneAnnotation>
	annotationMeshes : Array<THREE.Mesh>
	activeMarkers : Array<THREE.Mesh>
	activeAnnotationIndex : number
	carPath : Array<number>
	carPathActivation : boolean
	metadataState: AnnotationState

	constructor() {
		super()
		this.annotations = []
		this.annotationMeshes = []
		this.activeMarkers = []
		this.activeAnnotationIndex = -1
		this.carPath = []
		this.carPathActivation = false
		this.metadataState = new AnnotationState(this)
	}

	toString(): string {
		let offsetStr
		if (this.offset === undefined) {
			offsetStr = 'undefined'
		} else {
			offsetStr = this.offset.x + ',' + this.offset.y + ',' + this.offset.z
		}
		return 'AnnotationManager(UTM Zone: ' + this.utmZoneNumber + this.utmZoneLetter + ', offset: [' + offsetStr + '])';
	}

	/**
	 * Get the index of the annotation associated with the given mesh.
	 * @param object
	 * @returns {number}
	 */
	getAnnotationIndex(object : THREE.Mesh) : number {
		return this.annotations.findIndex( (element) => {
			return element.laneMesh === object
		})
	}

	/**
 	 * Get current active annotation
	 */
	getActiveAnnotation() {

		if (this.activeAnnotationIndex < 0 &&
			this.activeAnnotationIndex >= this.annotations.length) {
			return null;
		}

		return this.annotations[this.activeAnnotationIndex];
	}

	/**
	 * Get all existing ids
	 */
	getValidIds() {
		let list = [];
		for (let i = 0; i < this.annotations.length; ++i) {
			if (this.annotations[i].type === AnnotationType.LANE) {
				list.push(this.annotations[i].id);
			}
		}
		return list;
	}
	
	/**
	 * Get point in between at a specific distance
	 * @param marker1
	 * @param marker2
	 * @param atDistance
	 * @returns {Vector3}
	 */
	getMarkerInBetween(marker1 : Vector3, marker2 : Vector3, atDistance : number) : Vector3 {
		return marker2.clone().sub(marker1).multiplyScalar(atDistance).add(marker1)
	}
	
	/**
	 * Create a new lane connection between given lanes
	 * @param laneFrom
	 * @param laneTo
	 */
	addForwardLaneConnection(scene:THREE.Scene, laneFrom : LaneAnnotation, laneTo : LaneAnnotation) {

		if (laneFrom.laneMarkers.length < 4 || laneTo.laneMarkers.length < 4) {
			dialog.showErrorBox(EM.ET_RELATION_ADD_FAIL, "Unable to generate forward relation." +
			"Possible reasons: one of the two lanes connected does not have at least 4 markers.")
			return
		}

		// Create new connection
		let connection = new LaneAnnotation()
		connection.setType(AnnotationType.CONNECTION)
		this.annotations.push(connection)

		// Glue neighbors
		connection.neighborsIds.front.push(laneTo.id)
		connection.neighborsIds.back.push(laneFrom.id)
		laneFrom.neighborsIds.front.push(connection.id)
		laneTo.neighborsIds.back.push(connection.id)

		// Compute path
		let last_index = laneFrom.laneMarkers.length - 1
		let points_right : Array<Vector3> = []
		points_right.push(laneFrom.laneMarkers[last_index - 3].position)
		points_right.push(laneFrom.laneMarkers[last_index - 1].position)
		points_right.push(laneTo.laneMarkers[0].position)
		points_right.push(laneTo.laneMarkers[2].position)
		let points_left : Array<Vector3> = []
		points_left.push(laneFrom.laneMarkers[last_index - 2].position)
		points_left.push(laneFrom.laneMarkers[last_index].position)
		points_left.push(laneTo.laneMarkers[1].position)
		points_left.push(laneTo.laneMarkers[3].position)
		
		let spline_left = new THREE.CatmullRomCurve3(points_left)
		let spline_right = new THREE.CatmullRomCurve3(points_right)

		// Add path to the connection
		connection.addRawMarker(this.getMarkerInBetween(points_right[1], points_left[1], 0.4))
		connection.addRawMarker(this.getMarkerInBetween(points_right[1], points_left[1], 0.6))
		connection.addRawMarker(this.getMarkerInBetween(spline_right.getPoint(0.45), spline_left.getPoint(0.45), 0.4))
		connection.addRawMarker(this.getMarkerInBetween(spline_right.getPoint(0.45), spline_left.getPoint(0.45), 0.6))
		connection.addRawMarker(this.getMarkerInBetween(spline_right.getPoint(0.55), spline_left.getPoint(0.55), 0.4))
		connection.addRawMarker(this.getMarkerInBetween(spline_right.getPoint(0.55), spline_left.getPoint(0.55), 0.6))
		connection.addRawMarker(this.getMarkerInBetween(points_right[2], points_left[2], 0.4))
		connection.addRawMarker(this.getMarkerInBetween(points_right[2], points_left[2], 0.6))
		
		// Add annotation to the scene
		this.annotationMeshes.push(connection.laneMesh)
		scene.add(connection.laneRenderingObject)
		connection.makeInactive()
		connection.updateVisualization()
	}

	/**
	 * Add a new relation between two existing lanes
	 */
	addRelation(scene : THREE.Scene, from_id : number, to_id : number, relation : string) {

		let lane_from = null;
		for (let annotation of this.annotations) {
			if (annotation.id === from_id) {
				lane_from = annotation;
				break;
			}
		}

		let lane_to = null;
		for (let annotation of this.annotations) {
			if (annotation.id === to_id) {
				lane_to = annotation;
				break;
			}
		}

		if (lane_to === null || lane_from === null) {
			dialog.showErrorBox(EM.ET_RELATION_ADD_FAIL, "Given lane ids are not valid.");
			return;
		}

		switch (relation) {
			case 'left':
				if (lane_from.neighborsIds.left === null &&
					lane_to.neighborsIds.right === null) {

					lane_from.neighborsIds.left = to_id;
					lane_to.neighborsIds.right = from_id;
				}
				else {
					dialog.showErrorBox(EM.ET_RELATION_ADD_FAIL, "Left relation already exist.")
				}
				break;
			case 'left reverse':
				if (lane_from.neighborsIds.left === null &&
					lane_to.neighborsIds.left === null) {

					lane_from.neighborsIds.left = to_id;
					lane_to.neighborsIds.left = from_id;
				}
				else {
					dialog.showErrorBox(EM.ET_RELATION_ADD_FAIL, "Left relation already exist.")
				}
				break;
			case 'right':
				if (lane_from.neighborsIds.right === null &&
					lane_to.neighborsIds.left === null) {

					lane_from.neighborsIds.right = to_id;
					lane_to.neighborsIds.left = from_id;
				}
				else {
					dialog.showErrorBox(EM.ET_RELATION_ADD_FAIL, "Right relation already exist.")
				}
				break;
			case 'front':
				let index_1 = lane_from.neighborsIds.front.findIndex((neighbor) => {
					return neighbor === lane_to.id
				})
				let index_2 = lane_to.neighborsIds.back.findIndex((neighbor) => {
					return neighbor === lane_from.id
				})
				if (index_1 === -1 && index_2 === -1) {
					// check if close enough
					let lane_from_pt = lane_from.laneMarkers[lane_from.laneMarkers.length-1].position
					let lane_to_pt = lane_to.laneMarkers[1].position
					if (lane_from_pt.distanceTo(lane_to_pt) < 1.0) {
						lane_to.neighborsIds.back.push(lane_from.id);
						lane_from.neighborsIds.front.push(lane_to.id);
					}
					else {
						// Connection lane needed
						this.addForwardLaneConnection(scene, lane_from, lane_to)
					}
				}
				else {
					dialog.showErrorBox(EM.ET_RELATION_ADD_FAIL, "Front relation already exist.")
				}
				break;
			case 'back':
				index_1 = lane_from.neighborsIds.back.findIndex((neighbor) => {
					return neighbor === lane_to.id
				})
				index_2 = lane_to.neighborsIds.front.findIndex((neighbor) => {
					return neighbor === lane_from.id
				})
				if (index_1 === -1 && index_2 === -1) {
					lane_from.neighborsIds.back.push(lane_to.id);
					lane_to.neighborsIds.front.push(lane_from.id);
				}
				else {
					dialog.showErrorBox(EM.ET_RELATION_ADD_FAIL, "Back relation already exist.")
				}
				break;
			default:
				dialog.showErrorBox(EM.ET_RELATION_ADD_FAIL, "Unknown relation to be added: " + relation);
				break;
		}
	}

	/**
	 * Add current lane to the car path
	 */
	laneIndexInPath(laneId : number) {
		return this.carPath.findIndex( (id) => {return laneId === id})
	}
	addLaneToPath() {

		if (this.activeAnnotationIndex === -1){
			log.error('No lane is active.');
			return;
		}
		
		// Check if lane already added
		let index = this.laneIndexInPath(this.annotations[this.activeAnnotationIndex].id)
		if (index === -1) {
			this.carPath.push(this.annotations[this.activeAnnotationIndex].id)
			this.annotations[this.activeAnnotationIndex].setTrajectory(this.carPathActivation)
			log.info("Lane added to the car path.")
		}
		else {
			this.annotations[this.activeAnnotationIndex].setTrajectory(false)
			this.carPath.splice(index, 1)
			log.info("Lane removed from the car path.")
		}
	}
	
	deleteLaneFromPath() {
		
		if (this.activeAnnotationIndex === -1){
			log.error('No lane is active.');
			return;
		}
		
		let index = this.laneIndexInPath(this.annotations[this.activeAnnotationIndex].id)
		if (index !== -1) {
			this.annotations[index].setTrajectory(false)
			this.carPath.splice(index, 1)
			log.info("Lane removed from the car path.")
		}
	}
	
	/**
	 * Show the car path in the visualizer
	 */
	showPath() : boolean{
	
		if (this.carPath.length === 0) {
			log.info("Empty car path.")
			return false
		}
		
		this.carPathActivation = !this.carPathActivation
		this.carPath.forEach((id) => {
			let index = this.annotations.findIndex( (annotation) => {
				return annotation.id === id
			})
			if (index !== -1) {
				this.annotations[index].setTrajectory(this.carPathActivation)
			}
			else {
				log.warn("Trajectory contains invalid lane id.")
			}
		})
		return true
	}

	/**
	 * Gets lane index given the list of lanes and the id of the desired lane
	 * @param lanes List of lanes
	 * @param id    Desired lane id
	 * @returns Lane index, or -1 if lane id not found
	 */
	getLaneIndexFromId(lanes : Array<LaneAnnotation>, id : number) : number {
		return lanes.findIndex( (item) => {
			return item.id === id
		})
	}
	
	/**
	 * Checks if the given is within a list of given ids
	 * @param laneIds  List of ids
	 * @param id       Desired id
	 * @returns True if the id is within the list, false otherwise
	 */
	checkLaneIdInList(laneIds : Array<number>, id : number) : boolean {
		return laneIds.findIndex( (lane_id) => {
			return lane_id === id
		}) !== -1
	}
	
	/**
	 * Tries to connect a forward lane with current lane
	 * @param neighbors   Current lane neighbors
	 * @returns Connected lane index from the list of annotations, or -1 if no connection found
	 */
	tryGoStraight(neighbors) : number {
		for (let neighbor of neighbors.front) {
			if (neighbor !== null &&
				this.checkLaneIdInList(this.carPath, neighbor)) {
				return this.getLaneIndexFromId(this.annotations, neighbor)
			}
		}
		return -1
	}
	
	/**
	 * Tries to connect a side-forward lane with the current lane
	 * @param neighbors Current lane neighbors
	 * @returns Connected lane index from the list of annotations, or -1 if no connection found
	 */
	tryGoSides(neighbors) : number {
		
		// Try left and right neighbors of the front lane
		for (let neighbor of neighbors.front) {
			
			// check for valid front neighbor
			if (neighbor !== null) {
				
				let front_lane = this.annotations[this.getLaneIndexFromId(this.annotations, neighbor)]
				let front_lane_neighbors = front_lane.neighborsIds
				if (front_lane_neighbors.right !== null &&
					this.checkLaneIdInList(this.carPath, front_lane_neighbors.right)) {
					return this.getLaneIndexFromId(this.annotations, front_lane_neighbors.right)
				}

				if (front_lane_neighbors.left !== null &&
					this.checkLaneIdInList(this.carPath, front_lane_neighbors.left)) {
					return this.getLaneIndexFromId(this.annotations, front_lane_neighbors.left)
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
	sortCarPath() : Array<Link> {
		let trajectory_as_ordered_lane_indices : Array<Link> = []
		let new_link : Link = new Link()
		new_link.index = this.getLaneIndexFromId(this.annotations, this.carPath[0])
		new_link.type = LinkType.FORWARD
		trajectory_as_ordered_lane_indices.push(new_link)
		while (new_link.index !== -1 &&
		       trajectory_as_ordered_lane_indices.length <= this.carPath.length) {
			
			// Try to go straight
			let neighbors = this.annotations[new_link.index].neighborsIds;
			let next_front_index = this.tryGoStraight(neighbors)
			if (next_front_index !== -1) {
				new_link = new Link()
				new_link.index = next_front_index
				new_link.type = LinkType.FORWARD
				trajectory_as_ordered_lane_indices.push(new_link)
				continue
			}
			
			// Try to go sides
			let next_side_index = this.tryGoSides(neighbors)
			if (next_side_index !== -1) {
				new_link = new Link()
				new_link.index = next_side_index
				new_link.type = LinkType.SIDE
				trajectory_as_ordered_lane_indices.push(new_link)
				continue
			}
			
			// If no valid next lane
			new_link = new Link()
			new_link.index = -1
			new_link.type = LinkType.OTHER
			trajectory_as_ordered_lane_indices.push(new_link)
		}
		
		return trajectory_as_ordered_lane_indices
	}
	
	/**
	 * Generate trajectory points from sorted lanes of the car path
	 * @param sorted_car_path       Trajectory sorted lanes
	 * @param min_dist_lane_change  Minimum distance to interpolate lane change
	 * @returns {Array<Vector3>} Points along the trajectory
	 */
	generatePointsFromSortedCarPath(sorted_car_path : Array<Link>, min_dist_lane_change : number) : Array<Vector3> {
		
		let points : Array<Vector3> = []
		sorted_car_path.forEach((lane_link) => {
			
			let lane_index : number = lane_link.index
			if (lane_index === null || lane_index < 0 || lane_index >= this.annotations.length) {
				dialog.showErrorBox(EM.ET_TRAJECTORY_GEN_FAIL,
					"Sorted car path contains invalid index: " + lane_index)
				return []
			}
			
			if (points.length > 0) {
				// If side link: make sure there is enough distance between first point of the link
				// and previous link last point added
				if (lane_link.type === LinkType.SIDE) {
					let first_pt = this.annotations[lane_index].laneMarkers[0].position.clone()
					first_pt.add(this.annotations[lane_index].laneMarkers[1].position).divideScalar(2)
					let distance:number = first_pt.distanceTo(points[points.length - 1])
					while (points.length > 0 && distance < min_dist_lane_change) {
						points.pop()
						distance = first_pt.distanceTo(points[points.length - 1])
					}
				}
				else {
					// Delete the last point from lane since this is usually duplicated at the
					// beginning of the next lane
					points.pop()
				}
			}
			
			let lane : LaneAnnotation = this.annotations[lane_index]
			for (let i = 0; i < lane.laneMarkers.length-1; i+=2) {
				let waypoint = lane.laneMarkers[i].position.clone()
				waypoint.add(lane.laneMarkers[i+1].position).divideScalar(2)
				points.push(waypoint)
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
	getFullInterpolatedTrajectory(step : number, minDistanceLaneChange : number) : Array<Vector3> {

		// Check for car path size (at least one lane)
		if (this.carPath.length === 0) {
			dialog.showErrorBox(EM.ET_TRAJECTORY_GEN_FAIL, "Empty car path.")
			return []
		}
		
		// Sort lanes
		let sorted_car_path : Array<Link> = this.sortCarPath()
		if (sorted_car_path.length !== this.carPath.length + 1) {
			dialog.showErrorBox(EM.ET_TRAJECTORY_GEN_FAIL,
				"Annotator failed to sort car path. Possible reasons: path may have gaps.")
			return []
		}
		
		// Take out last index
		sorted_car_path.pop()
		
		// Create spline
		let points : Array<Vector3> = this.generatePointsFromSortedCarPath(sorted_car_path, minDistanceLaneChange)
		if (points.length === 0) {
			dialog.showErrorBox(EM.ET_TRAJECTORY_GEN_FAIL,
				"There are no waypoints in the selected car path lanes.")
			return []
		}
		let spline = new THREE.CatmullRomCurve3(points)
		let numPoints = spline.getLength() / step

		// Generate trajectory from spline
		return spline.getSpacedPoints(numPoints)
	}

	/**
	 * Saves car path to CSV file
	 */
	convertAnnotationToCSV(args) : string {
		let data : Array<Vector3> = args.data || null;
		if (data.length === 0) {
			log.warn("Empty annotation.")
			return ''
		}
		
		let columnDelimiter = args.columnDelimiter || ',';
		let lineDelimiter = args.lineDelimiter || '\n';
		let result : string = ''
		data.forEach( (marker) => {
			// Get latitude longitude
			let lat_lng_pt = this.threeJsToLatLng(marker)
			result += lat_lng_pt.lng.toString();
			result += columnDelimiter;
			result += lat_lng_pt.lat.toString();
			result += lineDelimiter;
		});
		
		return result
	}

	saveCarPath(fileName: string) {
		let self = this
		let dirName = fileName.substring(0, fileName.lastIndexOf("/"))
		let writeFile = function (er, _) {
			if (!er) {
				let trajectory_data = self.getFullInterpolatedTrajectory(0.2, 5)
				// Debug only
				// self.annotations[0].tryTrajectory(trajectory_data)
				let strAnnotations = self.convertAnnotationToCSV({data : trajectory_data});
				AsyncFile.writeTextFile(fileName, strAnnotations)
			}
		}
		MkDirP.mkdirP(dirName, writeFile)
	}

	/**
	 * Check if the passed mesh corresponds to an inactive lane
	 * annotation. If so, return it's index in the manager.
	 * @param object
	 * @returns {number}
	 */
	checkForInactiveAnnotation(object : THREE.Mesh) : number {
		let index = this.getAnnotationIndex(object)
		if (index === this.activeAnnotationIndex) {
			index = -1
		}
		return index
	}
	
	/**
	 * Activate (i.e. make editable), the annotation indexed by the
	 * given index.
	 * @param annotationIndex
	 */
	changeActiveAnnotation(annotationIndex) {
		
		if (annotationIndex < 0 &&
			annotationIndex >= this.annotations.length &&
			annotationIndex === this.activeAnnotationIndex) {
			return
		}
		
		if (this.activeAnnotationIndex >= 0) {
			this.annotations[this.activeAnnotationIndex].makeInactive()
		}

		this.activeAnnotationIndex = annotationIndex
		this.annotations[this.activeAnnotationIndex].makeActive()
		this.activeMarkers = this.annotations[this.activeAnnotationIndex].laneMarkers
	}
	
	/**
	 * Make the last annotation in the manager the "active" one.
	 */
	makeLastAnnotationActive() {
		this.changeActiveAnnotation(this.annotations.length-1)
	}
	
	/**
    * Add a new lane annotation and add it's mesh to the scene for display.
    */
	addLaneAnnotation(scene: THREE.Scene, obj?: LaneAnnotationInterface): THREE.Box3 {
		if (obj) {
			// Create an annotation with data
			this.annotations.push(new LaneAnnotation(obj))
		} else {
			// Create a clean annotation
			this.annotations.push(new LaneAnnotation())
			this.annotations[this.annotations.length-1].setType(AnnotationType.LANE)
		}
		let newAnnotationIndex = this.annotations.length - 1
		const mesh = this.annotations[newAnnotationIndex].laneMesh
		this.annotationMeshes.push(mesh)
		scene.add(this.annotations[newAnnotationIndex].laneRenderingObject)
		mesh.geometry.computeBoundingBox()
		return mesh.geometry.boundingBox
	}
	
	/**
	 * Delete given lane annotation
	 * @param lane
	 */
	deleteLaneAnnotation(scene:THREE.Scene, lane : LaneAnnotation) {

		// Remove lane from scene.
		scene.remove(lane.laneRenderingObject)
		
		// Remove mesh from internal array of meshes.
		let index = this.annotationMeshes.findIndex( (mesh) => {
			return mesh === lane.laneMesh
		})
		if (index < 0) {
			log.error("Couldn't find associated mesh in internal mesh array. This should never happen")
			return
		}
		this.annotationMeshes.splice(index, 1)

		// Make sure we remove references to this annotation from it's neighbors (if any).
		this.deleteConnectionToNeighbors(scene, lane)

		// Remove annotation from internal array of annotations.
		let lane_index = this.getLaneIndexFromId(this.annotations, lane.id)
		this.annotations.splice(lane_index, 1)
	}

	/**
	 * Eliminate the current active annotation from the manager. Delete its associated
	 * mesh and markers from the scene and reset any active annotation variables.
	 * @param scene
	 */
	deleteActiveAnnotation(scene:THREE.Scene) {
		if (this.activeAnnotationIndex < 0) {
			log.warn("Can't delete active annotation. No active annotation selected.")
			return
		}

		// Delete lane annotation
		this.deleteLaneAnnotation(scene, this.annotations[this.activeAnnotationIndex])
		
		// Reset active markers and active annotation index.
		this.activeAnnotationIndex = -1
		this.activeMarkers = []
	}
	
	/**
	 * Add lane marker to the active annotation at the given position and add it
	 * to the scene. After the first two markers of a new annotation this function
	 * will add two markers subsequently. The second of those markers is computed
	 * as a linear combination of the first marker (given position) and the
	 * previous two markers.
	 * @param x
	 * @param y
	 * @param z
	 */
	addLaneMarker(x:number, y:number, z:number) {
		if (this.activeAnnotationIndex < 0) {
			log.info("No active annotation. Can't add marker")
			return
		}
		this.annotations[this.activeAnnotationIndex].addMarker(x, y, z)
	}
	
	/**
	 * Remove last marker from the annotation. The marker is also removed from
	 * the scene.
	 */
	deleteLastLaneMarker() {
		if (this.activeAnnotationIndex < 0) {
			log.info("No active annotation. Can't delete marker")
			return
		}
		this.annotations[this.activeAnnotationIndex].deleteLast()
	}
	
	/**
	 * Update the mesh of the active annotation. This is used if the lane marker positions
	 * where changed externally (e.g. by the transform controls)
	 */
	updateActiveLaneMesh() {
		if (this.activeAnnotationIndex < 0) {
			log.info("No active annotation. Can't update mesh")
			return
		}
		this.annotations[this.activeAnnotationIndex].updateVisualization()
	}
	
	/**
	 * Create a new lane annotation connected to the current active annotation at the given location and with
	 * the given direction of traffic. The new annotation is added to the scene for display and set as
	 * inactive.
	 * @param scene
	 * @param neighborLocation
	 * @param neighborDirection
	 */
	addConnectedLaneAnnotation(scene:THREE.Scene, neighborLocation : NeighborLocation, neighborDirection : NeighborDirection) {
		if (this.activeAnnotationIndex < 0) {
			log.info("Can't add connected lane. No annotation is active.")
			return
		}
		
		switch (neighborLocation) {
			case NeighborLocation.FRONT:
				this.addFrontConnection(scene)
				break
			case NeighborLocation.LEFT:
				this.addLeftConnection(scene, neighborDirection)
				break
			case NeighborLocation.RIGHT:
				this.addRightConnection(scene, neighborDirection)
				break
			case NeighborLocation.BACK:
				log.info("Adding back connection is not supported")
				break
			default:
				log.warn("Unrecognized neighbor location")
				break
		}
	}

	/**
	 * This expects the serialized UtmCrs structure produced by toJSON().
	 */
	private checkCoordinateSystem(data: Object): boolean {
		const crs = data['coordinateReferenceSystem']
		if (crs['coordinateSystem'] !== 'UTM') return false
		if (crs['datum'] !== this.datum) return false
		const number = crs['parameters']['utmZoneNumber']
		const letter = crs['parameters']['utmZoneLetter']

		if (!data['annotations']) return false
		// generate an arbitrary offset for internal use, given the first point in the data set
		let first
		// and round off the values for nicer debug output
		const trunc = function (x) {return Math.trunc(x / 10) * 10}
		for (let i = 0; !first && i < data['annotations'].length; i++) {
			const annotation = data['annotations'][i]
			if (annotation['markerPositions'] && annotation['markerPositions'].length > 0) {
				const pos = annotation['markerPositions'][0]
				first = new THREE.Vector3(trunc(pos['E']), trunc(pos['N']), trunc(pos['alt']))
			}
		}
		if (!first) return false

		return this.setOrigin(number, letter, first) ||
			this.utmZoneNumber === number && this.utmZoneLetter === letter
	}

	/**
	 * Convert markerPositions from UTM objects to vectors in local coordinates, for downstream consumption.
	 */
	private convertCoordinates(data: Object): void {
		data['annotations'].forEach((annotation) => {
			if (annotation['markerPositions']) {
				for (let i = 0; i < annotation['markerPositions'].length; i++) {
					const pos = annotation['markerPositions'][i]
					annotation['markerPositions'][i] = this.utmToThreeJs(pos['E'], pos['N'], pos['alt'])
				}
			}
		})
	}

	/**
	 * Load annotations from file. Store all annotations and add them to the Annotator scene.
	 * This requires UTM as the input format.
	 * @returns the center point of the bottom of the bounding box of the data; hopefully
	 *   there will be something to look at there
	 */
	loadAnnotationsFromFile(fileName: string, scene: THREE.Scene): Promise<THREE.Vector3> {
		const self = this
		return new Promise(function (resolve, reject) {
			AsyncFile.readFile(fileName, 'ascii').then(function (text) {
				const data = JSON.parse(text as any)
				if (self.checkCoordinateSystem(data)) {
					self.convertCoordinates(data)
					let boundingBox = new THREE.Box3()
					// Each element is an annotation
					data['annotations'].forEach((element) => {
						const box = self.addLaneAnnotation(scene, element)
						boundingBox = boundingBox.union(box)
					})
					if (boundingBox.isEmpty()) {
						resolve()
					} else {
						resolve(boundingBox.getCenter().setY(boundingBox.min.y))
					}
				} else {
					reject(Error(`UTM Zone for new annotations (${data['coordinateReferenceSystem']['parameters']['utmZoneNumber']}${data['coordinateReferenceSystem']['parameters']['utmZoneLetter']}) does not match existing zone in ${self.getOrigin()}`));
				}
			}, function (error) {
				reject(error)
			})
		})
	}

	enableAutoSave(): void {this.metadataState.enableAutoSave()}

	disableAutoSave(): void {this.metadataState.disableAutoSave()}

	async saveAnnotationsToFile(fileName: string, format: OutputFormat): Promise<void> {
		if (this.annotations.length === 0) {
			return Promise.reject(new Error('failed to save empty set of annotations'))
		}
		if (!this.hasOrigin() && !config.get('output.annotations.debug.allow_annotations_without_utm_origin')) {
			return Promise.reject(new Error('failed to save annotations: UTM origin is not set'))
		}
		let self = this
		let dirName = fileName.substring(0, fileName.lastIndexOf("/"))
		let writeFile = function (er, _) {
			if (!er) {
				let strAnnotations = JSON.stringify(self.toJSON(format))
				return AsyncFile.writeTextFile(fileName, strAnnotations)
			}
		}
		return MkDirP.mkdirP(dirName, writeFile)
	}

	private threeJsToUtmJsonObject(): (p: THREE.Vector3) => Object {
		let self = this
		return function (p: THREE.Vector3): Object {
			const utm = self.threeJsToUtm(p)
			return {'E': utm.x, 'N': utm.y, 'alt': utm.z}
		}
	}

	private threeJsToLlaJsonObject(): (p: THREE.Vector3) => Object {
		let self = this
		return function (p: THREE.Vector3): Object {
			const lla = self.threeJsToLla(p)
			return {'lon': lla.x, 'lat': lla.y, 'alt': lla.z}
		}
	}

	toJSON(format: OutputFormat) {
		let crs
		let pointConverter
		if (format === OutputFormat.UTM) {
			const utm: CRS.UtmCrs = {
				coordinateSystem: 'UTM',
				datum: this.datum,
				parameters: {
					utmZoneNumber: this.utmZoneNumber,
					utmZoneLetter: this.utmZoneLetter,
				}
			}
			crs = utm
			pointConverter = this.threeJsToUtmJsonObject()
		} else if (format === OutputFormat.LLA) {
			const lla: CRS.LlaCrs = {
				coordinateSystem: 'LLA',
				datum: this.datum,
			}
			crs = lla
			pointConverter = this.threeJsToLlaJsonObject()
		} else {
			throw new Error('unknown OutputFormat: ' + format)
		}
		const data: AnnotationManagerInterface = {
			coordinateReferenceSystem: crs,
			annotations: [],
		}

		this.annotations.forEach((annotation) => {
			data.annotations = data.annotations.concat(annotation.toJSON(pointConverter))
		})

		return data
	}

	saveAndExportToKml(jar: string, main: string, input: string, output: string) {
		let exportToKml = function () {
			const command = [jar, main, input, output].join(' ')
			log.debug('executing child process: ' + command)
			const exec = require('child_process').exec
			exec(command, (error, stdout, stderr) => {
				if (error) {
					log.error(`exec error: ${error}`)
					return
				}
				if (stdout) log.debug(`stdout: ${stdout}`)
				if (stderr) log.debug(`stderr: ${stderr}`)
			})
		}

		this.saveAnnotationsToFile(input, OutputFormat.LLA).then(function () {
			exportToKml()
		}, function (error) {
			console.warn('save-to-JSON failed for KML conversion; aborting: ' + error.message)
		})
	}

	saveToKML(fileName: string) {
		// Get all the points
		let points = []
		this.annotations.forEach( (annotation) => {
			points = points.concat(annotation.waypoints)
		})
		
		// Convert points to lat lon
		let geopoints = []
		points.forEach( (p) => {
			geopoints.push(this.threeJsToLla(p))
		})
		
		// Save file
		let kml = new SimpleKML()
		kml.addPath(geopoints)
		return kml.saveToFile(fileName)
	}
	
	/**
	 * Adds a new lane annotation and initializes it's first two points to be the last two points of
	 * the current active annotation and it's next two points to be an extension in the direction of
	 * the last four points of the current active annotation.
	 */
	private addFrontConnection(scene:THREE.Scene,) {
		this.addLaneAnnotation(scene)
		let newAnnotationIndex = this.annotations.length-1

		if (this.activeMarkers.length < 4) {
			log.warn("Current active lane doesn't have an area. Can't add neighbor")
			return
		}

		let lastMarkerIndex = this.activeMarkers.length-1
		let direction1 = new THREE.Vector3()
		let direction2 = new THREE.Vector3()
		direction1.subVectors(this.activeMarkers[lastMarkerIndex-1].position,
							  this.activeMarkers[lastMarkerIndex-3].position)
		direction2.subVectors(this.activeMarkers[lastMarkerIndex].position,
			                  this.activeMarkers[lastMarkerIndex-2].position)
		let thirdMarkerPosition = new THREE.Vector3()
		let fourthMarkerPosition = new THREE.Vector3()
		thirdMarkerPosition.addVectors(this.activeMarkers[lastMarkerIndex-1].position, direction1)
		fourthMarkerPosition.addVectors(this.activeMarkers[lastMarkerIndex].position, direction2)

		this.annotations[newAnnotationIndex].addRawMarker(this.activeMarkers[lastMarkerIndex-1].position)
		this.annotations[newAnnotationIndex].addRawMarker(this.activeMarkers[lastMarkerIndex].position)
		this.annotations[newAnnotationIndex].addRawMarker(thirdMarkerPosition)
		this.annotations[newAnnotationIndex].addRawMarker(fourthMarkerPosition)

		this.annotations[newAnnotationIndex].addNeighbor(this.annotations[this.activeAnnotationIndex].id, NeighborLocation.BACK)
		this.annotations[this.activeAnnotationIndex].addNeighbor(this.annotations[newAnnotationIndex].id, NeighborLocation.FRONT)

		this.annotations[newAnnotationIndex].updateVisualization()
		this.annotations[newAnnotationIndex].makeInactive()
	}
	
	/**
	 * Adds a new lane annotation to the left of the current active annotation. It initializes its
	 * lane markers as a mirror of the active annotation. The order of the markers depends on the
	 * given direction of the neighbor.
	 * @param scene
	 * @param neighborDirection [SAME, REVERSE]
	 */
	private addLeftConnection(scene:THREE.Scene, neighborDirection : NeighborDirection) {
		
		if (this.annotations[this.activeAnnotationIndex].neighborsIds.left != null) {
			log.warn('This lane already has a neighbor to the LEFT. Aborting new connection.')
			return
		}
		
		this.addLaneAnnotation(scene)
		let newAnnotationIndex = this.annotations.length-1
		
		switch (neighborDirection) {
			
			case NeighborDirection.SAME:
				for (let i=0; i < this.activeMarkers.length; i+=2) {
					let rightMarkerPosition = this.activeMarkers[i+1].position.clone()
					let direction = new THREE.Vector3()
					direction.subVectors(this.activeMarkers[i].position, rightMarkerPosition)
					let leftMarkerPosition = new THREE.Vector3()
					leftMarkerPosition.subVectors(rightMarkerPosition, direction)
					this.annotations[newAnnotationIndex].addRawMarker(rightMarkerPosition)
					this.annotations[newAnnotationIndex].addRawMarker(leftMarkerPosition)
				}
				
				
				// Record connection
				this.annotations[newAnnotationIndex].addNeighbor(this.annotations[this.activeAnnotationIndex].id, NeighborLocation.RIGHT)
				this.annotations[this.activeAnnotationIndex].addNeighbor(this.annotations[newAnnotationIndex].id, NeighborLocation.LEFT)
				
				break
			
			case NeighborDirection.REVERSE:
				for (let i=this.activeMarkers.length-1; i >= 0; i-=2) {
					let leftMarkerPosition = this.activeMarkers[i].position.clone()
					let direction = new THREE.Vector3()
					direction.subVectors(this.activeMarkers[i-1].position, leftMarkerPosition)
					let rightMarkerPosition = new THREE.Vector3()
					rightMarkerPosition.subVectors(leftMarkerPosition, direction)
					this.annotations[newAnnotationIndex].addRawMarker(rightMarkerPosition)
					this.annotations[newAnnotationIndex].addRawMarker(leftMarkerPosition)
				}
				
				// Record connection
				this.annotations[newAnnotationIndex].addNeighbor(this.annotations[this.activeAnnotationIndex].id, NeighborLocation.LEFT)
				this.annotations[this.activeAnnotationIndex].addNeighbor(this.annotations[newAnnotationIndex].id, NeighborLocation.LEFT)
				
				break
			
			default:
				log.warn('Unrecognized neighbor direction.')
				break
		}
		
		this.annotations[newAnnotationIndex].updateVisualization()
		this.annotations[newAnnotationIndex].makeInactive()
	}
	
	/**
	 * Adds a new lane annotation to the right of the current active annotation. It initializes its
	 * lane markers as a mirror of the active annotation. The order of the markers depends on the
	 * given direction of the neighbor.
	 * @param scene
	 * @param neighborDirection [SAME,REVERSE]
	 */
	private addRightConnection(scene:THREE.Scene, neighborDirection : NeighborDirection) {
		if (this.annotations[this.activeAnnotationIndex].neighborsIds.right != null) {
			log.warn('This lane already has a neighbor to the RIGHT. Aborting new connection.')
			return
		}
		
		this.addLaneAnnotation(scene)
		let newAnnotationIndex = this.annotations.length-1
		
		switch (neighborDirection) {
			
			case NeighborDirection.SAME:
				for (let i=0; i < this.activeMarkers.length; i+=2) {
					let leftMarkerPosition = this.activeMarkers[i].position.clone()
					let direction = new THREE.Vector3()
					direction.subVectors(this.activeMarkers[i+1].position, leftMarkerPosition)
					let rightMarkerPosition = new THREE.Vector3()
					rightMarkerPosition.subVectors(leftMarkerPosition, direction)
					this.annotations[newAnnotationIndex].addRawMarker(rightMarkerPosition)
					this.annotations[newAnnotationIndex].addRawMarker(leftMarkerPosition)
				}
				
				
				// Record connection
				this.annotations[newAnnotationIndex].addNeighbor(this.annotations[this.activeAnnotationIndex].id, NeighborLocation.LEFT)
				this.annotations[this.activeAnnotationIndex].addNeighbor(this.annotations[newAnnotationIndex].id, NeighborLocation.RIGHT)
				
				break
			
			case NeighborDirection.REVERSE:
				for (let i=this.activeMarkers.length-1; i >= 0; i-=2) {
					let rightMarkerPosition = this.activeMarkers[i-1].position.clone()
					let direction = new THREE.Vector3()
					direction.subVectors(this.activeMarkers[i].position, rightMarkerPosition)
					let leftMarkerPosition = new THREE.Vector3()
					leftMarkerPosition.subVectors(rightMarkerPosition, direction)
					this.annotations[newAnnotationIndex].addRawMarker(rightMarkerPosition)
					this.annotations[newAnnotationIndex].addRawMarker(leftMarkerPosition)
				}
				
				// Record connection
				this.annotations[newAnnotationIndex].addNeighbor(this.annotations[this.activeAnnotationIndex].id, NeighborLocation.RIGHT)
				this.annotations[this.activeAnnotationIndex].addNeighbor(this.annotations[newAnnotationIndex].id, NeighborLocation.RIGHT)
				
				break
			
			default:
				log.warn('Unrecognized neighbor direction.')
				break
		}
		
		this.annotations[newAnnotationIndex].updateVisualization()
		this.annotations[newAnnotationIndex].makeInactive()
	}
	
	private findAnnotationIndexById(id) : number {
		return this.annotations.findIndex( (annotation) => {
			return annotation.id === id
		})
	}
	
	private deleteConnectionToNeighbors(scene:THREE.Scene, annotation : LaneAnnotation) {
		
		if (annotation.neighborsIds.right != null) {
			let index = this.findAnnotationIndexById(annotation.neighborsIds.right)
			if (index < 0) {
				log.error("Couldn't find right neighbor. This should never happen.")
			}
			let rightNeighbor = this.annotations[index]
			
			if (rightNeighbor.neighborsIds.right === annotation.id) {
				log.info("Deleted connection to right neighbor.")
				rightNeighbor.neighborsIds.right = null
			} else if (rightNeighbor.neighborsIds.left === annotation.id){
				log.info("Deleted connection to right neighbor.")
				rightNeighbor.neighborsIds.left = null
			} else {
				log.error("Non-reciprocal neighbor relation detected. This should never happen.")
			}
		}
		
		if (annotation.neighborsIds.left != null) {
			let index = this.findAnnotationIndexById(annotation.neighborsIds.left)
			if (index < 0) {
				log.error("Couldn't find left neighbor. This should never happen.")
			}
			let leftNeighbor = this.annotations[index]
			
			if (leftNeighbor.neighborsIds.right === annotation.id) {
				log.info("Deleted connection to left neighbor.")
				leftNeighbor.neighborsIds.right = null
			} else if (leftNeighbor.neighborsIds.left === annotation.id){
				log.info("Deleted connection to left neighbor.")
				leftNeighbor.neighborsIds.left = null
			} else {
				log.error("Non-reciprocal neighbor relation detected. This should never happen.")
			}
		}
		
		for (let i=0; i < annotation.neighborsIds.front.length; i++) {
			let index = this.findAnnotationIndexById(annotation.neighborsIds.front[i])
			if (index < 0) {
				log.error("Couldn't find front neighbor. This should never happen.")
			}
			let frontNeighbor = this.annotations[index]
			
			let index2 = frontNeighbor.neighborsIds.back.findIndex( (id) => {
				return id === annotation.id
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
			}
		}
		
		for (let i=0; i < annotation.neighborsIds.back.length; i++) {
			let index = this.findAnnotationIndexById(annotation.neighborsIds.back[i])
			if (index < 0) {
				log.error("Couldn't find back neighbor. This should never happen.")
			}
			let backNeighbor = this.annotations[index]
			
			let index2 = backNeighbor.neighborsIds.front.findIndex( (id) => {
				return id === annotation.id
			})
			if (index2 >= 0) {
				// delete the backward connection
				log.info("Deleted connection to back neighbor.")
				backNeighbor.neighborsIds.front.splice(index2,1)
				if (annotation.type === AnnotationType.LANE &&
					  backNeighbor.type === AnnotationType.CONNECTION) {
					// delete the backward connection LANE
					this.deleteLaneAnnotation(scene, backNeighbor)
				}
			}
		}
	}
}

/**
 * This tracks transient metadata for the data model, for the duration of a user session.
 */
export class AnnotationState {
	private annotationManager: AnnotationManager
	private autoSaveEnabled: boolean
	private autoSaveDirectory: string

	constructor(annotationManager: AnnotationManager) {
		const self = this
		this.annotationManager = annotationManager
		this.autoSaveDirectory = config.get('output.annotations.autosave.directory.path')
		const autoSaveEventInterval = config.get('output.annotations.autosave.interval.seconds') * 1000
		if (this.annotationManager && this.autoSaveDirectory && autoSaveEventInterval) {
			setInterval(function () {
				if (self.doAutoSave()) self.saveAnnotations()
			}, autoSaveEventInterval)
		}
	}

	enableAutoSave(): void {this.autoSaveEnabled = true}

	disableAutoSave(): void {this.autoSaveEnabled = false}

	private doAutoSave(): boolean {
		return this.autoSaveEnabled && this.annotationManager.annotations.length > 0
	}

	private saveAnnotations(): void {
		const now = new Date()
		const nowElements = [
			now.getUTCFullYear(),
			now.getUTCMonth() + 1,
			now.getUTCDay(),
			now.getUTCHours(),
			now.getUTCMinutes(),
			now.getUTCSeconds(),
			now.getUTCMilliseconds(),
		]
		const fileName = vsprintf("%04d-%02d-%02dT%02d-%02d-%02d.%03dZ.json", nowElements)
		const savePath = this.autoSaveDirectory + '/' + fileName
		log.info("auto-saving annotations to: " + savePath)
		this.annotationManager.saveAnnotationsToFile(savePath, OutputFormat.UTM).then(
			function () {},
			function (error) {
				console.warn('save annotations failed: ' + error.message)
			}
		)
	}
}
