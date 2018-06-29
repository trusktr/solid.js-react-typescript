import * as THREE from 'three'
import MousePosition from './MousePosition'

// TODO REORG JOE, generic, can go in a lib or utils
export default
function mousePositionToGLSpace(mousePosition: MousePosition, renderer: THREE.WebGLRenderer): THREE.Vector2 {
	const mouse = new THREE.Vector2()
	mouse.x = ( mousePosition.clientX / renderer.domElement.clientWidth ) * 2 - 1
	mouse.y = -( mousePosition.clientY / renderer.domElement.clientHeight ) * 2 + 1
	return mouse
}
