/**
 * Created by alonso on 4/11/17.
 */

import {LaneAnnotation} from 'annotator-entry-ui/LaneAnnotation'
import * as TypeLogger from 'typelogger'

TypeLogger.setLoggerOutput(console as any)
const log = TypeLogger.getLogger(__filename)


export class AnnotationManager {
	annotations : Array<LaneAnnotation>
	activeAnnotation : number
	
	constructor() {
		this.annotations = []
		this.activeAnnotation = -1
	}
	
	addLaneAnnotation(scene:THREE.Scene) {
		this.activeAnnotation = this.annotations.length
		this.annotations.push(new LaneAnnotation())
		scene.add(this.annotations[this.activeAnnotation].laneMesh)
	}
	
	addLaneMarker(scene:THREE.Scene, x:number, y:number, z:number) {
		if (this.activeAnnotation < 0) {
			log.info("No active annotation. Can't add marker")
			return
		}
		this.annotations[this.activeAnnotation].addMarker(scene, x, y, z)
	}
	
	deleteLastLaneMarker(scene:THREE.Scene) {
		if (this.activeAnnotation < 0) {
			log.info("No active annotation. Can't delete marker")
			return
		}
		this.annotations[this.activeAnnotation].deleteLast(scene)
	}
	
	activeMarkers() : Array<THREE.Mesh> {
		if (this.activeAnnotation < 0) {
			log.info("No active markers")
			return []
		}
		return this.annotations[this.activeAnnotation].laneMarkers
	}
	
	updateActiveLaneMesh() {
		if (this.activeAnnotation < 0) {
			log.info("No active annotation. Can't update mesh")
			return
		}
		this.annotations[this.activeAnnotation].generateMeshFromMarkers()
	}
	
}
