/**
 *  Copyright 2017 Mapper Inc. Part of the mapper-annotator project.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as THREE from 'three'
import * as TypeLogger from 'typelogger'

TypeLogger.setLoggerOutput(console as any)
const log = TypeLogger.getLogger(__filename)

const controlPointGeometry = new THREE.BoxGeometry( 1, 1, 1 );

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


class LaneNeighborsIds {
	right : number
	left : number
	front : Array<number>
	back : Array<number>
}


/**
 * LaneAnnotation class.
 */
export class LaneAnnotation {
	// Lane markers are stored in an array as [right, left, right, left, ...]
	id
	laneMarkers : Array<THREE.Mesh>
	laneMesh : THREE.Mesh
	markerMaterial :  THREE.MeshLambertMaterial
	activeLaneMaterial : THREE.MeshBasicMaterial
	inactiveLaneMaterial : THREE.MeshLambertMaterial
	neighborsIds : LaneNeighborsIds
	annotationColor
	
	constructor() {
		this.id = new Date().getUTCMilliseconds()
		this.annotationColor = Math.random() * 0xffffff
		this.markerMaterial = new THREE.MeshLambertMaterial({color : this.annotationColor})
		this.activeLaneMaterial = new THREE.MeshBasicMaterial({color : "orange", wireframe : true})
		this.inactiveLaneMaterial = new THREE.MeshLambertMaterial({color: this.annotationColor})
		this.laneMesh = new THREE.Mesh(new THREE.Geometry(), this.activeLaneMaterial)
		
		this.laneMarkers = []
		this.neighborsIds = new LaneNeighborsIds()
		this.neighborsIds.front = []
		this.neighborsIds.back = []
		this.neighborsIds.left = null
		this.neighborsIds.right = null
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
		
		this.generateMeshFromMarkers()
	}
	
	/**
	 * Add neighbor to our list of neighbors
	 * @param neighbor
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
		
		this.generateMeshFromMarkers()
	}
	
	/**
	 * Make this annotation active. This changes the displayed material.
	 */
	makeActive() {
		this.laneMesh.material = this.activeLaneMaterial
	}
	
	/**
	 * Make this annotation inactive. This changes the displayed material.
	 */
	makeInactive() {
		this.laneMesh.material = this.inactiveLaneMaterial
	}
	
	/**
	 * Recompute mesh from markers.
	 */
	generateMeshFromMarkers = () => {
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
	}
	
	toJSON() {
		// Create data structure to export (this is the min amount of data
		// needed to reconstruct this object from scratch)
		let data = {
			markerPositions: [], color: null,
			rightNeighbor: null, leftNeighbor: null, frontNeighbors: [],
			backNeighbors: []
		}
		
		data.color = this.annotationColor
		
		this.laneMarkers.forEach((marker) => {
			data.markerPositions.push(marker.position)
		})
		
		if (this.neighborsIds.left != null) {
			data.leftNeighbor = this.neighborsIds.left
		}
		
		if (this.neighborsIds.right != null) {
			data.rightNeighbor = this.neighborsIds.right
		}
		
		this.neighborsIds.front.forEach( (id) => {
			data.frontNeighbors.push(id)
		})
		
		this.neighborsIds.back.forEach( (id) => {
			data.backNeighbors.push(id)
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
	
}