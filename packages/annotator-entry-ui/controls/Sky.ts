/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as THREE from 'three'

// Create a blue dome which imitates the sky.
// https://github.com/mrdoob/three.js/blob/master/examples/webgl_lights_hemisphere.html
export function Sky(groundColor: THREE.Color, skyColor: THREE.Color, radius: number): THREE.Object3D {
	const hemisphereLight = new THREE.HemisphereLight(skyColor, 0x000000, 1)
	hemisphereLight.position.set(0, 500, 0)

	const vertexShader = `varying vec3 vWorldPosition;
		void main() {
			vec4 worldPosition = modelMatrix * vec4( position, 1.0 );
			vWorldPosition = worldPosition.xyz;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
		}`
	const fragmentShader = `uniform vec3 topColor;
		uniform vec3 bottomColor;
		uniform float offset;
		uniform float exponent;
		varying vec3 vWorldPosition;
		void main() {
			float h = normalize( vWorldPosition + offset ).y;
			gl_FragColor = vec4( mix( bottomColor, topColor, max( pow( max( h , 0.0), exponent ), 0.0 ) ), 1.0 );
		}`

	// BottomColor fades gradually to topColor starting from the horizon.
	const uniforms = {
		topColor: {value: skyColor},
		bottomColor: {value: groundColor},
		exponent: {value: 0.8},
	}
	const material = new THREE.ShaderMaterial({
		vertexShader: vertexShader,
		fragmentShader: fragmentShader,
		uniforms: uniforms,
		side: THREE.BackSide
	})

	const geometry = new THREE.SphereBufferGeometry(radius, 8, 5)
	const sky = new THREE.Mesh(geometry, material)

	const group = new THREE.Group()
	group.add(hemisphereLight)
	group.add(sky)
	return group
}
