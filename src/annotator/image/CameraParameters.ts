/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as THREE from 'three'
import {UtmCoordinateSystem} from '@mapperai/mapper-annotated-scene/src/UtmCoordinateSystem'
import {lineGeometry} from '@mapperai/mapper-annotated-scene/src/geometry/ThreeHelpers'

// Mapping between a real-world camera and an image displayed as a 3D object

// TODO CLYDE Cameras should validate the coordinate system for their 3D location.
// TODO CLYDE   See for example TileManager.checkCoordinateSystem().
// TODO CLYDE   Aurora gets away without this because all their data uses a local coordinate system.
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

const clickRayMaterial = new THREE.LineBasicMaterial({color: new THREE.Color(0xff6666)})

// Draw a ray from the camera origin through some point within the image
function ray(origin: THREE.Vector3, destination: THREE.Vector3): THREE.Line {
	const vertices = [
		origin,
		destination,
	]

	return lineGeometry(vertices, clickRayMaterial)
}

// Parameters for locating and orienting images provided by Aurora
export class AuroraCameraParameters implements CameraParameters {
	screenPosition: THREE.Vector3
	cameraOrigin: THREE.Vector3
	private utmCoordinateSystem: UtmCoordinateSystem
	private imageWidth: number
	private imageHeight: number
	private translation: number[]
	private rotation: number[]

	constructor(
		utmCoordinateSystem: UtmCoordinateSystem,
		screenDistanceFromOrigin: number,
		imageWidth: number,
		imageHeight: number,
		translation: number[],
		rotation: number[]
	) {
		this.utmCoordinateSystem = utmCoordinateSystem
		this.imageWidth = imageWidth
		this.imageHeight = imageHeight
		this.translation = translation
		this.rotation = rotation

		if (screenDistanceFromOrigin <= 0.0) throw Error('invalid screenDistanceFromOrigin: ' + screenDistanceFromOrigin)

		// https://en.wikipedia.org/wiki/Camera_resectioning
		// https://docs.opencv.org/2.4/modules/calib3d/doc/camera_calibration_and_3d_reconstruction.html
		const cameraOrigin = new THREE.Vector4(translation[0], translation[1], translation[2], 1)
		const screenPosition = new THREE.Vector4(0, 0, screenDistanceFromOrigin, 1)
		const screenRotation = new THREE.Matrix4()

		screenRotation.set(
			rotation[0], rotation[1], rotation[2], translation[0],
			rotation[3], rotation[4], rotation[5], translation[1],
			rotation[6], rotation[7], rotation[8], translation[2],
			0, 0, 0, 1)

		screenPosition.applyMatrix4(screenRotation)

		// Note: Use camera origin as height to avoid floating images
		this.screenPosition = utmCoordinateSystem.utmToThreeJs(screenPosition.x, screenPosition.y, cameraOrigin.z)
		this.cameraOrigin = utmCoordinateSystem.utmToThreeJs(cameraOrigin.x, cameraOrigin.y, cameraOrigin.z)
	}

	// Draw a ray from the camera origin, through a point in the image which corresponds to a point in three.js space.
	imageCoordinatesToRay(xRatio: number, yRatio: number, length: number): THREE.Line {
		const imageX = this.imageWidth * xRatio
		const imageY = this.imageHeight * yRatio
		const cx = this.imageWidth * 0.5
		const cy = this.imageHeight * 0.5
		// TODO CLYDE read these from camera intrinsics file
		const fx = this.imageWidth * 0.508447051
		const fy = this.imageWidth * 0.513403773
		const endPosition = new THREE.Vector4(length * (imageX - cx) / fx, length * (imageY - cy) / fy, length, 1)
		const endRotation = new THREE.Matrix4()

		endRotation.set(
			this.rotation[0], this.rotation[1], this.rotation[2], this.translation[0],
			this.rotation[3], this.rotation[4], this.rotation[5], this.translation[1],
			this.rotation[6], this.rotation[7], this.rotation[8], this.translation[2],
			0, 0, 0, 1)

		endPosition.applyMatrix4(endRotation)

		const destination = this.utmCoordinateSystem.utmToThreeJs(endPosition.x, endPosition.y, endPosition.z)

		return ray(this.cameraOrigin, destination)
	}
}
