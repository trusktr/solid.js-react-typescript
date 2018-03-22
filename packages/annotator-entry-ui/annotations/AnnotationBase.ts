
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

export interface UtmJson {
	'E': number,
	'N': number,
	'alt': number,
}

export interface LlaJson {
	'lng': number,
	'lat': number,
	'alt': number,
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
	abstract minimumMarkerCount: number // Minimum to form a valid annotation
	abstract markersFormRing: boolean   // The array of markers forms a closed loop when the annotation is complete
	abstract allowNewMarkers: boolean   // Allow interactive addition of markers after the annotation is created
	abstract mesh: THREE.Mesh           // Represents the physical extents of the annotation
	renderingObject: THREE.Object3D		// Object that is added to the scene for display
	abstract snapToGround: boolean      // Preference for where to place markers

	constructor(inputInterface?: AnnotationJsonInputInterface) {
		this.id = AnnotationCounter.nextId()
		this.uuid = inputInterface && inputInterface.uuid ? inputInterface.uuid : UUID.v1()
		this.markers = []
		this.renderingObject = new THREE.Object3D()
	}

	abstract toJSON(pointConverter?: (p: THREE.Vector3) => Object): AnnotationJsonOutputInterface
	abstract isValid(): boolean
	abstract addMarker(position: THREE.Vector3, updateVisualization: boolean): boolean
	abstract deleteLastMarker(): boolean
	abstract complete(): boolean        // Close the loop of markers or do any other clean-up to designate an annotation "complete"
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

	makeVisible(): void {
		this.renderingObject.visible = true
	}

	makeInvisible(): void {
		this.renderingObject.visible = false
	}

	join(annotation: Annotation): boolean {
		return false
	}
}
