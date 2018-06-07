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
import {QuaternionJsonInterface} from "../geometry/ThreeHelpers"

// tslint:disable-next-line:no-any
TypeLogger.setLoggerOutput(console as any)
const log = TypeLogger.getLogger(__filename)

import * as rygFrontUrl from '../../annotator-assets/images/TrafficDevice/ryg_front.png'
import * as rygBackUrl from '../../annotator-assets/images/TrafficDevice/ryg_back.png'
import * as stopFrontUrl from '../../annotator-assets/images/TrafficDevice/stop_front.png'
import * as stopBackUrl from '../../annotator-assets/images/TrafficDevice/stop_back.png'
import * as yieldFrontUrl from '../../annotator-assets/images/TrafficDevice/yield_front.png'
import * as yieldBackUrl from '../../annotator-assets/images/TrafficDevice/yield_back.png'

export enum TrafficDeviceType {
	UNKNOWN = 0,
	STOP,
	YIELD,
	RYG_LIGHT,
	RYG_LEFT_ARROW_LIGHT,
	OTHER
}

interface MaterialFaces {
	front: THREE.Material,
	back: THREE.Material,
}

// Some variables used for rendering
namespace TrafficDeviceRenderingProperties {
	export const markerMaterial = new THREE.MeshLambertMaterial({color: 0xffffff, side: THREE.DoubleSide})
	export const defaultMaterial = new THREE.MeshLambertMaterial({color: 0x008800, side: THREE.DoubleSide})
	export const defaultContourMaterial = new THREE.LineBasicMaterial({color: 0x00ff00, visible: false})
	export const activeContourMaterial = new THREE.LineBasicMaterial({color: 0xffff00, linewidth: 2})
	export const normalMaterial = new THREE.LineBasicMaterial( {color: 0xff00ff})

	// Set a default front and back face for each device type.
	export const deviceFaceMaterials: MaterialFaces[] = []
	for (let i in TrafficDeviceType) {
		if (parseInt(i, 10) >= 0) {
			deviceFaceMaterials[i] = {
				front: defaultMaterial,
				back: defaultMaterial,
			}
		}
	}

	// Load custom faces if we have them.
	const tl = new THREE.TextureLoader()
	deviceFaceMaterials[TrafficDeviceType.RYG_LEFT_ARROW_LIGHT] = {
		front: new THREE.MeshBasicMaterial({map: tl.load(rygFrontUrl), side: THREE.FrontSide}),
		back: new THREE.MeshBasicMaterial({map: tl.load(rygBackUrl), side: THREE.BackSide}),
	}
	deviceFaceMaterials[TrafficDeviceType.RYG_LIGHT] = {
		front: new THREE.MeshBasicMaterial({map: tl.load(rygFrontUrl), side: THREE.FrontSide}),
		back: new THREE.MeshBasicMaterial({map: tl.load(rygBackUrl), side: THREE.BackSide}),
	}
	deviceFaceMaterials[TrafficDeviceType.STOP] = {
		front: new THREE.MeshBasicMaterial({map: tl.load(stopFrontUrl), side: THREE.FrontSide}),
		back: new THREE.MeshBasicMaterial({map: tl.load(stopBackUrl), side: THREE.BackSide}),
	}
	deviceFaceMaterials[TrafficDeviceType.YIELD] = {
		front: new THREE.MeshBasicMaterial({map: tl.load(yieldFrontUrl), side: THREE.FrontSide}),
		back: new THREE.MeshBasicMaterial({map: tl.load(yieldBackUrl), side: THREE.BackSide}),
	}

	deviceFaceMaterials.forEach(pair => {
		pair.front.transparent = true
		pair.back.transparent = true
	})
}

export interface TrafficDeviceJsonInputInterface extends AnnotationJsonInputInterface {
	trafficDeviceType: string
	deviceOrientation: QuaternionJsonInterface
}

export interface TrafficDeviceJsonOutputInterface extends AnnotationJsonOutputInterface {
	trafficDeviceType: string
	deviceOrientation: QuaternionJsonInterface
}

export class TrafficDevice extends Annotation {
	annotationType: AnnotationType
	geometryType: AnnotationGeometryType
	type: TrafficDeviceType
	minimumMarkerCount: number
	allowNewMarkers: boolean
	snapToGround: boolean
	isRotatable: boolean
	deviceOrientation: THREE.Quaternion
	planeNormal: THREE.Vector3
	planeCenter: THREE.Vector3
	trafficDeviceContour: THREE.Line
	linkLine: THREE.Line
	normalLine: THREE.Line
	mesh: THREE.Mesh
	meshBackFace: THREE.Mesh
	isComplete: boolean

	constructor(obj?: TrafficDeviceJsonInputInterface) {
		super(obj)
		this.annotationType = AnnotationType.TRAFFIC_DEVICE
		this.geometryType = AnnotationGeometryType.RING
		if (obj) {
			this.type = isNullOrUndefined(TrafficDeviceType[obj.trafficDeviceType]) ? TrafficDeviceType.UNKNOWN : TrafficDeviceType[obj.trafficDeviceType]
			if (isNullOrUndefined(obj.deviceOrientation))
				this.deviceOrientation = new THREE.Quaternion()
			else
				this.deviceOrientation = new THREE.Quaternion(obj.deviceOrientation.x, obj.deviceOrientation.y, obj.deviceOrientation.z, obj.deviceOrientation.w)
		} else {
			this.type = TrafficDeviceType.UNKNOWN
			this.deviceOrientation = new THREE.Quaternion()
		}

		this.minimumMarkerCount = 1
		this.allowNewMarkers = true
		this.snapToGround = false
		this.isRotatable = true
		this.trafficDeviceContour = new THREE.Line(new THREE.Geometry(), TrafficDeviceRenderingProperties.defaultContourMaterial)
		this.linkLine = new THREE.Line(new THREE.Geometry(), TrafficDeviceRenderingProperties.activeContourMaterial)
		this.normalLine = new THREE.Line( new THREE.Geometry(), TrafficDeviceRenderingProperties.normalMaterial)
		this.mesh = new THREE.Mesh(new THREE.Geometry(), TrafficDeviceRenderingProperties.defaultMaterial)
		this.meshBackFace = new THREE.Mesh(new THREE.Geometry(), TrafficDeviceRenderingProperties.defaultMaterial)
		this.renderingObject.add(this.mesh)
		this.renderingObject.add(this.meshBackFace)
		this.renderingObject.add(this.trafficDeviceContour)
		this.renderingObject.add(this.linkLine)
		this.renderingObject.add(this.normalLine)

		if (obj) {
			if (obj.markers.length >= this.minimumMarkerCount) {
				obj.markers.forEach(marker => this.addMarker(marker, false))
				this.markers[0].setRotationFromQuaternion(this.deviceOrientation)
				this.markers[0].updateMatrix()
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
		marker.position.set(position.x, position.y, position.z)
		this.markers.push(marker)
		this.renderingObject.add(marker)
		this.planeCenter = position
		this.planeNormal = new THREE.Vector3(0, 0, 0)

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
		this.normalLine.visible = true
		this.showMarkers()
	}

	makeInactive(): void {
		this.trafficDeviceContour.material = TrafficDeviceRenderingProperties.defaultContourMaterial
		this.linkLine.visible = false
		this.normalLine.visible = false
		this.unhighlightMarkers()
		this.hideMarkers()
	}

	setAssociatedMode(position: THREE.Vector3): void {
		this.trafficDeviceContour.material = TrafficDeviceRenderingProperties.activeContourMaterial
		const newLinkGeometry = new THREE.Geometry()
		newLinkGeometry.vertices.push(position)
		newLinkGeometry.vertices.push(this.markers[0].position)
		newLinkGeometry.computeLineDistances()
		this.linkLine.geometry = newLinkGeometry
		this.linkLine.geometry.verticesNeedUpdate = true
		this.linkLine.visible = true
		if (this.markers.length > 0)
			this.markers[0].visible = false
	}

	updateVisualization(): void {
		if (this.markers.length < 1) {
			return
		}
		this.planeCenter = this.markers[0].position
		const rotationMatrix = new THREE.Matrix4().makeRotationFromEuler(this.markers[0].getWorldRotation())
		this.deviceOrientation.setFromRotationMatrix(rotationMatrix)

		const newMeshGeometry = new THREE.PlaneGeometry(0.8, 0.8)
		newMeshGeometry.applyMatrix(rotationMatrix)
		newMeshGeometry.translate(this.planeCenter.x, this.planeCenter.y, this.planeCenter.z)
		newMeshGeometry.computeFaceNormals()
		this.mesh.geometry = newMeshGeometry
		this.meshBackFace.geometry = newMeshGeometry.clone()

		this.mesh.material = TrafficDeviceRenderingProperties.deviceFaceMaterials[this.type].front
		this.meshBackFace.material = TrafficDeviceRenderingProperties.deviceFaceMaterials[this.type].back

		const newContourGeometry = new THREE.Geometry()
		newContourGeometry.vertices.push(this.mesh.geometry.vertices[0])
		newContourGeometry.vertices.push(this.mesh.geometry.vertices[1])
		newContourGeometry.vertices.push(this.mesh.geometry.vertices[3])
		newContourGeometry.vertices.push(this.mesh.geometry.vertices[2])
		newContourGeometry.vertices.push(this.mesh.geometry.vertices[0])
		this.trafficDeviceContour.geometry = newContourGeometry
		this.trafficDeviceContour.geometry.verticesNeedUpdate = true

		this.planeNormal =  new THREE.Vector3().set(0, 0, 1)
		this.planeNormal.applyMatrix4(rotationMatrix)
		const newNormalGeometry = new THREE.Geometry()
		const normalStartPoint = this.markers[0].position
		const normalEndPoint = normalStartPoint.clone()
		normalEndPoint.add(this.planeNormal)
		newNormalGeometry.vertices.push(normalStartPoint)
		newNormalGeometry.vertices.push(normalEndPoint)
		this.normalLine.geometry = newNormalGeometry
		this.normalLine.geometry.verticesNeedUpdate = true
	}

	// If the current rotation is all zeroes assume it has never been rotated; otherwise it has been.
	orientationIsSet(): boolean {
		if (!this.markers.length) return false
		const rotation = this.markers[0].getWorldRotation()
		return !!rotation.x || !!rotation.y || !!rotation.z
	}

	lookAt(point: THREE.Vector3): void {
		if (!this.markers.length) return
		this.markers[0].lookAt(point)
		this.updateVisualization()
	}

	toJSON(pointConverter?: (p: THREE.Vector3) => Object): TrafficDeviceJsonOutputInterface {
		// Create data structure to export (this is the min amount of data
		// needed to reconstruct this object from scratch)
		const data: TrafficDeviceJsonOutputInterface = {
			annotationType: AnnotationType[AnnotationType.TRAFFIC_DEVICE],
			uuid: this.uuid,
			trafficDeviceType: TrafficDeviceType[this.type],
			deviceOrientation: {
				x: this.deviceOrientation.x,
				y: this.deviceOrientation.y,
				z: this.deviceOrientation.z,
				w: this.deviceOrientation.w,
			} as QuaternionJsonInterface,
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
