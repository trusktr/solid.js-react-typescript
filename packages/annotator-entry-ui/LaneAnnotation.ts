/**
 *  Copyright 2017 Mapper Inc. Part of the mapper-annotator project.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as THREE from 'three'
import * as TypeLogger from 'typelogger'
import * as $ from 'jquery'
import * as UUID from 'uuid'

TypeLogger.setLoggerOutput(console as any)
const log = TypeLogger.getLogger(__filename)

// Some constants for rendering
const controlPointGeometry = new THREE.BoxGeometry( 0.1, 0.1, 0.1 );

const directionGeometry = new THREE.Geometry()
directionGeometry.vertices.push(new THREE.Vector3(-0.25, 0.25,  0.5))
directionGeometry.vertices.push(new THREE.Vector3( 0.25, 0.25,  0))
directionGeometry.vertices.push(new THREE.Vector3(-0.25, 0.25, -0.5))
directionGeometry.faces.push(new THREE.Face3(0, 1, 2))
directionGeometry.computeFaceNormals()

const directionGeometryMaterial = new THREE.MeshLambertMaterial({color: 0xff0000, side : THREE.DoubleSide})

export type LaneUuid = string // a UUID, for use across distributed applications
export type LaneId = number   // a small integer, for use in the UI during one session

export enum NeighborDirection {
	SAME = 1,
	REVERSE
}

export enum NeighborLocation {
	FRONT = 1,
	BACK,
	LEFT,
	RIGHT
}

export enum LaneSideType {
	UNKNOWN = 0,
	SOLID,
	BROKEN
}

export enum LaneEntryExitType {
	UNKNOWN = 0,
	CONTINUE,
	STOP
}

export enum AnnotationType {
	UNKNOWN = 0,
	LANE = 1,
	CONNECTION = 2
}

export class LaneNeighborsIds {
	right: LaneUuid
	left: LaneUuid
	front: Array<LaneUuid>
	back: Array<LaneUuid>

	constructor() {
		this.right = null
		this.left = null
		this.front = []
		this.back = []
	}
}

class LaneRenderingProperties {
	color
	markerMaterial : THREE.MeshLambertMaterial
	activeMaterial : THREE.MeshBasicMaterial
	inactiveMaterial : THREE.MeshLambertMaterial
	centerLineMaterial : THREE.LineDashedMaterial
	trajectoryMaterial : THREE.MeshLambertMaterial
	connectionMaterial : THREE.MeshLambertMaterial
	liveModeMaterial : THREE.MeshLambertMaterial

	constructor (color) {
		this.color = color
		this.markerMaterial = new THREE.MeshLambertMaterial({color : this.color, side : THREE.DoubleSide})
		this.activeMaterial = new THREE.MeshBasicMaterial({color : "orange", wireframe : true})
		this.inactiveMaterial = new THREE.MeshLambertMaterial({color: this.color, side : THREE.DoubleSide})
		this.trajectoryMaterial = new THREE.MeshLambertMaterial({color: 0x000000, side : THREE.DoubleSide})
		this.centerLineMaterial = new THREE.LineDashedMaterial( { color: 0xffaa00, dashSize: 3, gapSize: 1, linewidth: 2 } )
		this.connectionMaterial = new THREE.MeshLambertMaterial( {color: 0x00ff00, side : THREE.DoubleSide})
		this.liveModeMaterial = new THREE.MeshLambertMaterial({color: 0x443333, transparent: true, opacity: 0.4, side: THREE.DoubleSide})
	}
}

namespace LaneCounter {
	let i = 0
	export function nextId(): number {
		return ++i
	}
}

export interface LaneAnnotationInterface {
	uuid: LaneUuid
	type
	color
	markerPositions
	waypoints
	neighborsIds :LaneNeighborsIds
	leftSideType : LaneSideType
	rightSideType : LaneSideType
	entryType : LaneEntryExitType
	exitType : LaneEntryExitType
}

/**
 * LaneAnnotation class.
 */
export class LaneAnnotation {
	// Lane markers are stored in an array as [right, left, right, left, ...]
	id: LaneId
	uuid: LaneUuid
	type : AnnotationType
	renderingProperties : LaneRenderingProperties
	laneRenderingObject : THREE.Object3D
	waypoints : Array<THREE.Vector3>
	laneMarkers : Array<THREE.Mesh>
	laneCenterLine : THREE.Line
	laneDirectionMarkers : Array<THREE.Mesh>
	laneMesh : THREE.Mesh
	neighborsIds : LaneNeighborsIds
	leftSideType : LaneSideType
	rightSideType : LaneSideType
	entryType : LaneEntryExitType
	exitType : LaneEntryExitType
	inTrajectory: boolean
	
	constructor(obj? : LaneAnnotationInterface) {
		
		this.id = LaneCounter.nextId()
		this.uuid = obj ? obj.uuid : UUID.v1()
		this.type = obj ? obj.type : AnnotationType.UNKNOWN
		let color = obj ? obj.color : Math.random() * 0xffffff
		this.neighborsIds = obj? obj.neighborsIds : new LaneNeighborsIds()
		this.leftSideType = obj ? obj.leftSideType : LaneSideType.UNKNOWN
		this.rightSideType = obj ? obj.rightSideType : LaneSideType.UNKNOWN
		this.entryType =  obj ? obj.entryType : LaneEntryExitType.UNKNOWN
		this.exitType =  obj ? obj.exitType : LaneEntryExitType.UNKNOWN
		this.renderingProperties = new LaneRenderingProperties(color)
		this.laneMarkers = []
		this.laneMesh = new THREE.Mesh(new THREE.Geometry(), this.renderingProperties.activeMaterial)
		this.laneCenterLine = new THREE.Line(new THREE.Geometry(), this.renderingProperties.centerLineMaterial)
		this.laneRenderingObject = new THREE.Object3D()
		this.laneDirectionMarkers = []
		this.inTrajectory = false
		
		if (obj && obj.markerPositions.length > 0) {
			obj.markerPositions.forEach( (position) => {
				this.addRawMarker(new THREE.Vector3(position.x, position.y, position.z))
			})
			this.updateVisualization()
			this.makeInactive()
		}

		// Group display objects so we can easily add them to the screen
		this.laneRenderingObject.add(this.laneMesh)
		this.laneRenderingObject.add(this.laneCenterLine)
	}
	
	setType(type : AnnotationType) {
		this.type = type
	}
	
	/**
	 * Add a single marker to the annotation and the scene.
	 * @param position
	 */
	addRawMarker(position : THREE.Vector3) {
		let marker = new THREE.Mesh( controlPointGeometry, this.renderingProperties.markerMaterial)
		marker.position.set(position.x, position.y, position.z)
		this.laneMarkers.push(marker)
		if (this.type === AnnotationType.LANE) {
			this.laneRenderingObject.add(marker)
		}
	}
	
	/**
	 * Add marker. The behavior of this functions changes depending if this is the
	 * first, second, or higher indexed marker.
	 *      - First marker: is equivalent as calling addRawMarker
	 *      - Second marker: has it's height modified to match the height of the first marker
	 *      - Third and onwards: Two markers are added using the passed position and the
	 *                           position of the last two markers.
	 * @param x
	 * @param y
	 * @param z
	 */
	addMarker(x:number, y:number, z:number) {
		
		let marker : THREE.Vector3 = new THREE.Vector3(x,y,z)// = new THREE.Mesh( controlPointGeometry, this.renderingProperties.markerMaterial)
		this.addRawMarker(marker)
		
		// From the third marker onwards, add markers in pairs by estimating the position
		// of the left marker.
		if (this.laneMarkers.length >= 3) {
			this.addRawMarker(this.computeLeftMarkerEstimatedPosition())
		}
		
		this.updateVisualization()
	}
	
	/**
	 * Add neighbor to our list of neighbors
	 * @param neighborId
	 * @param neighborLocation
	 */
	addNeighbor(neighborId: LaneUuid, neighborLocation: NeighborLocation) {
		switch (neighborLocation) {
			case NeighborLocation.FRONT:
				this.neighborsIds.front.push(neighborId)
				break
			case NeighborLocation.BACK:
				this.neighborsIds.back.push(neighborId)
				break
			case NeighborLocation.LEFT:
				this.neighborsIds.left = neighborId
				break
			case NeighborLocation.RIGHT:
				this.neighborsIds.right = neighborId
				break
			default:
				log.warn('Neighbor location not recognized')
		}
	}
	
	/**
	 * Delete last marker(s).
	 */
	deleteLast()  {
		if (this.laneMarkers.length === 0) {
			return
		}
		
		this.laneRenderingObject.remove(this.laneMarkers.pop())
		
		if (this.laneMarkers.length > 2) {
			this.laneRenderingObject.remove(this.laneMarkers.pop())
		}
		
		this.updateVisualization()
	}
	
	/**
	 * Make this annotation active. This changes the displayed material.
	 */
	makeActive() {
		this.laneMesh.material = this.renderingProperties.activeMaterial
		this.laneCenterLine.visible = false
	}
	
	/**
	 * Make this annotation inactive. This changes the displayed material.
	 */
	makeInactive() {
		if (this.inTrajectory) {
			this.laneMesh.material = this.renderingProperties.trajectoryMaterial
		}
		else {
			if (this.type === AnnotationType.LANE) {
				this.laneMesh.material = this.renderingProperties.inactiveMaterial
			}
			else if (this.type === AnnotationType.CONNECTION) {
				this.laneMesh.material = this.renderingProperties.connectionMaterial
			}
			else {
				// UNKNOWN
				log.error("Unknown lane type. This shows an improper annotation creation.")
			}
		}
		this.laneCenterLine.visible = true
	}
	
	/**
	 * Make this annotation part of the car path
	 */
	setTrajectory(isTrajectoryActive : boolean) {
		this.inTrajectory = isTrajectoryActive
		
		// Do not change the active lane
		if (!this.laneCenterLine.visible) {
			return
		}
		
		if (this.inTrajectory) {
			this.laneMesh.material = this.renderingProperties.trajectoryMaterial
		}
		else {
			if (this.type === AnnotationType.LANE) {
				this.laneMesh.material = this.renderingProperties.inactiveMaterial
			}
			else if (this.type === AnnotationType.CONNECTION) {
				this.laneMesh.material = this.renderingProperties.connectionMaterial
			}
			else {
				// UNKNOWN
				log.error("Unknown lane type. This shows an improper annotation creation.")
			}
		}
	}

	setLiveMode(): void {
		this.laneMarkers.forEach((marker) => {marker.visible = false})
		this.laneCenterLine.visible = true
		this.laneMesh.material = this.renderingProperties.liveModeMaterial
	}

	unsetLiveMode(): void {
		this.laneMarkers.forEach((marker) => {marker.visible = true})
		this.makeInactive()
	}

	/**
	 * Recompute mesh from markers.
	 */
	updateVisualization = () => {

		// First thing first, update lane width
		this.updateLaneWidth()

		if (this.laneMarkers.length === 0) {
			return
		}
		
		let newGeometry = new THREE.Geometry()
		
		// We need at least 3 vertices to generate a mesh
		if (this.laneMarkers.length > 2) {
			// Add all vertices
			this.laneMarkers.forEach((marker) => {
				newGeometry.vertices.push(marker.position)
			})
			
			// Add faces
			for (let i = 0; i < this.laneMarkers.length - 2; i++) {
				if (i % 2 === 0) {
					newGeometry.faces.push(new THREE.Face3(i+2, i + 1, i))
				} else {
					newGeometry.faces.push(new THREE.Face3(i, i + 1, i + 2))
				}
				
			}
		}
		newGeometry.computeFaceNormals()
		this.laneMesh.geometry = newGeometry
		this.laneMesh.geometry.verticesNeedUpdate = true
		
		// Generate center lane indication and direction markers
		this.computeWaypoints()
	}

	toJSON(pointConverter?: (p: THREE.Vector3) => Object) {
		// Create data structure to export (this is the min amount of data
		// needed to reconstruct this object from scratch)
		let data : LaneAnnotationInterface = {
			uuid: this.uuid,
			type: this.type,
			color : this.renderingProperties.color,
			leftSideType : this.leftSideType,
			rightSideType : this.rightSideType,
			entryType : this.entryType,
			exitType : this.exitType,
			neighborsIds : this.neighborsIds,
			markerPositions : [],
			waypoints: []
		}

		if (this.waypoints) {
			if (pointConverter) {
				this.waypoints.forEach((p) => {
					data.waypoints.push(pointConverter(p))
				})
			} else {
				data.waypoints = this.waypoints
			}
		}

		if (this.laneMarkers) {
			this.laneMarkers.forEach((marker) => {
				if (pointConverter) {
					data.markerPositions.push(pointConverter(marker.position))
				} else {
					data.markerPositions.push(marker.position)
				}
			})
		}

		return data
	}
	
	/**
	 *  Use the last two points to create a guess of the
	 * location of the left marker
	 * @returns {THREE.Vector3}
	 */
	private computeLeftMarkerEstimatedPosition() : THREE.Vector3 {
		//
		let lastIndex = this.laneMarkers.length
		let newRightMarker = this.laneMarkers[lastIndex-1].position
		let lastRightMarker = this.laneMarkers[lastIndex-3].position
		let lastLeftMarker = this.laneMarkers[lastIndex-2].position
		let vectorRightToLeft = new THREE.Vector3()
		vectorRightToLeft.subVectors(lastLeftMarker, lastRightMarker)
		let vectorLastRightNewRight = new THREE.Vector3()
		vectorLastRightNewRight.subVectors(newRightMarker, lastRightMarker)
		
		let newLeftMarker = new THREE.Vector3()
		newLeftMarker.add(lastRightMarker)
		newLeftMarker.add(vectorLastRightNewRight)
		newLeftMarker.add(vectorRightToLeft)
		
		return newLeftMarker
	}
	
	private computeWaypoints() {
		// There must be at least 4 markers to compute waypoints
		if (this.laneMarkers.length < 4) {
			return;
		}
		
		let points : Array<THREE.Vector3> = [];
		for (let i = 0; i < this.laneMarkers.length-1; i+=2) {
			let waypoint = this.laneMarkers[i].position.clone()
			waypoint.add(this.laneMarkers[i+1].position).divideScalar(2)
			points.push(waypoint)
		}
		
		let distanceBetweenMarkers  = 5.0 // in meters
		let spline = new THREE.CatmullRomCurve3(points)
		let numPoints = spline.getLength() / distanceBetweenMarkers
		this.waypoints = spline.getSpacedPoints(numPoints)
		
		this.updateLaneDirectionMarkers()
		
		// Change the line geometry
		let lineGeometry  = new THREE.Geometry()
		let centerPoints = spline.getPoints(100)
		for (let i=0; i < centerPoints.length; i++) {
			lineGeometry.vertices[i] = centerPoints[i]
			lineGeometry.vertices[i].y += 0.2
		}
		lineGeometry.computeLineDistances()
		this.laneCenterLine.geometry = lineGeometry
		this.laneCenterLine.geometry.verticesNeedUpdate = true
		
	}
	
	private updateLaneDirectionMarkers()  {
		// Remove points from lineDirection object
		this.laneDirectionMarkers.forEach( (marker) => {
			this.laneRenderingObject.remove(marker)
		})
		
		if (this.waypoints.length < 3) {
			return;
		}
		
		for (let i = 1; i < this.waypoints.length - 1; i++) {
			
			let angle = Math.atan2(this.waypoints[i+1].z - this.waypoints[i].z,
				                   this.waypoints[i+1].x - this.waypoints[i].x)
			
			let marker = new THREE.Mesh(directionGeometry, directionGeometryMaterial)
			marker.position.set(this.waypoints[i].x, this.waypoints[i].y, this.waypoints[i].z)
			marker.rotateY(-angle)
			this.laneRenderingObject.add(marker)
			this.laneDirectionMarkers.push(marker)
		}
	}
	
	tryTrajectory(trajectory : Array<THREE.Vector3>)  {
		// Remove points from lineDirection object
		this.laneDirectionMarkers.forEach( (marker) => {
			this.laneRenderingObject.remove(marker)
		})
		
		if (trajectory.length < 3) {
			return;
		}
		
		for (let i = 1; i < trajectory.length - 1; i++) {
			
			let angle = Math.atan2(trajectory[i+1].z - trajectory[i].z,
				trajectory[i+1].x - trajectory[i].x)
			
			let marker = new THREE.Mesh(directionGeometry, directionGeometryMaterial)
			marker.position.set(trajectory[i].x, trajectory[i].y, trajectory[i].z)
			marker.rotateY(-angle)
			this.laneRenderingObject.add(marker)
			this.laneDirectionMarkers.push(marker)
		}
	}

	getLaneWidth() : number {
		// If just one point or non --> lane width is 0
		if (this.laneMarkers.length < 2) {
			return 0.0
		}

		let sum : number = 0.0
		let markers = this.laneMarkers
		for (let i = 0; i < markers.length-1; i+=2) {
			sum += markers[i].position.distanceTo(markers[i+1].position)
		}
		return sum / (markers.length/2)
	}

	updateLaneWidth() {
		let lane_width = $('#lp_width_value')
		lane_width.text(this.getLaneWidth().toFixed(3) + " m")
	}
}
