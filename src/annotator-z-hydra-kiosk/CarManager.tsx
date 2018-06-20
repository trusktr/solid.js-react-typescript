


import * as React from "react"
import * as THREE from "three";
import * as carModelOBJ from 'assets/models/BMW_X5_4.obj'

export interface CarManagerProps {

}

export interface CarManagerState {
	carModel: THREE.Object3D
}

export default class CarManager extends React.Component<CarManagerProps, CarManagerState> {

	constructor(props){
		super(props)
		this.loadCarModel()
	}


	private loadCarModel(): Promise<void> {
		return new Promise((resolve: () => void, reject: (reason?: Error) => void): void => {
			try {
				const manager = new THREE.LoadingManager()
				const loader = new THREE.OBJLoader(manager)
				loader.load(carModelOBJ, (object: THREE.Object3D) => {
					const boundingBox = new THREE.Box3().setFromObject(object)
					const boxSize = boundingBox.getSize().toArray()
					const modelLength = Math.max(...boxSize)
					const carLength = 4.5 // approx in meters
					const scaleFactor = carLength / modelLength
					const carModel = object
					carModel.scale.setScalar(scaleFactor)
					carModel.visible = false
					carModel.traverse(child => {
						if (child instanceof THREE.Mesh)
							child.material = new THREE.MeshPhongMaterial({
								color: 0x002233,
								specular: 0x222222,
								shininess: 0,
							})
					})

					this.setState({
						carModel: carModel
					})

					// @TODO call SceneManager.addObjectToScene(object)
					// this.scene.add(object)
					resolve()
				})
			} catch (err) {
				reject(err)
			}
		})
	}

	render() {
		return null
	}

}
