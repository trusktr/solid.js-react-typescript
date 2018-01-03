/**
 *  Copyright 2017 Mapper Inc. Part of the mapper-annotator project.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as THREE from 'three'
import {Annotation} from 'annotator-entry-ui/annotations/AnnotationBase'

// Some variables used for rendering
const markerPointGeometry = new THREE.BoxGeometry(0.1, 0.1, 0.1)
const markerMaterial = new THREE.MeshLambertMaterial({color: 0xffffff, side: THREE.DoubleSide})
const contourMaterial = new THREE.LineBasicMaterial({ color: 0x0000ff })

export class TrafficSign extends Annotation {
	trafficSignContour: THREE.Line
	isComplete: boolean

	constructor() {
		super()
		this.isComplete = false
		this.trafficSignContour = new THREE.Line(new THREE.Geometry(), contourMaterial)
		this.renderingObject.add(this.trafficSignContour)
	}

	addMarker(position: THREE.Vector3, isLastMarker: boolean): void {
	const marker = new THREE.Mesh(markerPointGeometry, markerMaterial)
	marker.position.set(position.x, position.y, position.z)
	this.markers.push(marker)
	this.renderingObject.add(marker)

	if (isLastMarker) {
		this.isComplete = true
	}
	this.updateVisualization()
}

	deleteLastMarker(): void {}

	makeActive(): void {}

	makeInactive(): void {}

	setLiveMode(): void {}

	unsetLiveMode(): void {}

	highlightMarkers(markers: Array<THREE.Mesh>): void {}

	unhighlightMarkers(): void {}

	updateVisualization(): void {
		// Check if there are at least two markers
		if (this.markers.length < 2) {
			return
		}

		const newGeometry = new THREE.Geometry();
		this.markers.forEach((marker) => {
			newGeometry.vertices.push(marker.position)
		})

		// Push the first vertex again to close the loop
		if (this.isComplete) {
			newGeometry.vertices.push(this.markers[0].position)
		}

		newGeometry.computeLineDistances()
		this.trafficSignContour.geometry = newGeometry
		this.trafficSignContour.geometry.verticesNeedUpdate = true
	}
}
