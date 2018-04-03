/**
 *  Copyright 2018 Mapper Inc. Part of the mapper-annotator project.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as THREE from 'three'
import * as TypeLogger from 'typelogger'
import {Annotation, AnnotationRenderingProperties} from './AnnotationBase'
import {AnnotationGeometryType, AnnotationJsonInputInterface, AnnotationJsonOutputInterface} from "./AnnotationBase"
import {AnnotationType} from "./AnnotationType"
import {isNullOrUndefined} from "util"

// tslint:disable-next-line:no-any
TypeLogger.setLoggerOutput(console as any)
const log = TypeLogger.getLogger(__filename)

export enum TrafficDeviceType {
	UNKNOWN = 0,
	STOP,
	YIELD,
	RYG_LIGHT,
	RYG_LEFT_ARROW_LIGHT,
	OTHER
}

// Some variables used for rendering
namespace TrafficDeviceRenderingProperties {
	export const markerMaterial = new THREE.MeshLambertMaterial({color: 0xffffff, side: THREE.DoubleSide})
	export const meshMaterial = new THREE.MeshLambertMaterial({color: 0x008800, side: THREE.DoubleSide})
	export const contourMaterial = new THREE.LineBasicMaterial({color: 0x00ff00})
	export const associatedMaterial = new THREE.MeshLambertMaterial({color: 0x888800, side: THREE.DoubleSide})
	export const associatedContour = new THREE.LineBasicMaterial({color: 0xffff00})
}

export interface TrafficDeviceJsonInputInterface extends AnnotationJsonInputInterface {
	trafficDeviceType: string
}

export interface TrafficDeviceJsonOutputInterface extends AnnotationJsonOutputInterface {
	trafficDeviceType: string
}

export class TrafficDevice extends Annotation {
	annotationType: AnnotationType
	geometryType: AnnotationGeometryType
	type: TrafficDeviceType
	minimumMarkerCount: number
	allowNewMarkers: boolean
	snapToGround: boolean
	trafficDeviceContour: THREE.Line
	linkLine: THREE.Line
	mesh: THREE.Mesh
	isComplete: boolean

	constructor(obj?: TrafficDeviceJsonInputInterface) {
		super(obj)
		this.annotationType = AnnotationType.TRAFFIC_DEVICE
		this.geometryType = AnnotationGeometryType.RING
		if (obj) {
			this.type = isNullOrUndefined(TrafficDeviceType[obj.trafficDeviceType]) ? TrafficDeviceType.UNKNOWN : TrafficDeviceType[obj.trafficDeviceType]
		} else {
			this.type = TrafficDeviceType.UNKNOWN
		}

		this.minimumMarkerCount = 3
		this.allowNewMarkers = true
		this.snapToGround = false
		this.isComplete = false
		this.trafficDeviceContour = new THREE.Line(new THREE.Geometry(), TrafficDeviceRenderingProperties.contourMaterial)
		this.linkLine = new THREE.Line(new THREE.Geometry(), TrafficDeviceRenderingProperties.associatedContour)
		this.mesh = new THREE.Mesh(new THREE.Geometry(), TrafficDeviceRenderingProperties.meshMaterial)
		this.renderingObject.add(this.mesh)
		this.renderingObject.add(this.trafficDeviceContour)
		this.renderingObject.add(this.linkLine)
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

		const marker = new THREE.Mesh(AnnotationRenderingProperties.markerPointGeometry, TrafficDeviceRenderingProperties.markerMaterial)
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
		this.linkLine.visible = false
	}

	makeInactive(): void {
		this.mesh.material = TrafficDeviceRenderingProperties.meshMaterial
		this.trafficDeviceContour.material = TrafficDeviceRenderingProperties.contourMaterial
		this.mesh.visible = true
		this.linkLine.visible = false
		this.unhighlightMarkers()
	}

	setAssociatedMode(position: THREE.Vector3): void {
		this.mesh.material = TrafficDeviceRenderingProperties.associatedMaterial
		this.trafficDeviceContour.material = TrafficDeviceRenderingProperties.associatedContour
		this.mesh.visible = true

		const newLinkGeometry = new THREE.Geometry()
		newLinkGeometry.vertices.push(position)
		newLinkGeometry.vertices.push(this.getCenterPoint())
		newLinkGeometry.computeLineDistances()
		this.linkLine.geometry = newLinkGeometry
		this.linkLine.geometry.verticesNeedUpdate = true
		this.linkLine.visible = true
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
			this.trafficDeviceContour.geometry = newContourGeometry
			this.trafficDeviceContour.geometry.verticesNeedUpdate = true
			return
		}

		// Push the first vertex again to close the loop
		newContourGeometry.vertices.push(this.markers[0].position)
		newContourGeometry.computeLineDistances()
		this.trafficDeviceContour.geometry = newContourGeometry
		this.trafficDeviceContour.geometry.verticesNeedUpdate = true

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

	getCenterPoint(): THREE.Vector3 {
		const geometry = this.mesh.geometry;
		geometry.computeBoundingBox();
		const center = geometry.boundingBox.getCenter();
		this.mesh.localToWorld( center );
		return center;
	}

	toJSON(pointConverter?: (p: THREE.Vector3) => Object): TrafficDeviceJsonOutputInterface {
		// Create data structure to export (this is the min amount of data
		// needed to reconstruct this object from scratch)
		const data: TrafficDeviceJsonOutputInterface = {
			annotationType: AnnotationType[AnnotationType.TRAFFIC_DEVICE],
			uuid: this.uuid,
			trafficDeviceType: TrafficDeviceType[this.type],
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
