import * as React from "react"
import * as THREE from "three";
import * as carModelOBJ from 'assets/models/BMW_X5_4.obj'
import {SceneManager} from "@/annotator-z-hydra-shared/src/services/SceneManager";
import {
  convertToStandardCoordinateFrame, CoordinateFrameType,
  cvtQuaternionToStandardCoordinateFrame
} from "@/annotator-entry-ui/geometry/CoordinateFrame";
import PointCloudManager from "@/annotator-z-hydra-shared/src/services/PointCloudManager";
import StatusWindow from "@/annotator-z-hydra-shared/components/StatusWindow";
import RoadNetworkEditorActions from "@/annotator-z-hydra-shared/src/store/actions/RoadNetworkEditorActions";
import * as MapperProtos from '@mapperai/mapper-models'
import Models = MapperProtos.mapper.models

export interface CarManagerProps {
	sceneManager: SceneManager | null
	pointCloudManager: PointCloudManager
	statusWindow: StatusWindow
}

export interface CarManagerState {
	carModel: THREE.Object3D
}

export default class CarManager extends React.Component<CarManagerProps, CarManagerState> {

	componentWillReceiveProps(newProps: CarManagerProps) {
		if(newProps.sceneManager && newProps.pointCloudManager && this.props.sceneManager === null) {
			this.loadCarModel().then(() => new RoadNetworkEditorActions().setCarInitialized(true))
		}
	}

  addObjectToCar(object:THREE.Object3D):void {
		const carModel = this.state.carModel
		carModel.add(object)
		this.setState({carModel})
	}

	setCarVisibility(visible:boolean) {
		const carModel = this.state.carModel
		carModel.visible = visible
    this.setState({carModel})
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

					this.setState({carModel})
					const sceneManager = this.props.sceneManager
					sceneManager && sceneManager.addObjectToScene(object)
					resolve()
				})
			} catch (err) {
				reject(err)
			}
		})
	}

  // BEHOLDER
  // TODO JOE I'm thinking that Kiosk will update the car, and the
  // SceneManager should pick up the state change and re-render.
	updateCarWithPose(pose: Models.PoseMessage): void {
    const inputPosition = new THREE.Vector3(pose.x, pose.y, pose.z)
    const standardPosition = convertToStandardCoordinateFrame(inputPosition, CoordinateFrameType.STANDARD)
    const positionThreeJs = this.utmCoordinateSystem.utmToThreeJs(standardPosition.x, standardPosition.y, standardPosition.z)
    const inputRotation = new THREE.Quaternion(pose.q0, pose.q1, pose.q2, pose.q3)
    const standardRotation = cvtQuaternionToStandardCoordinateFrame(inputRotation, CoordinateFrameType.STANDARD)
    const rotationThreeJs = new THREE.Quaternion(standardRotation.y, standardRotation.z, standardRotation.x, standardRotation.w)
    rotationThreeJs.normalize()

    this.props.pointCloudManager.updateAoiHeading(rotationThreeJs)
    this.props.statusWindow.updateCurrentLocationStatusMessage(standardPosition)
    this.updateCarPose(positionThreeJs, rotationThreeJs)
  }

  private updateCarPose(position: THREE.Vector3, rotation: THREE.Quaternion): void {
		const carModel = this.state.carModel
    carModel.position.set(position.x, position.y, position.z)
    carModel.setRotationFromQuaternion(rotation)
    // Bring the model close to the ground (approx height of the sensors)
    const p = carModel.getWorldPosition()
    carModel.position.set(p.x, p.y - 2, p.z)

		this.setState({carModel})
  }

  makeCarVisible() {
		const carModel = this.state.carModel
		carModel.visible = true
		this.setState({carModel})
	}

  render() {
		return null
	}

}
