/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as THREE from 'three'
import MousePosition from '../models/MousePosition'

export default
function mousePositionToGLSpace(mousePosition: MousePosition, rendererSize: {width: number, height: number}): THREE.Vector2 {
	const mouse = new THREE.Vector2()

	mouse.x = (mousePosition.x / rendererSize.width) * 2 - 1
	mouse.y = -(mousePosition.y / rendererSize.height) * 2 + 1
	return mouse
}
