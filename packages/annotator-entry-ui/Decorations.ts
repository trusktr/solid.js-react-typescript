/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as THREE from "three"

interface DecorationConfig {
	// tslint:disable-next-line:no-any
	asset: any
	material: THREE.Material
	lngLatAlt: THREE.Vector3
}

// Assume the object will be rendered as a floating billboard within a point cloud.
// Make it roughly human-sized.
const objectSize = 5.0 // approx in meters

const configs: DecorationConfig[] = [
	{ // Mapper, San Francisco
		asset: require('../annotator-assets/models/Mapper_logo.obj'),
		material: new THREE.MeshPhongMaterial({color: 0xFFC629, specular: 0x000000, shininess: 0}),
		lngLatAlt: new THREE.Vector3(-122.4139, 37.7635, 3),
	},
	{ // Honda, Mountain View
		asset: require('../annotator-assets/models/Honda_logo.obj'),
		material: new THREE.MeshPhongMaterial({color: 0x0080C5, specular: 0x000000, shininess: 0}),
		lngLatAlt: new THREE.Vector3(-122.0522, 37.3900, 10),
	},
]

// Get some extras to display along with the point cloud.
export function getDecorations(): Promise<THREE.Object3D[]> {
	const manager = new THREE.LoadingManager()
	const loader = new THREE.OBJLoader(manager)

	const promises = configs.map(config =>
		new Promise((resolve: (object: THREE.Object3D) => void, reject: (reason?: Error) => void): void => {
			try {
				const model = config.asset
				loader.load(model, (object: THREE.Object3D) => {
					const boundingBox = new THREE.Box3().setFromObject(object)
					const boxSize = boundingBox.getSize().toArray()
					const modelLength = Math.max(...boxSize)
					const scaleFactor = objectSize / modelLength
					object.scale.setScalar(scaleFactor)
					object.visible = true
					object.traverse(child => {
						if (child instanceof THREE.Mesh)
							child.material = config.material
					})
					object.userData = config.lngLatAlt
					resolve(object)
				})
			} catch (err) {
				reject(err)
			}
		})
	)

	return Promise.all(promises)
}
