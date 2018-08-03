/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as THREE from 'three'
import {lineGeometry} from '../../mapper-annotated-scene/geometry/ThreeHelpers'

// The tip of the pyramid will work with a default PlaneGeometry which hasn't been rotated
// out of the XY plane.
const tip = new THREE.Vector3(0, 0, 1)
// Image screen materials
const pyramidMaterial = new THREE.LineBasicMaterial({color: new THREE.Color(0x66aa00)})
const invisiblePyramidMaterial = new THREE.LineBasicMaterial({visible: false})
const borderMaterial = new THREE.LineBasicMaterial({color: new THREE.Color(0xffffff)})
const unhighlightedBorderMaterial = new THREE.LineBasicMaterial({color: new THREE.Color(0x999999)})
const invisibleBorderMaterial = new THREE.LineBasicMaterial({visible: false})
const inactiveMaterial = new THREE.MeshBasicMaterial({color: new THREE.Color('white'), side: THREE.FrontSide, transparent: true, opacity: 0.5})
// Image loader
const textureLoader = new THREE.TextureLoader()

// Extend lines from the corners of the base to a central point, forming the top of a pyramid.
// Assume four corners in the base.
function pyramid(base: THREE.Vector3[], visible: boolean): THREE.Line {
	const vertices = [
		tip, base[0],
		tip, base[1],
		tip, base[2],
		tip, base[3],
	]

	return lineGeometry(vertices, visible ? pyramidMaterial : invisiblePyramidMaterial)
}

// Draw a line the four corners of the base.
function border(base: THREE.Vector3[], visible: boolean): THREE.Line {
	const vertices = [
		base[0], base[1], base[3], base[2], base[0],
	]

	return lineGeometry(vertices, visible ? unhighlightedBorderMaterial : invisibleBorderMaterial)
}

// An object containing a 2D image, located in 3D space, plus a wireframe
// representing the field of view of the camera which captured the image.
// The hypothetical camera lies at the apex of a right pyramid, looking down
// at the image which forms the base.
export class ImageScreen extends THREE.Object3D {
	imageMesh: THREE.Mesh
	private imageLoaded: boolean
	private path: string
	private imageGeometry: THREE.Geometry
	private visibleWireframe: boolean
	private highlighted: boolean
	private border: THREE.Line

	constructor(path: string, width: number, height: number, visibleWireframe: boolean) {
		super()

		this.imageLoaded = false
		this.path = path
		this.visibleWireframe = visibleWireframe
		this.highlighted = false

		this.imageGeometry = new THREE.PlaneGeometry(width, height)
		this.imageMesh = new THREE.Mesh(this.imageGeometry, inactiveMaterial.clone())

		this.add(this.imageMesh)
		this.add(pyramid(this.imageGeometry.vertices, visibleWireframe))
		this.border = border(this.imageGeometry.vertices, visibleWireframe)
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
		if (highlight === this.highlighted) {
			return false
		} else {
			this.border.material = highlight ? borderMaterial : this.visibleWireframe ? unhighlightedBorderMaterial : invisibleBorderMaterial
			this.highlighted = highlight
			return true
		}
	}

	private visibleChildren(): THREE.Object3D[] {
		if (this.visibleWireframe)
			return this.children
		else
			return this.children.filter(obj => obj.type !== 'Line')
	}

	makeVisible(): void {
		this.visibleChildren().forEach(obj => {
			obj.visible = true
		})
	}

	makeInvisible(): void {
		this.visibleChildren().forEach(obj => {
			obj.visible = false
		})
	}

	loadImage(): Promise<boolean> {
		if (this.imageLoaded) {
			return Promise.resolve(false)
		} else {
			return new Promise((resolve: (loaded: boolean) => void): void => {
				const onLoad = (texture: THREE.Texture): void => {
					texture.minFilter = THREE.LinearFilter

					const activeMaterial = new THREE.MeshBasicMaterial({
						side: THREE.FrontSide,
						transparent: true,
						opacity: 1.0,
					})

					activeMaterial.map = texture
					this.imageMesh.material = activeMaterial
					this.imageLoaded = true
					resolve(true)
				}

				textureLoader.load(this.path, onLoad, undefined, undefined)
			})
		}
	}

	unloadImage(): void {
		if (this.imageLoaded) {
			this.imageLoaded = false
			this.imageMesh.material = inactiveMaterial.clone()
		}
	}
}
