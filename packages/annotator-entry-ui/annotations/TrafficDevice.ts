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

const stopURL = require('../../annotator-assets/images/stop.png')
const yieldURL = require('../../annotator-assets/images/yield.png')

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
	export const activeContourMaterial = new THREE.LineBasicMaterial({color: 0xffff00, linewidth: 2})
	export const stopTexture = new THREE.TextureLoader().load(stopURL)
	export const yieldTexture = new THREE.TextureLoader().load(yieldURL)
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

		this.minimumMarkerCount = 1
		this.allowNewMarkers = true
		this.snapToGround = false
		this.trafficDeviceContour = new THREE.Line(new THREE.Geometry(), TrafficDeviceRenderingProperties.defaultContourMaterial)
		this.linkLine = new THREE.Line(new THREE.Geometry(), TrafficDeviceRenderingProperties.activeContourMaterial)
		this.mesh = new THREE.Mesh(new THREE.Geometry(), TrafficDeviceRenderingProperties.defaultMaterial)
		this.renderingObject.add(this.mesh)
		this.renderingObject.add(this.trafficDeviceContour)
		this.renderingObject.add(this.linkLine)

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
	 * it's shape.
	 */
	addMarker(position: THREE.Vector3, updateVisualization: boolean): boolean {
		if (this.markers.length > 0) {
			log.info("This annotation type doesn't allow more than one marker")
			return false
		}

		const marker = new THREE.Mesh(AnnotationRenderingProperties.markerPointGeometry, TrafficDeviceRenderingProperties.markerMaterial)
		marker.geometry.scale(0.5, 0.5, 0.5)
		marker.position.set(position.x, position.y, position.z)
		this.markers.push(marker)
		this.renderingObject.add(marker)
		this.planeCenter = position
		// TODO: Get a better initialization of the orientation
		this.planeNormal = new THREE.Vector3(1.0, 0.0, 0.0)

		if (updateVisualization)
			this.updateVisualization()

		return true
	}

	/**
	 * This function is not used for this annotation class
	 */
	deleteLastMarker(): boolean {
		log.warn('No markers to delete in traffic devices')
		return true
	}

	/**
	 * This function is not used for this annotation class=
	 */
	complete(): boolean {
		return true
	}

	makeActive(): void {
		this.trafficDeviceContour.material = TrafficDeviceRenderingProperties.activeContourMaterial
		this.linkLine.visible = false
		if (this.markers.length > 0)
			this.markers[0].visible = true
	}

	makeInactive(): void {
		this.trafficDeviceContour.material = TrafficDeviceRenderingProperties.defaultContourMaterial
		this.linkLine.visible = false
		if (this.markers.length > 0)
			this.markers[0].visible = false
		this.unhighlightMarkers()
	}

	setAssociatedMode(position: THREE.Vector3): void {
		this.trafficDeviceContour.material = TrafficDeviceRenderingProperties.activeContourMaterial
		const newLinkGeometry = new THREE.Geometry()
		newLinkGeometry.vertices.push(position)
		newLinkGeometry.vertices.push(this.getCenterPoint())
		newLinkGeometry.computeLineDistances()
		this.linkLine.geometry = newLinkGeometry
		this.linkLine.geometry.verticesNeedUpdate = true
		this.linkLine.visible = true
		if (this.markers.length > 0)
			this.markers[0].visible = false
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
		this.planeCenter = this.markers[0].position

		// TODO: If normal or center have changed recompute plane
		const newMeshGeometry = new THREE.PlaneGeometry(0.8, 0.8)
		newMeshGeometry.translate(this.planeCenter.x, this.planeCenter.y, this.planeCenter.z)
		newMeshGeometry.computeFaceNormals()
		this.mesh.geometry = newMeshGeometry

		switch (this.type) {
			case TrafficDeviceType.STOP:
				const stopMaterial = new THREE.MeshBasicMaterial({map: TrafficDeviceRenderingProperties.stopTexture, side: THREE.DoubleSide})
				this.mesh.material = stopMaterial
				this.mesh.material.transparent = true
				break
			case TrafficDeviceType.YIELD:
				const yieldMaterial = new THREE.MeshBasicMaterial({map: TrafficDeviceRenderingProperties.yieldTexture, side: THREE.DoubleSide})
				this.mesh.material = yieldMaterial
				this.mesh.material.transparent = true
				break
			default:
				this.mesh.material = TrafficDeviceRenderingProperties.defaultMaterial
		}

		this.mesh.geometry.verticesNeedUpdate = true
		this.mesh.geometry.uvsNeedUpdate = true;

		const newContourGeometry = new THREE.Geometry()
		newContourGeometry.vertices.push(this.mesh.geometry.vertices[0])
		newContourGeometry.vertices.push(this.mesh.geometry.vertices[1])
		newContourGeometry.vertices.push(this.mesh.geometry.vertices[3])
		newContourGeometry.vertices.push(this.mesh.geometry.vertices[2])
		newContourGeometry.vertices.push(this.mesh.geometry.vertices[0])
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
