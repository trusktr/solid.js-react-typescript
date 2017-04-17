/**
 *  Copyright 2017 Mapper Inc. Part of the mapper-annotator project.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as THREE from 'three'
import {LaneAnnotation, NeighborDirection, NeighborLocation} from 'annotator-entry-ui/LaneAnnotation'
import * as TypeLogger from 'typelogger'

TypeLogger.setLoggerOutput(console as any)
const log = TypeLogger.getLogger(__filename)


export class AnnotationManager {
	annotations : Array<LaneAnnotation>
	annotationMeshes : Array<THREE.Mesh>
	activeMarkers : Array<THREE.Mesh>
	activeAnnotationIndex : number
	
	constructor() {
		this.annotations = []
		this.annotationMeshes = []
		this.activeMarkers = []
		this.activeAnnotationIndex = -1
	}
	
	getAnnotationIndex(object) : number {
		let index = this.annotations.findIndex( (element) => {
			return element.laneMesh == object
		})
		
		return index
	}
	
	checkForInactiveAnnotation(object) : number {
		let index = this.getAnnotationIndex(object)
		if (index == this.activeAnnotationIndex) {
			index = -1
		}
		return index
	}
	
	changeActiveAnnotation(annotationIndex) {
		
		if (annotationIndex < 0 &&
			annotationIndex >= this.annotations.length &&
			annotationIndex == this.activeAnnotationIndex) {
			return
		}
		
		if (this.activeAnnotationIndex >= 0) {
			this.annotations[this.activeAnnotationIndex].makeInactive()
		}

		this.activeAnnotationIndex = annotationIndex
		this.annotations[this.activeAnnotationIndex].makeActive()
		this.activeMarkers = this.annotations[this.activeAnnotationIndex].laneMarkers
	}
	
	makeLastAnnotationActive() {
		this.changeActiveAnnotation(this.annotations.length-1)
	}
	
	addLaneAnnotation(scene:THREE.Scene) {
		this.annotations.push(new LaneAnnotation())
		let newAnnotationIndex = this.annotations.length-1
		this.annotationMeshes.push(this.annotations[newAnnotationIndex].laneMesh)
		scene.add(this.annotations[newAnnotationIndex].laneMesh)
	}
	
	addLaneMarker(scene:THREE.Scene, x:number, y:number, z:number) {
		if (this.activeAnnotationIndex < 0) {
			log.info("No active annotation. Can't add marker")
			return
		}
		this.annotations[this.activeAnnotationIndex].addMarker(scene, x, y, z)
	}
	
	deleteLastLaneMarker(scene:THREE.Scene) {
		if (this.activeAnnotationIndex < 0) {
			log.info("No active annotation. Can't delete marker")
			return
		}
		this.annotations[this.activeAnnotationIndex].deleteLast(scene)
	}
	
	updateActiveLaneMesh() {
		if (this.activeAnnotationIndex < 0) {
			log.info("No active annotation. Can't update mesh")
			return
		}
		this.annotations[this.activeAnnotationIndex].generateMeshFromMarkers()
	}
	
	addConnectedLaneAnnotation(scene:THREE.Scene, neigborLocation : NeighborLocation, neighborDirection : NeighborDirection) {
		if (this.activeAnnotationIndex < 0) {
			log.info("Can't add connected lane. No annotation is active.")
			return
		}
		
		switch (neigborLocation) {
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

		this.annotations[newAnnotationIndex].neighbors.back.push(this.annotations[this.activeAnnotationIndex])
		this.annotations[this.activeAnnotationIndex].neighbors.front.push(this.annotations[newAnnotationIndex])

		this.annotations[newAnnotationIndex].generateMeshFromMarkers()
		this.annotations[newAnnotationIndex].makeInactive()
	}
	
	/**
	 * Adds a new lane annotation to the left of the current active annotation. It initializes its
	 * lane markers as a mirror of the active annotation. The order of the markers depends on the
	 * given direction of the neighbor.
	 * @param neighborDirection [SAME, REVERSE]
	 */
	private addLeftConnection(scene:THREE.Scene, neighborDirection : NeighborDirection) {
		
		if (this.annotations[this.activeAnnotationIndex].neighbors.left != null) {
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
				this.annotations[newAnnotationIndex].neighbors.right = this.annotations[this.activeAnnotationIndex]
				this.annotations[this.activeAnnotationIndex].neighbors.left = this.annotations[newAnnotationIndex]
				
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
				this.annotations[newAnnotationIndex].neighbors.left = this.annotations[this.activeAnnotationIndex]
				this.annotations[this.activeAnnotationIndex].neighbors.left = this.annotations[newAnnotationIndex]
				
				break
			
			default:
				log.warn('Unrecognized neighbor direction.')
				break
		}
		
		this.annotations[newAnnotationIndex].generateMeshFromMarkers()
		this.annotations[newAnnotationIndex].makeInactive()
	}
	
	/**
	 * Adds a new lane annotation to the right of the current active annotation. It initializes its
	 * lane markers as a mirror of the active annotation. The order of the markers depends on the
	 * given direction of the neighbor.
	 * @param neighborDirection [SAME,REVERSE]
	 */
	private addRightConnection(scene:THREE.Scene, neighborDirection : NeighborDirection) {
		if (this.annotations[this.activeAnnotationIndex].neighbors.right != null) {
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
				this.annotations[newAnnotationIndex].neighbors.left = this.annotations[this.activeAnnotationIndex]
				this.annotations[this.activeAnnotationIndex].neighbors.right = this.annotations[newAnnotationIndex]
				
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
				this.annotations[newAnnotationIndex].neighbors.right = this.annotations[this.activeAnnotationIndex]
				this.annotations[this.activeAnnotationIndex].neighbors.right = this.annotations[newAnnotationIndex]
				
				break
			
			default:
				log.warn('Unrecognized neighbor direction.')
				break
		}
		
		this.annotations[newAnnotationIndex].generateMeshFromMarkers()
		this.annotations[newAnnotationIndex].makeInactive()
	}
}
