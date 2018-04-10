/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as THREE from 'three'
import {threeDStepSize} from "../tile/Constant"

// The tip of the pyramid will work with a default PlaneGeometry which hasn't been rotated
// out of the XY plane.
const tip = new THREE.Vector3(0, 0, 1)
const pyramidMaterial = new THREE.LineBasicMaterial({color: 0x66aa00})
const invisiblePyramidMaterial = new THREE.LineBasicMaterial({visible: false})
const borderMaterial = new THREE.LineBasicMaterial({color: 0xffffff})
const unhighlightedBorderMaterial = new THREE.LineBasicMaterial({color: 0x999999})
const invisibleBorderMaterial = new THREE.LineBasicMaterial({visible: false})

// Extend lines from the corners of the base to a central point, forming the top of a pyramid.
// Assume four corners in the base.
function pyramid(base: THREE.Vector3[], visible: boolean): THREE.Line {
	const vertices = [
		tip,
		base[0],
		tip,
		base[1],
		tip,
		base[2],
		tip,
		base[3],
	]
	return lineGeometry(vertices, visible ? pyramidMaterial : invisiblePyramidMaterial)
}

// Extend a line the four corners of the base.
function border(base: THREE.Vector3[], visible: boolean): THREE.Line {
	const vertices = [
		base[0],
		base[1],
		base[3],
		base[2],
		base[0],
	]
	return lineGeometry(vertices, visible ? unhighlightedBorderMaterial : invisibleBorderMaterial)
}

function lineGeometry(vertices: THREE.Vector3[], material: THREE.LineBasicMaterial): THREE.Line {
	const positions = new Float32Array(vertices.length * threeDStepSize)
	for (let i = 0; i < vertices.length; i++) {
		const j = i * threeDStepSize
		positions[j + 0] = vertices[i].x
		positions[j + 1] = vertices[i].y
		positions[j + 2] = vertices[i].z
	}

	const geometry = new THREE.BufferGeometry()
	geometry.addAttribute('position', new THREE.BufferAttribute(positions, threeDStepSize))

	return new THREE.Line(geometry, material)
}

// An object containing a 2D image, located in 3D space, plus a wireframe
// representing the field of view of the camera which captured the image.
// The hypothetical camera lies at the apex of a right pyramid, looking down
// at the image which forms the base.
export class ImageScreen extends THREE.Object3D {
	imageMesh: THREE.Mesh
	private visibleWireframe: boolean
	private border: THREE.Line

	constructor(imageMesh: THREE.Mesh, visibleWireframe: boolean) {
		super()
		this.imageMesh = imageMesh
		this.visibleWireframe = visibleWireframe

		const geometry = imageMesh.geometry as THREE.Geometry
		if (geometry.type !== 'PlaneGeometry')
			throw Error('invalid geometry ' + imageMesh.geometry)

		this.add(imageMesh)
		this.add(pyramid(geometry.vertices, visibleWireframe))
		this.border = border(geometry.vertices, visibleWireframe)
		this.add(this.border)
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

	// Draw a border around the image, or don't.
	setHighlight(highlight: boolean): boolean {
		this.border.material = highlight ? borderMaterial : this.visibleWireframe ? unhighlightedBorderMaterial : invisibleBorderMaterial
		return true
	}

	private visibleChildren(): THREE.Object3D[] {
		if (this.visibleWireframe)
			return this.children
		else
			return this.children.filter(obj => obj.type !== 'Line')
	}

	makeVisible(): void {
		this.visibleChildren().forEach(obj => obj.visible = true)
	}

	makeInvisible(): void {
		this.visibleChildren().forEach(obj => obj.visible = false)
	}
}
