/**
 *  Copyright 2017 Mapper Inc. Part of the mapper-annotator project.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as THREE from 'three'

export interface QuaternionJsonInterface {
	x: number
	y: number
	z: number
	w: number
}

// THREE.Box3.getSize() fails on boxes with negative values.
export function getSize(box: THREE.Box3): THREE.Vector3 {
	return new THREE.Vector3(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z)
}

// THREE.Box3.getCenter() fails on boxes with negative values.
export function getCenter(box: THREE.Box3): THREE.Vector3 {
	const halfSize = getSize(box).divideScalar(2)
	return new THREE.Vector3(box.min.x + halfSize.x, box.min.y + halfSize.y, box.min.z + halfSize.z)
}

/**
 * Get closest pair of points between two arrays of 3D points
 * @returns pair of indexes corresponding to closest pair
 */
export function getClosestPoints(arr1: Array<THREE.Vector3>, arr2: Array<THREE.Vector3>, threshold: number): {index1: number, index2: number} {
	let index1: number = -1
	let index2: number = -1
	let minDist: number = arr1[0].distanceTo(arr2[0]) + 1

	for (let i1: number = 0; i1 < arr1.length; i1++) {
		const pt1 = arr1[i1]
		for (let i2: number = 0; i2 < arr2.length; i2++) {
			const dist = pt1.distanceTo(arr2[i2])
			if (dist < minDist) {
				minDist = dist
				index1 = i1
				index2 = i2
			}
		}
	}
	if (minDist > threshold) {
		return {index1: -1, index2: -1}
	}
	return {index1: index1, index2: index2}
}
