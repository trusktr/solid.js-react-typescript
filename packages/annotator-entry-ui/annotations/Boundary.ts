/**
 *  Copyright 2018 Mapper Inc. Part of the mapper-annotator project.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as THREE from 'three'
import * as TypeLogger from 'typelogger'
import {Annotation, AnnotationRenderingProperties} from 'annotator-entry-ui/annotations/AnnotationBase'
import {AnnotationJsonInputInterface, AnnotationJsonOutputInterface} from "./AnnotationBase";
import {AnnotationType} from "./AnnotationType"
import {isNullOrUndefined} from "util"

// tslint:disable-next-line:no-any
TypeLogger.setLoggerOutput(console as any)
const log = TypeLogger.getLogger(__filename)

export enum BoundaryType {
	UNKNOWN = 0,
	CURVE,
	SOLID,
	DASHED,
	DOUBLE_SOLID,
	DOUBLE_DASHED
	SOLID_DASHED,
	DASHED_SOLID
}

export enum BoundaryColor {
	NONE = 0,
	WHITE,
	YELLOW,
	RED,
	BLUE,
	GREEN
}

// Some variables used for rendering
namespace BoundaryRenderingProperties {
	export const markerMaterial = new THREE.MeshLambertMaterial({color: 0xffffff, side: THREE.DoubleSide})
	export const meshMaterial = new THREE.MeshLambertMaterial({color: 0x00ff00, side: THREE.DoubleSide})
	export const contourMaterial = new THREE.LineBasicMaterial({color: 0x0000ff})
}

export interface BoundaryJsonInputInterface extends AnnotationJsonInputInterface {
	boundaryType: string
	boundaryColor: string
}

export interface BoundaryJsonOutputInterface extends AnnotationJsonOutputInterface {
	boundaryType: string
	boundaryColor: string
}

export class Boundary extends Annotation {
	type: BoundaryType
	color: BoundaryColor
	boundaryContour: THREE.Line

	constructor(obj?: BoundaryJsonInputInterface) {
		super(obj)
		if (obj) {
			this.type = isNullOrUndefined(BoundaryType[obj.boundaryType]) ? BoundaryType.UNKNOWN : BoundaryType[obj.boundaryType]
			this.color = isNullOrUndefined(BoundaryType[obj.boundaryColor]) ? BoundaryColor.NONE : BoundaryType[obj.boundaryColor]
		} else {
			this.type = BoundaryType.UNKNOWN
			this.color = BoundaryColor.NONE
		}
		this.boundaryContour = new THREE.Line(new THREE.Geometry(), BoundaryRenderingProperties.contourMaterial)
		this.mesh = new THREE.Mesh(new THREE.Geometry(), BoundaryRenderingProperties.meshMaterial)
		this.renderingObject.add(this.boundaryContour)

		if (obj && obj.markers.length > 0) {
			obj.markers.forEach( (marker) => {
				this.addMarker(marker, false)
			})
			this.updateVisualization()
			this.makeInactive()
		}
	}

	isValid(): boolean {
		return this.markers.length > 2
	}

	addMarker(position: THREE.Vector3, isLastMarker: boolean): boolean {
		const marker = new THREE.Mesh(AnnotationRenderingProperties.markerPointGeometry, BoundaryRenderingProperties.markerMaterial)
		marker.position.set(position.x, position.y, position.z)
		this.markers.push(marker)
		this.renderingObject.add(marker)
		this.updateVisualization()

		return true
	}

	deleteLastMarker(): boolean {
		if (this.markers.length === 0) {
			log.warn('No markers to delete in this annotation')
			return false
		}

		this.renderingObject.remove(this.markers.pop()!)
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

		const newContourGeometry = new THREE.Geometry();

		this.markers.forEach((marker) => {
			newContourGeometry.vertices.push(marker.position)
		})

		newContourGeometry.computeLineDistances()
		this.boundaryContour.geometry = newContourGeometry
		this.boundaryContour.geometry.verticesNeedUpdate = true
	}

	toJSON(pointConverter?: (p: THREE.Vector3) => Object): BoundaryJsonOutputInterface {
		// Create data structure to export (this is the min amount of data
		// needed to reconstruct this object from scratch)
		const data: BoundaryJsonOutputInterface = {
			annotationType: AnnotationType[AnnotationType.TRAFFIC_SIGN],
			uuid: this.uuid,
			boundaryType: BoundaryType[this.type],
			boundaryColor: BoundaryColor[this.color],
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
