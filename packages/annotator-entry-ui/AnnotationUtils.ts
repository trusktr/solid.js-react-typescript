/**
 *  Copyright 2017 Mapper Inc. Part of the mapper-annotator project.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import {LaneAnnotation} from 'annotator-entry-ui/LaneAnnotation'
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
	
	addLaneAnnotation(scene:THREE.Scene) {
		this.annotations.push(new LaneAnnotation())
		this.changeActiveAnnotation(this.annotations.length-1)
		this.annotationMeshes.push(this.annotations[this.activeAnnotationIndex].laneMesh)
		scene.add(this.annotations[this.activeAnnotationIndex].laneMesh)
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
	
}
