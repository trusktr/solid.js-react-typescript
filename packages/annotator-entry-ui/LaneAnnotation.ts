/**
 *  Copyright 2017 Mapper Inc. Part of the mapper-annotator project.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as THREE from 'three'
import * as TypeLogger from 'typelogger'

TypeLogger.setLoggerOutput(console as any)
const log = TypeLogger.getLogger(__filename)

const controlPointGeometry = new THREE.BoxGeometry( 0.5, 0.5, 0.5 );
const directionGeometry = new THREE.Geometry()
directionGeometry.vertices.push(new THREE.Vector3(-0.5, 1,  1))
directionGeometry.vertices.push(new THREE.Vector3( 0.5, 1,  0))
directionGeometry.vertices.push(new THREE.Vector3(-0.5, 1, -1))
directionGeometry.faces.push(new THREE.Face3(0, 1, 2))
directionGeometry.computeFaceNormals()
const directionGeometryMaterial = new THREE.MeshLambertMaterial({color: 0xff0000, side : THREE.DoubleSide})

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


class LaneNeighborsIds {
	right : number
	left : number
	front : Array<number>
	back : Array<number>
	
	constructor() {
		this.right = null
		this.left = null
		this.front = []
		this.back = []
	}
}

export interface LaneAnnotationInterface {
	id
	annotationColor
	markerPositions
	neighborsIds :LaneNeighborsIds
}

/**
 * LaneAnnotation class.
 */
export class LaneAnnotation {
	// Lane markers are stored in an array as [right, left, right, left, ...]
	id
	laneMarkers : Array<THREE.Mesh>
	laneCenterLine : THREE.Line
	laneDirectionMarkers : Array<THREE.Mesh>
	laneDirection : THREE.Object3D
	laneMesh : THREE.Mesh
	markerMaterial :  THREE.MeshLambertMaterial
	activeLaneMaterial : THREE.MeshBasicMaterial
	inactiveLaneMaterial : THREE.MeshLambertMaterial
	neighborsIds : LaneNeighborsIds
	leftSideType : LaneSideType
	rightSideType : LaneSideType
	entryType : LaneEntryExitType
	exitType : LaneEntryExitType
	waypoints : Array<THREE.Vector3>
	annotationColor
	
	constructor(scene? : THREE.Scene, obj? : LaneAnnotationInterface) {
		
		this.id = obj ? obj.id : new Date().getUTCMilliseconds()
		this.annotationColor = obj? obj.annotationColor : Math.random() * 0xffffff
		this.neighborsIds = obj? obj.neighborsIds : new LaneNeighborsIds()
		this.laneMarkers = []
		this.markerMaterial = new THREE.MeshLambertMaterial({color : this.annotationColor, side : THREE.DoubleSide})
		this.activeLaneMaterial = new THREE.MeshBasicMaterial({color : "orange", wireframe : true})
		this.inactiveLaneMaterial = new THREE.MeshLambertMaterial({color: this.annotationColor, side : THREE.DoubleSide})
		this.laneMesh = new THREE.Mesh(new THREE.Geometry(), this.activeLaneMaterial)
		this.laneCenterLine = new THREE.Line(new THREE.Geometry(), new THREE.LineDashedMaterial( { color: 0xffaa00, dashSize: 3, gapSize: 1, linewidth: 2 } ) )
		this.laneDirection = new THREE.Object3D()
		this.laneDirectionMarkers = []
		this.laneDirection.add(this.laneCenterLine)
		this.leftSideType = LaneSideType.UNKNOWN
		this.rightSideType = LaneSideType.UNKNOWN
		this.entryType = LaneEntryExitType.UNKNOWN
		this.exitType = LaneEntryExitType.UNKNOWN
		
		if (scene && obj && obj.markerPositions.length > 0) {
			obj.markerPositions.forEach( (position) => {
				this.addRawMarker(scene, new THREE.Vector3(position.x, position.y, position.z))
			})
			this.updateVisualization()
			this.makeInactive()
		}
	}
	
	/**
	 * Add a single marker to the annotation and the scene.
	 * @param scene
	 * @param position
	 */
	addRawMarker(scene:THREE.Scene, position : THREE.Vector3) {
		let marker = new THREE.Mesh( controlPointGeometry, this.markerMaterial)
		marker.position.set(position.x, position.y, position.z)
		this.laneMarkers.push(marker)
		scene.add(marker)
	}
	
	/**
	 * Add marker. The behavior of this functions changes depending if this is the
	 * first, second, or higher indexed marker.
	 *      - First marker: is equivalent as calling addRawMarker
	 *      - Second marker: has it's height modified to match the height of the first marker
	 *      - Third and onwards: Two markers are added using the passed position and the
	 *                           position of the last two markers.
	 * @param scene
	 * @param x
	 * @param y
	 * @param z
	 */
	addMarker(scene:THREE.Scene, x:number, y:number, z:number) {
		
		let marker = new THREE.Mesh( controlPointGeometry, this.markerMaterial)
		
		marker.position.x = x
		if (this.laneMarkers.length > 0) {
			marker.position.y = this.laneMarkers[this.laneMarkers.length-1].position.y
		} else {
			marker.position.y = y
		}
		
		marker.position.z = z
		
		this.laneMarkers.push(marker)
		scene.add(marker)
		
		// From the third marker onwards, add markers in pairs by estimating the position
		// of the left marker.
		if (this.laneMarkers.length >= 3) {
			let marker2Position = this.computeLeftMarkerEstimatedPosition()
			let marker2 = new THREE.Mesh( controlPointGeometry, this.markerMaterial)
			marker2.position.x = marker2Position.x
			marker2.position.y = marker2Position.y
			marker2.position.z = marker2Position.z
			this.laneMarkers.push(marker2)
			scene.add(marker2)
		}
		
		this.updateVisualization()
	}
	
	/**
	 * Add neighbor to our list of neighbors
	 * @param neighborId
	 * @param neighborLocation
	 */
	addNeighbor(neighborId : number, neighborLocation : NeighborLocation) {
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
	 * @param scene
	 */
	deleteLast(scene : THREE.Scene)  {
		if (this.laneMarkers.length == 0) {
			return
		}
		
		scene.remove(this.laneMarkers.pop())
		
		if (this.laneMarkers.length > 2) {
			scene.remove(this.laneMarkers.pop())
		}
		
		this.updateVisualization()
	}
	
	/**
	 * Make this annotation active. This changes the displayed material.
	 */
	makeActive() {
		this.laneMesh.material = this.activeLaneMaterial
		this.laneDirection.visible = false
	}
	
	/**
	 * Make this annotation inactive. This changes the displayed material.
	 */
	makeInactive() {
		this.laneMesh.material = this.inactiveLaneMaterial
		this.laneDirection.visible = true
	}
	
	/**
	 * Recompute mesh from markers.
	 */
	updateVisualization = () => {
		if (this.laneMarkers.length == 0) {
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
				if (i % 2 == 0) {
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
	
	toJSON() {
		// Create data structure to export (this is the min amount of data
		// needed to reconstruct this object from scratch)
		let data : LaneAnnotationInterface = {
			id: this.id,
			annotationColor : this.annotationColor,
			neighborsIds : this.neighborsIds,
			markerPositions : []
		}
		
		this.laneMarkers.forEach((marker) => {
			data.markerPositions.push(marker.position)
		})
		
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
			let waypoint = this.laneMarkers[i].position.clone();
			waypoint.add(this.laneMarkers[i+1].position).divideScalar(2);
			points.push(waypoint);
		}
		
		let distanceBetweenMarkers  = 5.0 // in meters
		let spline = new THREE.CatmullRomCurve3(points);
		let numPoints = spline.getLength() / distanceBetweenMarkers;
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
			this.laneDirection.remove(marker)
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
			this.laneDirection.add(marker)
			this.laneDirectionMarkers.push(marker)
		}
		
	}
	
}