/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as THREE from 'three'

// Create an object which points North as a visual aid.
export function CompassRose(length: number): THREE.Object3D {
	if (length <= 0) throw Error(`invalid length ${length} for CompassRose`)

	const color = 0xffffff
	const letterLength = length / 2
	const letterThickness = letterLength / 30
	const arrowLength = length - letterLength
	const arrowHeadLength = arrowLength / 2
	const arrowHeadWidth = arrowHeadLength / 3
	const geometry = new THREE.ExtrudeGeometry(letterN(letterLength), {amount: letterThickness, bevelEnabled: false})
	const material = new THREE.MeshBasicMaterial({color: new THREE.Color(color)})
	const mesh = new THREE.Mesh(geometry, material)

	geometry.computeBoundingBox()

	const letterTopCenter = geometry.boundingBox.getCenter().setY(geometry.boundingBox.max.y)
	const arrow = new THREE.ArrowHelper(
		new THREE.Vector3(0, 1, 0),
		letterTopCenter,
		arrowLength,
		color,
		arrowHeadLength,
		arrowHeadWidth,
	)
	const group = new THREE.Group()

	group.add(mesh)
	group.add(arrow)
	return group
}

// Draw the letter "N" with its bottom center at origin.
function letterN(length: number): THREE.Shape {
	const unit = length / 6
	const shape = new THREE.Shape()

	shape.moveTo(unit * -3, unit * 0)
	shape.lineTo(unit * -3, unit * 6)
	shape.lineTo(unit * -1, unit * 6)
	shape.lineTo(unit * 1, unit * 3)
	shape.lineTo(unit * 1, unit * 6)
	shape.lineTo(unit * 3, unit * 6)
	shape.lineTo(unit * 3, unit * 0)
	shape.lineTo(unit * 1, unit * 0)
	shape.lineTo(unit * -1, unit * 3)
	shape.lineTo(unit * -1, unit * 0)
	shape.lineTo(unit * -3, unit * 0)
	return shape
}
