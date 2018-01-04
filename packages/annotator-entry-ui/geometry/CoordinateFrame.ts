/**
 *  Copyright 2017 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as THREE from 'three'

export enum CoordinateFrameType {
	CAMERA = 0, // [northing, -altitude, easting]
	INERTIAL,   // [northing, easting, -altitude]
	LIDAR,      // [northing, easting, altitude]
}

/**
 * Convert a 3D point to our standard format: [easting, northing, altitude]
 * @returns Point in standard coordinate frame format.
 */
export function convertToStandardCoordinateFrame(point: THREE.Vector3, pointCoordinateFrame: CoordinateFrameType): THREE.Vector3 {
	switch (pointCoordinateFrame) {
		case CoordinateFrameType.CAMERA:
			// Raw input is [x: northing, y: -altitude, z: easting]
			return new THREE.Vector3(point.z, point.x, -point.y)
		case CoordinateFrameType.INERTIAL:
			// Raw input is [x: northing, y: easting, z: -altitude]
			return new THREE.Vector3(point.y, point.x, -point.z)
		case CoordinateFrameType.LIDAR:
			// Raw input is [x: northing, y: easting, z: altitude]
			return new THREE.Vector3(point.y, point.x, point.z)
		default:
			throw Error(`unknown coordinate frame '${pointCoordinateFrame}'`)
	}
}
