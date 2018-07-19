/**
 *  Copyright 2018 Mapper Inc. Part of the mapper-annotator project.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as THREE from 'three'
import {Annotation, AnnotationRenderingProperties} from './AnnotationBase'
import {AnnotationGeometryType, AnnotationJsonInputInterface, AnnotationJsonOutputInterface} from "./AnnotationBase"
import {AnnotationType} from "./AnnotationType"
import {isNullOrUndefined} from "util"
import Logger from "@/util/log"

const log = Logger(__filename)

const defaultLabel = 'NEW_TERRITORY'

// Some variables used for rendering
const renderingProperties = {
	markerMaterial: new THREE.MeshBasicMaterial({color: new THREE.Color( 0xffffff ), side: THREE.DoubleSide}),
	meshMaterialParameters: {side: THREE.DoubleSide, transparent: true, opacity: 0.5} as THREE.MeshBasicMaterialParameters,
	contourMaterial: new THREE.LineBasicMaterial({color: new THREE.Color( 0x0000ff )}),
}
// Map a rectangular, repeating texture onto triangular faces of a mesh geometry.
// This configuration will include the lower right half of the rectangle.
const meshGeometryUvs = [
	new THREE.Vector2(0, 0),
	new THREE.Vector2(1, 1),
	new THREE.Vector2(1, 0),
]
const markerSettings = {
	// Territories are assumed to be much larger than other annotations.
	// Scale up the markers so they can be seen and manipulated from a distance.
	activeScale: 10,
	inactiveScale: 1,
}

// Render a text string as a 2D texture which can be wrapped onto a mesh.
function generateTextureWithLabel(label: string): THREE.CanvasTexture | null {
	const color = 'yellow'
	const backGroundColor = 'blue'
	const textHeight = 10
	const textPadding = 5
	const textMargin = 50
	// Display the text string a few times on each face of the mesh geometry.
	const repeat = new THREE.Vector2(3, 3)

	const canvas = document.createElement('canvas')
	const context = canvas.getContext('2d')
	if (context) {
		context.font = textHeight + 'px sans-serif'
		const textWidth = context.measureText(label).width
		// THREE.WebGLRenderer will round off the canvas dimensions without asking. Do it now to prevent a warning.
		canvas.width = THREE.Math.nextPowerOfTwo(textWidth + textPadding * 2 + textMargin * 2)
		canvas.height = THREE.Math.nextPowerOfTwo(textHeight + textPadding * 2 + textMargin * 2)

		context.fillStyle = backGroundColor
		context.fillRect(textMargin, textMargin, canvas.width - 2 * textMargin, canvas.height - 2 * textMargin)

		context.textAlign = 'center'
		context.textBaseline = 'middle'
		context.fillStyle = color
		context.fillText(label, canvas.width / 2, canvas.height / 2)

		const texture = new THREE.CanvasTexture(
			canvas,
			THREE.UVMapping,
			THREE.RepeatWrapping,
			THREE.RepeatWrapping,
		)
		texture.repeat = repeat

		return texture
	} else {
		log.warn("can't get 2D context from a document canvas")
		return null
	}
}

export interface TerritoryJsonInputInterface extends AnnotationJsonInputInterface {
	label: string
}

export interface TerritoryJsonOutputInterface extends AnnotationJsonOutputInterface {
	label: string
}

export class Territory extends Annotation {
	annotationType: AnnotationType
	geometryType: AnnotationGeometryType
	private label: string
	minimumMarkerCount: number
	allowNewMarkers: boolean
	snapToGround: boolean
	isRotatable: boolean
	territoryContour: THREE.Line
	mesh: THREE.Mesh
	isComplete: boolean

	constructor(obj?: TerritoryJsonInputInterface) {
		super(obj)
		this.annotationType = AnnotationType.TERRITORY
		this.geometryType = AnnotationGeometryType.RING
		if (!(obj && this.setLabel(obj.label)))
			this.setLabel(defaultLabel)

		this.minimumMarkerCount = 3
		this.allowNewMarkers = true
		this.snapToGround = true
		this.isRotatable = false
		this.isComplete = false
		this.territoryContour = new THREE.Line(new THREE.Geometry(), renderingProperties.contourMaterial)

		this.mesh = new THREE.Mesh(new THREE.Geometry(), new THREE.MeshBasicMaterial(renderingProperties.meshMaterialParameters))
		this.mesh.visible = true // mesh is always visible since it is translucent
		this.updateMeshMaterial()
		this.renderingObject.add(this.mesh)
		this.renderingObject.add(this.territoryContour)

		if (obj) {
			if (obj.markers.length >= this.minimumMarkerCount) {
				obj.markers.forEach(marker => this.addMarker(marker, false))
				this.isComplete = true
				if (!this.isValid())
					throw Error(`can't load invalid territory with id ${obj.uuid}`)
				this.updateVisualization()
				this.makeInactive()
			}
		}
	}

	isValid(): boolean {
		return this.markers.length >= this.minimumMarkerCount
	}

	private updateMeshMaterial(): void {
		if (!this.mesh) return

		const texture = generateTextureWithLabel(this.label)
		if (texture)
			(this.mesh.material as THREE.MeshBasicMaterial).map = texture
	}

	getLabel(): string {
		return this.label
	}

	setLabel(label: string): boolean {
		if (isNullOrUndefined(label) || label === '') {
			return false
		} else {
			this.label = label
			this.updateMeshMaterial()
			return true
		}
	}

	addMarker(position: THREE.Vector3, updateVisualization: boolean): boolean {
		// Don't allow addition of markers if the isComplete flag is active
		if (this.isComplete) {
			log.warn("Last marker was already added. Can't add more markers. Delete a marker to allow more marker additions.")
			return false
		}

		const marker = new THREE.Mesh(AnnotationRenderingProperties.markerPointGeometry, renderingProperties.markerMaterial)
		marker.position.set(position.x, position.y, position.z)
		marker.scale.setScalar(markerSettings.activeScale)
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
		(this.mesh.material as THREE.Material).transparent = false
		this.markers.forEach(m => m.scale.setScalar(markerSettings.activeScale))
		this.showMarkers()
	}

	makeInactive(): void {
		(this.mesh.material as THREE.Material).transparent = true
		this.unhighlightMarkers()
		this.markers.forEach(m => m.scale.setScalar(markerSettings.inactiveScale))
		this.hideMarkers()
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
			this.territoryContour.geometry = newContourGeometry
			this.territoryContour.geometry.verticesNeedUpdate = true
			return
		}

		// Push the first vertex again to close the loop
		newContourGeometry.vertices.push(this.markers[0].position)
		newContourGeometry.computeLineDistances()
		this.territoryContour.geometry = newContourGeometry
		this.territoryContour.geometry.verticesNeedUpdate = true

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
				newMeshGeometry.faceVertexUvs[0].push(meshGeometryUvs)
			}
		}
		newMeshGeometry.computeFaceNormals()
		this.mesh.geometry = newMeshGeometry
		this.mesh.geometry.verticesNeedUpdate = true
		this.mesh.geometry.uvsNeedUpdate = true
	}

	toJSON(pointConverter?: (p: THREE.Vector3) => Object): TerritoryJsonOutputInterface {
		// Create data structure to export (this is the min amount of data
		// needed to reconstruct this object from scratch)
		const data: TerritoryJsonOutputInterface = {
			annotationType: AnnotationType[AnnotationType.TERRITORY],
			uuid: this.uuid,
			label: this.label,
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
