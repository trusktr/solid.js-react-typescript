/**
 *  Copyright 2017 Mapper Inc. Part of the mapper-annotator project.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as THREE from 'three'
import * as UUID from 'uuid'

export type TrafficUuid = string // a UUID, for use across distributed applications
export type TrafficId = number   // a small integer, for use in the UI during one session

const markerPointGeometry = new THREE.BoxGeometry(0.1, 0.1, 0.1)
const markerMaterial = new THREE.MeshLambertMaterial({color: 0xffffff, side: THREE.DoubleSide})
const contourMaterial = new THREE.LineBasicMaterial({ color: 0x0000ff })

namespace TrafficSignCounter {
	let i = 0

	export function nextId(): number {
		return ++i
	}
}

export class TrafficAnnotation {
	id: TrafficId
	uuid: TrafficUuid
	markers: Array<THREE.Mesh>
	trafficSignRenderingObject: THREE.Object3D
	trafficSignContour: THREE.Line
	isComplete: boolean

	constructor() {
		this.id = TrafficSignCounter.nextId()
		this.uuid = UUID.v1()
		this.isComplete = false
		this.trafficSignContour = new THREE.Line(new THREE.Geometry(), contourMaterial)
		this.markers = []
		this.trafficSignRenderingObject = new THREE.Object3D()
		this.trafficSignRenderingObject.add(this.trafficSignContour)
	}

	addMarker(position: THREE.Vector3, isLastMarker: boolean): void {
		const marker = new THREE.Mesh(markerPointGeometry, markerMaterial)
		marker.position.set(position.x, position.y, position.z)
		this.markers.push(marker)
		this.trafficSignRenderingObject.add(marker)

		if (isLastMarker) {
			this.isComplete = true
		}
		this.updateVisualization()
	}

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
