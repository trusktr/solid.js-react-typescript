/**
 *  Copyright 2018 Mapper Inc. Part of the mapper-annotator project.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as THREE from 'three'
import * as TypeLogger from 'typelogger'
import {Annotation, AnnotationRenderingProperties} from 'annotator-entry-ui/annotations/AnnotationBase'
import {AnnotationJsonInputInterface, AnnotationJsonOutputInterface} from "./AnnotationBase"
import {AnnotationType} from "./AnnotationType"
import {isNullOrUndefined} from "util"

// tslint:disable-next-line:no-any
TypeLogger.setLoggerOutput(console as any)
const log = TypeLogger.getLogger(__filename)

export enum TrafficSignType {
	UNKNOWN = 0,
	TRAFFIC_LIGHT,
	STOP,
	YIELD,
	OTHER
}

// Some variables used for rendering
namespace TrafficSignRenderingProperties {
	export const markerMaterial = new THREE.MeshLambertMaterial({color: 0xffffff, side: THREE.DoubleSide})
	export const meshMaterial = new THREE.MeshLambertMaterial({color: 0x00ff00, side: THREE.DoubleSide})
	export const contourMaterial = new THREE.LineBasicMaterial({color: 0x0000ff})
}

export interface TrafficSignJsonInputInterface extends AnnotationJsonInputInterface {
	trafficSignType: string
}

export interface TrafficSignJsonOutputInterface extends AnnotationJsonOutputInterface {
	trafficSignType: string
}

export class TrafficSign extends Annotation {
	type: TrafficSignType
	minimumMarkerCount: number
	markersFormRing: boolean
	allowNewMarkers: boolean
	snapToGround: boolean
	trafficSignContour: THREE.Line
	mesh: THREE.Mesh
	isComplete: boolean

	constructor(obj?: TrafficSignJsonInputInterface) {
		super(obj)
		if (obj) {
			this.type = isNullOrUndefined(TrafficSignType[obj.trafficSignType]) ? TrafficSignType.UNKNOWN : TrafficSignType[obj.trafficSignType]
		} else {
			this.type = TrafficSignType.UNKNOWN
		}

		this.minimumMarkerCount = 3
		this.markersFormRing = true
		this.allowNewMarkers = true
		this.snapToGround = false
		this.isComplete = false
		this.trafficSignContour = new THREE.Line(new THREE.Geometry(), TrafficSignRenderingProperties.contourMaterial)
		this.mesh = new THREE.Mesh(new THREE.Geometry(), TrafficSignRenderingProperties.meshMaterial)
		this.renderingObject.add(this.mesh)
		this.renderingObject.add(this.trafficSignContour)
		this.mesh.visible = false

		if (obj) {
			if (obj.markers.length >= this.minimumMarkerCount) {
				obj.markers.forEach(marker => this.addMarker(marker, false))
				this.isComplete = true
				if (!this.isValid())
					throw Error(`can't load invalid traffic sign with id ${obj.uuid}`)
				this.updateVisualization()
				this.makeInactive()
			}
		}
	}

	isValid(): boolean {
		return this.markers.length >= this.minimumMarkerCount
	}

	addMarker(position: THREE.Vector3, updateVisualization: boolean): boolean {
		// Don't allow addition of markers if the isComplete flag is active
		if (this.isComplete) {
			log.warn("Last marker was already added. Can't add more markers. Delete a marker to allow more marker additions.")
			return false
		}

		const marker = new THREE.Mesh(AnnotationRenderingProperties.markerPointGeometry, TrafficSignRenderingProperties.markerMaterial)
		marker.position.set(position.x, position.y, position.z)
		this.markers.push(marker)
		this.renderingObject.add(marker)

		if (updateVisualization) this.updateVisualization()
		return true
	}

	deleteLastMarker(): boolean {
		if (this.markers.length === 0) {
			log.warn('No markers to delete in this annotation')
			return false
		}

		this.renderingObject.remove(this.markers.pop()!)

		// Check if the deleted marker was marked as the last in the annotation. If so, reset the
		// isComplete flag
		if (this.isComplete) {
			this.isComplete = false
		}
		this.updateVisualization()

		return true
	}

	complete(): boolean {
		if (this.isComplete) {
			log.warn("Annotation is already complete. Delete a marker to re-open it.")
			return false
		}

		this.isComplete = true
		this.updateVisualization()

		return true
	}

	makeActive(): void {
		this.mesh.visible = false
	}

	makeInactive(): void {
		this.mesh.visible = true
		this.unhighlightMarkers()
	}

	setLiveMode(): void {
		this.markers.forEach((marker) => {
			marker.visible = false
		})
	}

	unsetLiveMode(): void {
		this.markers.forEach((marker) => {
			marker.visible = true
		})
		this.makeInactive()
	}

	updateVisualization(): void {
		// Check if there are at least two markers
		if (this.markers.length < 2) {
			return
		}

		const newContourGeometry = new THREE.Geometry()
		const contourMean = new THREE.Vector3(0, 0, 0)

		this.markers.forEach((marker) => {
			newContourGeometry.vertices.push(marker.position)
			contourMean.add(marker.position)
		})

		contourMean.divideScalar(this.markers.length)

		if (this.isComplete === false) {
			newContourGeometry.computeLineDistances()
			this.trafficSignContour.geometry = newContourGeometry
			this.trafficSignContour.geometry.verticesNeedUpdate = true
			return
		}

		// Push the first vertex again to close the loop
		newContourGeometry.vertices.push(this.markers[0].position)
		newContourGeometry.computeLineDistances()
		this.trafficSignContour.geometry = newContourGeometry
		this.trafficSignContour.geometry.verticesNeedUpdate = true

		const newMeshGeometry = new THREE.Geometry()

		// We need at least 3 vertices to generate a mesh
		// NOTE: We assume that the contour of the annotation is convex
		if (newContourGeometry.vertices.length > 2) {
			// Add all vertices
			newContourGeometry.vertices.forEach( (v) => {
				newMeshGeometry.vertices.push(v.clone())
			})
			newMeshGeometry.vertices.push( contourMean )
			const centerIndex = newMeshGeometry.vertices.length - 1

			for (let i = 0; i < newMeshGeometry.vertices.length - 2; ++i) {
				newMeshGeometry.faces.push(new THREE.Face3(centerIndex, i, i + 1))
			}
		}
		newMeshGeometry.computeFaceNormals()
		this.mesh.geometry = newMeshGeometry
		this.mesh.geometry.verticesNeedUpdate = true
	}

	toJSON(pointConverter?: (p: THREE.Vector3) => Object): TrafficSignJsonOutputInterface {
		// Create data structure to export (this is the min amount of data
		// needed to reconstruct this object from scratch)
		const data: TrafficSignJsonOutputInterface = {
			annotationType: AnnotationType[AnnotationType.TRAFFIC_SIGN],
			uuid: this.uuid,
			trafficSignType: TrafficSignType[this.type],
			markers: [],
		}

		if (this.markers) {
			this.markers.forEach((marker) => {
				if (pointConverter) {
					data.markers.push(pointConverter(marker.position))
				} else {
					data.markers.push(marker.position)
				}
			})
		}

		return data
	}
}
