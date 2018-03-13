/**
 *  Copyright 2018 Mapper Inc. Part of the mapper-annotator project.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as THREE from 'three'
import * as TypeLogger from 'typelogger'
import {Annotation, AnnotationRenderingProperties} from './AnnotationBase'
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
	DOUBLE_DASHED,
	SOLID_DASHED,
	DASHED_SOLID,
	OTHER
}

export enum BoundaryColor {
	UNKNOWN = 0,
	NONE,
	WHITE,
	YELLOW,
	RED,
	BLUE,
	GREEN,
	OTHER
}

// Some variables used for rendering
namespace BoundaryRenderingProperties {
	export const markerMaterial = new THREE.MeshLambertMaterial({color: 0xffffff, side: THREE.DoubleSide})
	export const activeMaterial = new THREE.LineBasicMaterial({color: 0x0000ff})
	export const inactiveMaterial = new THREE.LineBasicMaterial({color: 0x00ffff})

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
	mesh: THREE.Mesh

	constructor(obj?: BoundaryJsonInputInterface) {
		super(obj)
		if (obj) {
			this.type = isNullOrUndefined(BoundaryType[obj.boundaryType]) ? BoundaryType.UNKNOWN : BoundaryType[obj.boundaryType]
			this.color = isNullOrUndefined(BoundaryType[obj.boundaryColor]) ? BoundaryColor.NONE : BoundaryType[obj.boundaryColor]
		} else {
			this.type = BoundaryType.UNKNOWN
			this.color = BoundaryColor.UNKNOWN
		}
		this.boundaryContour = new THREE.Line(new THREE.Geometry(), BoundaryRenderingProperties.activeMaterial)
		this.mesh = new THREE.Mesh()
		this.renderingObject.add(this.boundaryContour)

		if (obj && obj.markers.length > 0) {
			obj.markers.forEach( (marker) => {
				this.addMarker(marker)
			})
			this.updateVisualization()
			this.makeInactive()
		}
	}

	isValid(): boolean {
		return this.markers.length > 2
	}

	addMarker(position: THREE.Vector3): boolean {
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
		this.boundaryContour.material = BoundaryRenderingProperties.activeMaterial
	}

	makeInactive(): void {
		this.boundaryContour.material = BoundaryRenderingProperties.inactiveMaterial
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
		// Check if there are at least two markers to draw a line
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
