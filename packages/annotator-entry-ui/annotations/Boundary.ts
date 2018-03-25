/**
 *  Copyright 2018 Mapper Inc. Part of the mapper-annotator project.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as THREE from 'three'
import * as TypeLogger from 'typelogger'
import {Annotation, AnnotationRenderingProperties} from './AnnotationBase'
import {AnnotationJsonInputInterface, AnnotationJsonOutputInterface} from "./AnnotationBase"
import {AnnotationType} from "./AnnotationType"
import {isNullOrUndefined} from "util"

// tslint:disable-next-line:no-any
TypeLogger.setLoggerOutput(console as any)
const log = TypeLogger.getLogger(__filename)

export enum BoundaryType {
	UNKNOWN = 0,
	CURB,
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

const MapBoundaryColorToHex: { [key: string]: number } =  {}
MapBoundaryColorToHex[BoundaryColor.YELLOW.toString()] = 0xffdb00
MapBoundaryColorToHex[BoundaryColor.WHITE.toString()] = 0xffffff
MapBoundaryColorToHex[BoundaryColor.RED.toString()] = 0xff0000
MapBoundaryColorToHex[BoundaryColor.BLUE.toString()] = 0x0000ff
MapBoundaryColorToHex[BoundaryColor.GREEN.toString()] = 0x00ff00
MapBoundaryColorToHex[BoundaryColor.UNKNOWN.toString()] = 0x00ffff
MapBoundaryColorToHex[BoundaryColor.NONE.toString()] = 0x00ffff
MapBoundaryColorToHex[BoundaryColor.OTHER.toString()] = 0x00ffff

// Some variables used for rendering
namespace BoundaryRenderingProperties {
	export const markerMaterial = new THREE.MeshLambertMaterial({color: 0xffffff, side: THREE.DoubleSide})
	export const activeMaterial = new THREE.LineBasicMaterial({color: 0xf0d06e})
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
	annotationType: AnnotationType
	type: BoundaryType
	minimumMarkerCount: number
	markersFormRing: boolean
	allowNewMarkers: boolean
	snapToGround: boolean
	color: BoundaryColor
	boundaryContour: THREE.Line
	mesh: THREE.Mesh

	constructor(obj?: BoundaryJsonInputInterface) {
		super(obj)
		this.annotationType = AnnotationType.BOUNDARY
		if (obj) {
			this.type = isNullOrUndefined(BoundaryType[obj.boundaryType]) ? BoundaryType.UNKNOWN : BoundaryType[obj.boundaryType]
			this.color = isNullOrUndefined(BoundaryColor[obj.boundaryColor]) ? BoundaryColor.UNKNOWN : BoundaryColor[obj.boundaryColor]
		} else {
			this.type = BoundaryType.UNKNOWN
			this.color = BoundaryColor.UNKNOWN
		}

		this.minimumMarkerCount = 2
		this.markersFormRing = false
		this.allowNewMarkers = true
		this.snapToGround = true
		this.boundaryContour = new THREE.Line(new THREE.Geometry(), BoundaryRenderingProperties.activeMaterial)
		this.mesh = new THREE.Mesh()
		this.renderingObject.add(this.boundaryContour)

		if (obj) {
			if (obj.markers.length >= this.minimumMarkerCount) {
				obj.markers.forEach(marker => this.addMarker(marker, false))
				if (!this.isValid())
					throw Error(`can't load invalid boundary with id ${obj.uuid}`)
				this.updateVisualization()
				this.makeInactive()
			}
		}
	}

	isValid(): boolean {
		return this.markers.length >= this.minimumMarkerCount
	}

	addMarker(position: THREE.Vector3, updateVisualization: boolean): boolean {
		const marker = new THREE.Mesh(AnnotationRenderingProperties.markerPointGeometry, BoundaryRenderingProperties.markerMaterial)
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
		this.updateVisualization()

		return true
	}

	complete(): boolean {
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

		const liveColor = MapBoundaryColorToHex[this.color.toString()]

		switch (this.type) {
			case BoundaryType.DASHED:
			case BoundaryType.SOLID_DASHED:
			case BoundaryType.DASHED_SOLID:
				this.boundaryContour.material = new THREE.LineDashedMaterial({color: liveColor, dashSize: 1, gapSize: 1})
				break
			default:
				this.boundaryContour.material = new THREE.LineBasicMaterial({color: liveColor})
		}
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

		const newContourGeometry = new THREE.Geometry()

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
			annotationType: AnnotationType[AnnotationType.BOUNDARY],
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
