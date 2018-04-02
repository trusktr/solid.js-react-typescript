/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as Electron from "electron"
import * as THREE from 'three'
import {ImageScreen} from "./ImageScreen"
import {CalibratedImage} from "./CalibratedImage"
import {ImaginaryCameraParameters} from "./CameraParameters"

const dialog = Electron.remote.dialog

const arbitraryImageScale = 0.3 // fudge factor until I figure out how to scale it from CameraParameters

const imageMaterialParameters = {
	side: THREE.FrontSide,
	transparent: true,
	opacity: 1.0
}

export class ImageManager {
	private textureLoader: THREE.TextureLoader
	private images: CalibratedImage[]
	private opacity: number
	private onImageScreenLoad: (imageScreen: ImageScreen) => void

	constructor(
		opacity: number,
		onImageScreenLoad: (imageScreen: ImageScreen) => void
	) {
		this.textureLoader = new THREE.TextureLoader()
		this.images = []
		this.opacity = opacity
		this.onImageScreenLoad = onImageScreenLoad
	}

	// Set opacity of all images.
	setOpacity(opacity: number): boolean {
		if (this.opacity === opacity)
			return false
		this.opacity = opacity
		if (!this.images.length)
			return false
		this.images.forEach(i => i.imageScreen.setOpacity(opacity))
		return true
	}

	loadImagesFromOpenDialog(): Promise<void> {
		return new Promise((resolve: () => void, reject: (reason?: Error) => void): void => {
			const options: Electron.OpenDialogOptions = {
				message: 'Load Image Files',
				properties: ['openFile', 'multiSelections'],
				filters: [{name: 'images', extensions: ['jpeg', 'jpg', 'png']}],
			}
			const handler = (paths: string[]): void => {
				if (paths && paths.length) {
					const promises = paths.map(path => this.loadImageFromPath(path))
					Promise.all(promises)
						.then(() => resolve())
						.catch(err => reject(err))
				} else {
					reject(Error('no path selected'))
				}
			}
			dialog.showOpenDialog(options, handler)
		})
	}

	private loadImageFromPath(path: string): Promise<void> {
		return this.loadImageAsPlaneGeometry(path)
			.then(mesh =>
				this.setUpScreen({
					imageScreen: new ImageScreen(mesh),
					parameters: {
						screenPosition: new THREE.Vector3(0, -50, 0),
						cameraOrigin: new THREE.Vector3(500, 200, 500),
					} as ImaginaryCameraParameters,
				} as CalibratedImage)
			)
	}

	private loadImageAsPlaneGeometry(path: string): Promise<THREE.Mesh> {
		return new Promise((resolve: (mesh: THREE.Mesh) => void, reject: (reason?: Error) => void): void => {
			const onLoad = (texture: THREE.Texture): void => {
				texture.minFilter = THREE.LinearFilter

				const planeGeometry = new THREE.PlaneGeometry(texture.image.width, texture.image.height)
				const material = new THREE.MeshBasicMaterial(imageMaterialParameters)
				material.map = texture

				resolve(new THREE.Mesh(planeGeometry, material))
			}

			const onError = (): void =>
				reject(Error('texture load failed for ' + path))

			this.textureLoader.load(path, onLoad, undefined, onError)
		})
	}

	private setUpScreen(calibratedImage: CalibratedImage): void {
		this.images.push(calibratedImage)
		const screen = calibratedImage.imageScreen
		const position = calibratedImage.parameters.screenPosition
		const origin = calibratedImage.parameters.cameraOrigin
		screen.position.set(position.x, position.y, position.z)
		screen.scaleImage(arbitraryImageScale)
		screen.scaleDistance(position.distanceTo(origin))
		screen.lookAt(origin)
		screen.setOpacity(this.opacity)
		this.onImageScreenLoad(screen)
	}
}
