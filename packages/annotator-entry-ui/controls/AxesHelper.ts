/**
 *  Copyright 2017 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as THREE from 'three'

// Create an object which highlights the X-Y-Z axes.
// This is just like THREE.AxesHelper, except that the axes converge
// at [0, 0, 0]. In THREE.AxesHelper the axes converge at
// [-length/2, -length/2, -length/2] which is too confusing.
export function AxesHelper(length: number): THREE.Object3D {
	const origin = new THREE.Vector3(0, 0, 0)
	let x = new THREE.ArrowHelper(
		new THREE.Vector3(1, 0, 0),
		origin,
		length,
		0xff0000
	)
	let y = new THREE.ArrowHelper(
		new THREE.Vector3(0, 1, 0),
		origin,
		length,
		0x00ff00
	)
	let z = new THREE.ArrowHelper(
		new THREE.Vector3(0, 0, 1),
		origin,
		length,
		0x0000ff
	)
	const group = new THREE.Group()
	group.add(x)
	group.add(y)
	group.add(z)
	return group
}