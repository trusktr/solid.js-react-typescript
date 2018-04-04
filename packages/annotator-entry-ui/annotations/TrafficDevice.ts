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
	export const defaultMaterial = new THREE.MeshLambertMaterial({color: 0x008800, side: THREE.DoubleSide})
	export const defaultContourMaterial = new THREE.LineBasicMaterial({color: 0x00ff00})
	export const associatedMaterial = new THREE.MeshLambertMaterial({color: 0x888800, side: THREE.DoubleSide})
	export const associatedContourMaterial = new THREE.LineBasicMaterial({color: 0xffff00})
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
	planeNormal: THREE.Vector3
	planeCenter: THREE.Vector3
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
		this.trafficDeviceContour = new THREE.Line(new THREE.Geometry(), TrafficDeviceRenderingProperties.defaultContourMaterial)
		this.linkLine = new THREE.Line(new THREE.Geometry(), TrafficDeviceRenderingProperties.associatedContourMaterial)
		this.mesh = new THREE.Mesh(new THREE.Geometry(), TrafficDeviceRenderingProperties.defaultMaterial)
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
		return this.markers.length >= this.minimumMarkerCount && this.type !== TrafficDeviceType.UNKNOWN
	}

	/**
	 * This function works differently from other annotations types. Since the rendering of a traffic device is
	 * pre-defined depending on it's type, we only use this function to specify the location of the device not
	 * it's shape. Therefore this function can only be called once.
	 */
	addMarker(position: THREE.Vector3, updateVisualization: boolean): boolean {
		// Don't allow addition of markers if the isComplete flag is active
		if (this.isComplete) {
			log.warn("Can't add markers to a traffic sign")
			return false
		}

		const marker = new THREE.Mesh(AnnotationRenderingProperties.markerPointGeometry, TrafficDeviceRenderingProperties.markerMaterial)
		marker.position.set(position.x, position.y, position.z)
		this.markers.push(marker)
		this.renderingObject.add(marker)

		this.planeCenter = position
		this.planeNormal = new THREE.Vector3(1.0, 0.0, 0.0)

		this.updateVisualization()
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
		this.mesh.material = TrafficDeviceRenderingProperties.defaultMaterial
		this.trafficDeviceContour.material = TrafficDeviceRenderingProperties.defaultContourMaterial
		this.mesh.visible = true
		this.linkLine.visible = false
		this.unhighlightMarkers()
	}

	setAssociatedMode(position: THREE.Vector3): void {
		this.mesh.material = TrafficDeviceRenderingProperties.associatedMaterial
		this.trafficDeviceContour.material = TrafficDeviceRenderingProperties.associatedContourMaterial
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
		if (this.markers.length < 1) {
			return
		}
		// TODO: If normal or center have changed recompute plane
		const newMeshGeometry = new THREE.PlaneGeometry(0.8, 0.8)
		newMeshGeometry.translate(this.planeCenter.x, this.planeCenter.y, this.planeCenter.z)
		newMeshGeometry.computeFaceNormals()
		this.mesh.geometry = newMeshGeometry
		this.mesh.geometry.verticesNeedUpdate = true

		const newContourGeometry = new THREE.Geometry()
		newContourGeometry.vertices = this.mesh.geometry.vertices
		this.trafficDeviceContour.geometry = newContourGeometry
		this.trafficDeviceContour.geometry.verticesNeedUpdate = true
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
