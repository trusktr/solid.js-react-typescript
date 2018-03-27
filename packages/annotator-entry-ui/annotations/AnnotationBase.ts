/**
 *  Copyright 2018 Mapper Inc. Part of the mapper-annotator project.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as lodash from 'lodash'
import * as THREE from 'three'
import * as UUID from 'uuid'
import * as TypeLogger from 'typelogger'
import {AnnotationType} from "./AnnotationType"
import {isNumber} from "util"

// tslint:disable-next-line:no-any
TypeLogger.setLoggerOutput(console as any)
const log = TypeLogger.getLogger(__filename)

export type AnnotationId = number
export type AnnotationUuid = string

namespace AnnotationCounter {
	let i = 0

	export function nextId(): number {
		return ++i
	}
}

export enum AnnotationGeometryType {
	RING,
	LINEAR,
	PAIRED_LINEAR,
}

const pairSize = 2

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
	abstract annotationType: AnnotationType // Its type, expressed as an enumeration for convenience
	abstract geometryType: AnnotationGeometryType
	id: AnnotationId	 				// A small integer, for use in the UI during one session
	uuid: AnnotationUuid 				// A UUID, for use across distributed applications
	markers: Array<THREE.Mesh> 			// Control point used to edit the annotation
	abstract minimumMarkerCount: number // Minimum to form a valid annotation
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

	// The array of markers forms a closed loop when the annotation is complete.
	markersFormRing(): boolean {
		return this.geometryType === AnnotationGeometryType.RING
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

	/**
	 * Get all markers that share an edge with the origin, up to a given distance in either direction.
	 * Origin is not included in the result.
	 * Distance is a count of markers, not a physical distance.
	 * Sort order is not specified.
	 */
	neighboringMarkers(origin: THREE.Mesh, distance: number): Array<THREE.Mesh> {
		if (distance < 1) return []
		const len = this.markers.length
		if (len < 2) return []

		// Find the origin.
		let originIndex = -1
		for (let i = 0; i < len; i++) {
			if (this.markers[i].id === origin.id) {
				originIndex = i
				break
			}
		}
		if (originIndex === -1) return []

		// Find the neighbors.
		let min: number
		let max: number
		let neighborIndexes: number[] = []
		switch (this.geometryType) {
			// Search all markers. Clip at the ends of the markers array.
			case AnnotationGeometryType.LINEAR:
				min = originIndex - distance
				if (min < 0) min = 0
				max = originIndex + distance + 1
				if (max > len) max = len
				neighborIndexes = lodash.range(min, max)
				break

			// Search all markers on one edge (ie either the even or the odd markers). Clip at the ends of the edge.
			case AnnotationGeometryType.PAIRED_LINEAR:
				min = originIndex - distance * pairSize
				if (min < 0) min = originIndex % pairSize
				max = originIndex + distance * pairSize + 1
				if (max > len) max = len
				neighborIndexes = lodash.range(min, max, pairSize)
				break

			// Search all markers on the ring.
			case AnnotationGeometryType.RING:
				let loopedMin: number | null = null
				let loopedMax: number | null = null
				if (distance * 2 + 1 >= len) {
					// Get the whole ring.
					min = 0
					max = len
				} else {
					// Get a subset.
					min = originIndex - distance
					if (min < 0) {
						loopedMin = len + min
						loopedMax = len
						min = 0
					}
					max = originIndex + distance + 1
					if (max > len) {
						loopedMin = 0
						loopedMax = max - len
						max = len
					}
				}
				neighborIndexes = lodash.range(min, max)
				if (isNumber(loopedMin) && isNumber(loopedMax))
					neighborIndexes = neighborIndexes.concat(lodash.range(loopedMin, loopedMax))
				break

			default:
				log.error(`unknown AnnotationGeometryType ${this.geometryType}`)
		}

		// Remove origin from the result.
		for (let i = 0; i < neighborIndexes.length; i++) {
			if (neighborIndexes[i] === originIndex) {
				neighborIndexes.splice(i, 1)
				break
			}
		}

		return neighborIndexes.map(i => this.markers[i])
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
