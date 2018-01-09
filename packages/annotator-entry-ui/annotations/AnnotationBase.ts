
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

export interface AnnotationJsonInputInterface {
	annotationType: string // stringified instance of enum AnnotationType
	uuid: AnnotationUuid
	markers: Array<THREE.Vector3>
}

export interface AnnotationJsonOutputInterface {
	annotationType: string // stringified instance of enum AnnotationType
	uuid: AnnotationUuid
	markers: Array<Object>
}

export namespace AnnotationRenderingProperties {
	export const markerPointGeometry = new THREE.BoxGeometry(0.2, 0.2, 0.2)
	export const markerHighlightPointGeometry = new THREE.BoxGeometry(0.5, 0.5, 0.5)
}

export abstract class Annotation {
	id: AnnotationId	 				// A small integer, for use in the UI during one session
	uuid: AnnotationUuid 				// A UUID, for use across distributed applications
	markers: Array<THREE.Mesh> 			// Control point used to edit the annotation
	abstract mesh: THREE.Mesh           // Represents the physical extents of the annotation
	renderingObject: THREE.Object3D		// Object that is added to the scene for display

	constructor(inputInterface?: AnnotationJsonInputInterface) {
		this.id = AnnotationCounter.nextId()
		this.uuid = inputInterface && inputInterface.uuid ? inputInterface.uuid : UUID.v1()
		this.markers = []
		this.renderingObject = new THREE.Object3D()
	}

	abstract toJSON(pointConverter?: (p: THREE.Vector3) => Object): AnnotationJsonOutputInterface
	abstract isValid(): boolean
	abstract addMarker(position: THREE.Vector3, isLastMarker: boolean): boolean
	abstract deleteLastMarker(): boolean
	abstract makeActive(): void
	abstract makeInactive(): void
	abstract setLiveMode(): void
	abstract unsetLiveMode(): void
	abstract updateVisualization(): void

	boundingBox(): THREE.Box3 {
		this.mesh.geometry.computeBoundingBox()
		return this.mesh.geometry.boundingBox
	}

	/**
	 * Intersect requested markers with active markers.
	 * Draw the markers a little larger.
	 */
	highlightMarkers(markers: Array<THREE.Mesh>): void {
		const ids: Array<number> = markers.map(m => m.id)
		this.markers.forEach(marker => {
			ids.filter(id => id === marker.id).forEach(() => {
				marker.geometry = AnnotationRenderingProperties.markerHighlightPointGeometry
			})
		})
	}

	/**
	 * Draw all markers at normal size.
	 */
	unhighlightMarkers(): void {
		this.markers.forEach(marker => {
			marker.geometry = AnnotationRenderingProperties.markerPointGeometry
		})
	}
}
