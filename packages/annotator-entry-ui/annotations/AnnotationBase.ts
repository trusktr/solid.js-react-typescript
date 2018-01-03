
import * as THREE from 'three'
import * as UUID from 'uuid'

export type AnnotationId = number
export type AnnotationUuid = string

namespace AnnotationCounter {
	let i = 0

	export function nextId(): number {
		return ++i
	}
}

export abstract class Annotation {
	id: AnnotationId	 				// A small integer, for use in the UI during one session
	uuid: AnnotationUuid 				// A UUID, for use across distributed applications
	markers: Array<THREE.Mesh> 			// Control point used to edit the annotation
	renderingObject: THREE.Object3D		// Object that is added to the scene for display

	constructor() {
		this.id = AnnotationCounter.nextId()
		this.uuid = UUID.v1()
		this.markers = []
		this.renderingObject = new THREE.Object3D()
	}

	abstract addMarker(position: THREE.Vector3, isLastMarker: boolean): void
	abstract deleteLastMarker(): void
	abstract makeActive(): void
	abstract makeInactive(): void
	abstract setLiveMode(): void
	abstract unsetLiveMode(): void
	abstract highlightMarkers(markers: Array<THREE.Mesh>): void
	abstract unhighlightMarkers(): void
	abstract updateVisualization(): void
}
