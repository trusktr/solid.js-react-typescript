/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as THREE from 'three'
import {UtmInterface} from "../UtmInterface";
import {lineGeometry} from "../geometry/ThreeHelpers"

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

const clickRayMaterial = new THREE.LineBasicMaterial({color: 0xff6666})

// Draw a ray from the top of the pyramid through some point on the base.
// lengthFactor is a multiple of the distance between the tip and the image plane.
function ray(origin: THREE.Vector3, direction: THREE.Vector3, lengthFactor: number): THREE.Line {
	const vertices = [
		origin,
		new THREE.Ray(origin, direction).at(lengthFactor)
	]
	return lineGeometry(vertices, clickRayMaterial)
}

// Parameters for locating and orienting images provided by Aurora
export class AuroraCameraParameters implements CameraParameters {
	screenPosition: THREE.Vector3
	cameraOrigin: THREE.Vector3
	private utmInterface: UtmInterface
	private tileId: string
	private translation: number[]
	private rotation: number[]
	private distanceScaleFactor: number

	constructor(
		utmInterface: UtmInterface,
		tileId: string,
		translation: number[],
		rotation: number[]
	) {
		this.utmInterface = utmInterface
		this.tileId = tileId
		this.translation = translation
		this.rotation = rotation
		// TODO: make this configurable
		this.distanceScaleFactor = 15

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

	// Draw a ray from the camera origin, through a point in the image which corresponds to a point in three.js space.
	imageCoordinatesToRay(xRatio: number, yRatio: number, lengthFactor: number): THREE.Line {
		// todo get this from camera intrinsics?
		const arbitraryImageScale = 1.0
		const imageWidth = 1920 * arbitraryImageScale
		const imageHeight = 1208 * arbitraryImageScale
		const imageScreenX = imageWidth * xRatio - imageWidth / 2
		const imageScreenY = imageHeight * yRatio - imageHeight / 2

		const sPosition = new THREE.Vector4(imageScreenX, imageScreenY, this.distanceScaleFactor, 1)
		const sRotation = new THREE.Matrix4()
		sRotation.set(
			this.rotation[0], this.rotation[1], this.rotation[2], this.translation[0],
			this.rotation[3], this.rotation[4], this.rotation[5], this.translation[1],
			this.rotation[6], this.rotation[7], this.rotation[8], this.translation[2],
			0, 0, 0, 1)
		sPosition.applyMatrix4(sRotation)

		const direction = this.utmInterface.utmToThreeJs(sPosition.x, sPosition.y, sPosition.z)
		return ray(this.cameraOrigin, direction, lengthFactor)
	}
}
