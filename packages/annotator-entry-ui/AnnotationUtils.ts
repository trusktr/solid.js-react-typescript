/**
 *  Copyright 2017 Mapper Inc. Part of the mapper-annotator project.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as THREE from 'three'
import {
	LaneAnnotation, LaneAnnotationInterface, NeighborDirection,
	NeighborLocation
} from 'annotator-entry-ui/LaneAnnotation'
import {SuperTile} from "annotator-entry-ui/TileUtils"
import {SimpleKML} from 'annotator-entry-ui/KmlUtils'
import * as TypeLogger from 'typelogger'
import * as AsyncFile from 'async-file'
import * as MkDirP from 'mkdirp'
import Vector3 = THREE.Vector3

const utmObj = require('utm-latlng')

TypeLogger.setLoggerOutput(console as any)
const log = TypeLogger.getLogger(__filename)

/**
 * The AnnotationManager is in charge of maintaining a set of annotations and all operations
 * to modify, add or delete them. It also keeps an index to the "active" annotation as well
 * as it's markers. The "active" annotation is the only one that can be modified.
 */
export class AnnotationManager {
	annotations : Array<LaneAnnotation>
	annotationMeshes : Array<THREE.Mesh>
	activeMarkers : Array<THREE.Mesh>
	activeAnnotationIndex : number
	carPath : Array<number>
	carPathActivation : boolean
	
	constructor() {
		this.annotations = []
		this.annotationMeshes = []
		this.activeMarkers = []
		this.activeAnnotationIndex = -1
		this.carPath = []
		this.carPathActivation = false
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
			list.push(this.annotations[i].id);
		}
		return list;
	}

	/**
	 * Add a new relation between two existing lanes
	 */
	addRelation(from_id : number, to_id : number, relation : string) {

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

		if (lane_to === null || lane_to === null) {
			log.info("Given lane ids are not valid.");
			return;
		}

		switch (relation) {
			case 'left':
				if (lane_from.neighborsIds.left === null &&
					lane_to.neighborsIds.right === null) {

					lane_from.neighborsIds.left = to_id;
					lane_to.neighborsIds.right = from_id;
				}
				break;
			case 'left reverse':
				if (lane_from.neighborsIds.left === null &&
					lane_to.neighborsIds.left === null) {

					lane_from.neighborsIds.left = to_id;
					lane_to.neighborsIds.left = from_id;
				}
				break;
			case 'right':
				if (lane_from.neighborsIds.right === null &&
					lane_to.neighborsIds.left === null) {

					lane_from.neighborsIds.right = to_id;
					lane_to.neighborsIds.left = from_id; // TODO: fix this
				}
				break;
			case 'front':
				if (lane_from.neighborsIds.front === null &&
					lane_to.neighborsIds.back === null) {

					lane_from.neighborsIds.front.push(to_id);
					lane_to.neighborsIds.back.push(from_id);
				}
				break;
			case 'back':
				if (lane_from.neighborsIds.back === null &&
					lane_to.neighborsIds.front === null) {

					lane_from.neighborsIds.back.push(to_id);
					lane_to.neighborsIds.front.push(from_id);
				}
				break;
			default:
				log.error("Unknown relation to be added: " + relation);
				break;
		}
	}

	/**
	 * Add current lane to the car path
	 */
	laneIndexInPath(lane_id : number) {
		return this.carPath.findIndex( (id) => {return lane_id === id})
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
	 * Saves car path to CSV file
	 */
	convertAnnotationToCSV(args) : string {
		
		let data : LaneAnnotation[] = args.data || null;
		if (data === null) {
			log.error("Empty annotation.")
			return ''
		}
		
		let tile : SuperTile = args.tile || null;
		if (tile === null) {
			log.error('No tile given.')
			return ''
		}
		
		let columnDelimiter = args.columnDelimiter || ',';
		let lineDelimiter = args.lineDelimiter || '\n';
		let result : string = ''
		data.forEach( (lane) => {
			lane.waypoints.forEach( (marker) => {
				// Get latitude longitude
				let lat_lng_pt  = tile.threejsToLatLng(marker)
				result += lat_lng_pt.lng.toString();
				result += columnDelimiter;
				result += lat_lng_pt.lat.toString();
				result += lineDelimiter;
			});
		});
		
		return result
	}
	saveCarPath(fileName : string, tile : SuperTile) {
		let self = this
		let dirName = fileName.substring(0, fileName.lastIndexOf("/"))
		let writeFile = function (er, _) {
			if (!er) {
				let strAnnotations = self.convertAnnotationToCSV({data : self.annotations,
				tile : tile});
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
	 * @param scene
	 */
	addLaneAnnotation(scene:THREE.Scene, obj? : LaneAnnotationInterface) {
		if (obj) {
			// Create an annotation with data
			this.annotations.push(new LaneAnnotation(scene, obj))
		} else {
			// Create a clean annotation
			this.annotations.push(new LaneAnnotation())
		}
		let newAnnotationIndex = this.annotations.length-1
		this.annotationMeshes.push(this.annotations[newAnnotationIndex].laneMesh)
		scene.add(this.annotations[newAnnotationIndex].laneMesh)
		scene.add(this.annotations[newAnnotationIndex].laneDirection)
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
		
		// Remove markers from scene.
		this.activeMarkers.forEach( (marker) => {
			scene.remove(marker)
		})
		
		// Remove mesh from scene.
		scene.remove(this.annotations[this.activeAnnotationIndex].laneMesh)
		scene.remove(this.annotations[this.activeAnnotationIndex].laneDirection)
		
		// Remove mesh from internal array of meshes.
		let index = this.annotationMeshes.findIndex( (mesh) => {
			return mesh === this.annotations[this.activeAnnotationIndex].laneMesh
		})
		if (index < 0) {
			log.error("Couldn't find associated mesh in internal mesh array. This should never happen")
			return
		}
		this.annotationMeshes.splice(index, 1)
		
		// Make sure we remove references to this annotation from it's neighbors (if any).
		this.deleteConnectionToNeighbors(this.annotations[this.activeAnnotationIndex])
		
		// Remove annotation from internal array of annotations.
		this.annotations.splice(this.activeAnnotationIndex, 1)
		
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
	 * @param scene
	 * @param x
	 * @param y
	 * @param z
	 */
	addLaneMarker(scene:THREE.Scene, x:number, y:number, z:number) {
		if (this.activeAnnotationIndex < 0) {
			log.info("No active annotation. Can't add marker")
			return
		}
		this.annotations[this.activeAnnotationIndex].addMarker(scene, x, y, z)
	}
	
	/**
	 * Remove last marker from the annotation. The marker is also removed from
	 * the scene.
	 * @param scene
	 */
	deleteLastLaneMarker(scene:THREE.Scene) {
		if (this.activeAnnotationIndex < 0) {
			log.info("No active annotation. Can't delete marker")
			return
		}
		this.annotations[this.activeAnnotationIndex].deleteLast(scene)
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
	
	async saveAnnotationsToFile(fileName : string) {
		let self = this
		let dirName = fileName.substring(0, fileName.lastIndexOf("/"))
		let writeFile = function (er, _) {
			if (!er) {
				let strAnnotations = JSON.stringify(self.annotations)
				AsyncFile.writeTextFile(fileName, strAnnotations)
			}
		}
		MkDirP.mkdirP(dirName, writeFile)
	}
	
	saveToKML(filename : string, tile : SuperTile) {
		// Get all the points
		let points = []
		this.annotations.forEach( (annotation) => {
			points = points.concat(annotation.waypoints)
		})
		
		// Convert points to lat lon
		let geopoints = []
		let utm = new utmObj()
		points.forEach( (p) => {
			// First change coordinate frame from THREE js to UTM
			let wp = tile.threejsToUtm(p)
			// Get latitude longitude
			let tmp  = utm.convertUtmToLatLng(wp.x, wp.y, 18, 'S')
			geopoints.push(new THREE.Vector3(tmp.lng, tmp.lat, wp.z))
		})
		
		// Save file
		let kml = new SimpleKML()
		kml.addPath(geopoints)
		kml.saveToFile(filename)
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

		this.annotations[newAnnotationIndex].addRawMarker(scene, this.activeMarkers[lastMarkerIndex-1].position)
		this.annotations[newAnnotationIndex].addRawMarker(scene, this.activeMarkers[lastMarkerIndex].position)
		this.annotations[newAnnotationIndex].addRawMarker(scene, thirdMarkerPosition)
		this.annotations[newAnnotationIndex].addRawMarker(scene, fourthMarkerPosition)

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
					this.annotations[newAnnotationIndex].addRawMarker(scene, rightMarkerPosition)
					this.annotations[newAnnotationIndex].addRawMarker(scene, leftMarkerPosition)
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
					this.annotations[newAnnotationIndex].addRawMarker(scene, rightMarkerPosition)
					this.annotations[newAnnotationIndex].addRawMarker(scene, leftMarkerPosition)
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
					this.annotations[newAnnotationIndex].addRawMarker(scene, rightMarkerPosition)
					this.annotations[newAnnotationIndex].addRawMarker(scene, leftMarkerPosition)
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
					this.annotations[newAnnotationIndex].addRawMarker(scene, rightMarkerPosition)
					this.annotations[newAnnotationIndex].addRawMarker(scene, leftMarkerPosition)
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
	
	private deleteConnectionToNeighbors(annotation : LaneAnnotation) {
		
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
				log.info("Deleted connection to front neighbor.")
				frontNeighbor.neighborsIds.back.splice(index2,1)
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
				log.info("Deleted connection to back neighbor.")
				backNeighbor.neighborsIds.front.splice(index2,1)
			}
		}
	}
}
