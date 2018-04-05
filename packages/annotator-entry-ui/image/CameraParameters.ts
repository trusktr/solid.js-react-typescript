/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as THREE from 'three'
import {UtmInterface} from "../UtmInterface";

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
	private distanceScaleFactor: number

	constructor(
		utmInterface: UtmInterface,
		tileId: string,
		translation: number[],
		rotation: number[]
	) {
		// TODO: make this configurable
		this.distanceScaleFactor = 15
		this.tileId = tileId

		const sPosition = new THREE.Vector4(0, 0, this.distanceScaleFactor, 1)
		const sOrigin = new THREE.Vector4(translation[0], translation[1], translation[2], 1)
		const sRotation = new THREE.Matrix4()
		sRotation.set(
			rotation[0], rotation[1], rotation[2], translation[0],
			rotation[3], rotation[4], rotation[5], translation[1],
			rotation[6], rotation[7], rotation[8], translation[2],
			0, 0, 0, 1)
		sPosition.applyMatrix4(sRotation)

		// Note: Use camera origin as height to avoid floating images
		this.screenPosition = utmInterface.utmToThreeJs(sPosition.x, sPosition.y, sOrigin.z)
		this.cameraOrigin = utmInterface.utmToThreeJs(sOrigin.x, sOrigin.y, sOrigin.z)
	}
}
