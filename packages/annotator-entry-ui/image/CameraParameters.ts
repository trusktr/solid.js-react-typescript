/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as THREE from 'three'

// Mapping between a real-world camera and an image displayed as a 3D object

export interface CameraParameters {
	screenPosition: THREE.Vector3
	cameraOrigin: THREE.Vector3
}

// GIGO parameters for testing
export class ImaginaryCameraParameters implements CameraParameters {
	screenPosition: THREE.Vector3
	cameraOrigin: THREE.Vector3

	constructor(
		screenPosition: THREE.Vector3,
		cameraOrigin: THREE.Vector3
	) {
		this.screenPosition = screenPosition
		this.cameraOrigin = cameraOrigin
	}
}

// Parameters for locating and orienting images provided by Aurora
export class AuroraCameraParameters implements CameraParameters {
	screenPosition: THREE.Vector3
	cameraOrigin: THREE.Vector3
	private tileId: string
	private translation: number[]
	private rotation: number[]

	constructor(
		tileId: string,
		translation: number[],
		rotation: number[]
	) {
		this.tileId = tileId
		this.translation = translation
		this.rotation = rotation

		// todo
		this.screenPosition = new THREE.Vector3(0, 0, -50)
		this.cameraOrigin = new THREE.Vector3(0, 0, 0)
	}
}
