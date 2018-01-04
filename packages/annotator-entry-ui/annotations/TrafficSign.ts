/**
 *  Copyright 2017 Mapper Inc. Part of the mapper-annotator project.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as THREE from 'three'
import {Annotation, AnnotationRenderingProperties} from 'annotator-entry-ui/annotations/AnnotationBase'

// Some variables used for rendering
namespace TrafficSignRenderingProperties {
	export const markerPointGeometry = new THREE.BoxGeometry(0.1, 0.1, 0.1)
	export const markerMaterial = new THREE.MeshLambertMaterial({color: 0xffffff, side: THREE.DoubleSide})
	export const meshMaterial = new THREE.MeshLambertMaterial({color: 0x00ff00, side: THREE.DoubleSide})
	export const contourMaterial = new THREE.LineBasicMaterial({color: 0x0000ff})
}

export class TrafficSign extends Annotation {
	trafficSignContour: THREE.Line
	trafficSignMesh: THREE.Mesh
	isComplete: boolean

	constructor() {
		super()
		this.isComplete = false
		this.trafficSignContour = new THREE.Line(new THREE.Geometry(), TrafficSignRenderingProperties.contourMaterial)
		this.trafficSignMesh = new THREE.Mesh(new THREE.Geometry(), TrafficSignRenderingProperties.meshMaterial)
		this.renderingObject.add(this.trafficSignMesh)
		this.renderingObject.add(this.trafficSignContour)
		this.trafficSignMesh.visible = false
	}

	addMarker(position: THREE.Vector3, isLastMarker: boolean): void {
		const marker = new THREE.Mesh(AnnotationRenderingProperties.markerPointGeometry, TrafficSignRenderingProperties.markerMaterial)
		marker.position.set(position.x, position.y, position.z)
		this.markers.push(marker)
		this.renderingObject.add(marker)

		if (isLastMarker) {
			this.isComplete = true
		}
		this.updateVisualization()
	}

	deleteLastMarker(): void {
		if (this.markers.length === 0) {
			return
		}
		this.renderingObject.remove(this.markers.pop()!)
		this.updateVisualization()
	}

	makeActive(): void {
		this.trafficSignMesh.visible = false
	}

	makeInactive(): void {
		this.trafficSignMesh.visible = true
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
		this.trafficSignMesh.geometry = newMeshGeometry
		this.trafficSignMesh.geometry.verticesNeedUpdate = true
	}
}
