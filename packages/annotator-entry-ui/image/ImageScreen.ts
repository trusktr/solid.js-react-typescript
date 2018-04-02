/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as THREE from 'three'
import {threeDStepSize} from "../tile/Constant"

// The tip of the pyramid will work with a default PlaneGeometry which hasn't been rotated
// out of the XY plane.
const tip = new THREE.Vector3(0, 0, 1)
const lineMaterial = new THREE.LineBasicMaterial({color: 0x66aa00})

// Extend a line around the base and to a central point, forming a pyramid.
// Assume four corners in the base.
function pyramid(base: THREE.Vector3[]): THREE.Line {
	const vertices = [
		tip,
		base[0],
		base[1],
		tip,
		base[2],
		base[3],
		tip,
		base[0],
		base[2],
		base[3],
		base[1],
	]

	const positions = new Float32Array(vertices.length * threeDStepSize)
	for (let i = 0; i < vertices.length; i++) {
		const j = i * threeDStepSize
		positions[j + 0] = vertices[i].x
		positions[j + 1] = vertices[i].y
		positions[j + 2] = vertices[i].z
	}

	const geometry = new THREE.BufferGeometry()
	geometry.addAttribute('position', new THREE.BufferAttribute(positions, threeDStepSize))

	return new THREE.Line(geometry, lineMaterial)
}

// An object containing a 2D image, located in 3D space, plus a wireframe
// representing the field of view of the camera which captured the image.
// The hypothetical camera lies at the apex of a right pyramid, looking down
// at the image which forms the base.
export class ImageScreen extends THREE.Object3D {
	imageMesh: THREE.Mesh

	constructor(imageMesh: THREE.Mesh) {
		super()
		this.imageMesh = imageMesh

		const geometry = imageMesh.geometry as THREE.Geometry
		if (geometry.type !== 'PlaneGeometry')
			throw Error('invalid geometry ' + imageMesh.geometry)

		this.add(imageMesh)
		this.add(pyramid(geometry.vertices))
	}

	// Scale the image from pixel dimensions to three.js coordinates.
	scaleImage(scale: number): void {
		this.scale.setX(scale)
		this.scale.setY(scale)
	}

	// Set the distance in three.js coordinates from the camera to the image.
	scaleDistance(scale: number): void {
		this.scale.setZ(scale)
	}

	// Set opacity of the image.
	setOpacity(opacity: number): void {
		(this.imageMesh.material as THREE.Material).opacity = opacity
	}
}
