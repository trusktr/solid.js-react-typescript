/**
 *  Copyright 2017 Mapper Inc. Part of the mapper-annotator project.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as THREE from 'three'
import * as UUID from 'uuid'

export type TrafficUuid = string // a UUID, for use across distributed applications
export type TrafficId = number   // a small integer, for use in the UI during one session

const markerPointGeometry = new THREE.BoxGeometry(0.1, 0.1, 0.1)
const markerMaterial = new THREE.MeshLambertMaterial({color: this.color, side: THREE.DoubleSide})

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
	annotationNormal: THREE.Vector3
	trafficSignRenderingObject: THREE.Object3D
	isComplete: boolean

	constructor() {
		this.id = TrafficSignCounter.nextId()
		this.uuid = UUID.v1()
		this.isComplete = false
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

	}
}
