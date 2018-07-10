import * as React from "react"
import * as THREE from "three";
import * as carModelOBJ from '@/annotator-assets/models/BMW_X5_4.obj'
import {
  convertToStandardCoordinateFrame, CoordinateFrameType,
  cvtQuaternionToStandardCoordinateFrame
} from "@/mapper-annotated-scene/geometry/CoordinateFrame";
import AnnotatedSceneActions from "@/mapper-annotated-scene/src/store/actions/AnnotatedSceneActions"
import * as MapperProtos from '@mapperai/mapper-models'
import Models = MapperProtos.mapper.models
import AnnotatedSceneController from "@/mapper-annotated-scene/src/services/AnnotatedSceneController";
import {createStructuredSelector} from "reselect";
import AnnotatedSceneState from "@/mapper-annotated-scene/src/store/state/AnnotatedSceneState";
import {typedConnect} from "@/mapper-annotated-scene/src/styles/Themed";

export interface CarManagerProps {
  annotatedScene: AnnotatedSceneController
  isCarInitialized ?: boolean
}

export interface CarManagerState {
	carModel: THREE.Object3D
  rotationQuaternion: THREE.Quaternion
}

@typedConnect(createStructuredSelector({
  isCarInitialized: (state) => state.get(AnnotatedSceneState.Key).isCarInitialized,
}))
export default class CarManager extends React.Component<CarManagerProps, CarManagerState> {
	private loadingCarModel: boolean

	constructor(props) {
		super(props)
		this.loadingCarModel = false
	}

	componentWillReceiveProps(newProps: CarManagerProps) {
		if(newProps.annotatedScene && !this.props.isCarInitialized && !this.loadingCarModel) {
			this.loadingCarModel = true
			// Only execute this once -- hence the check against isCarInitialized
			this.loadCarModel().then(() => new AnnotatedSceneActions().setCarInitialized(true))
		}
	}

  addObjectToCar(object:THREE.Object3D):void {
		const carModel = this.state.carModel
		carModel.add(object)
		this.setState({carModel})
	}

	// Used by AreaOfInterestManager in updatePointCloudAoi as part of getPointOfInterest()
	getCarModelPosition(): THREE.Vector3 {
		return this.state.carModel.position
	}

	// quaternion is set from
	// Used by AreaOfInterestManager to set AOIHeading
	getCarModelRotation(): THREE.Quaternion {
		return this.state.rotationQuaternion
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
					new AnnotatedSceneActions().addObjectToScene( object )
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
    const positionThreeJs = this.props.annotatedScene.utmCoordinateSystem.utmToThreeJs(standardPosition.x, standardPosition.y, standardPosition.z)
    const inputRotation = new THREE.Quaternion(pose.q0, pose.q1, pose.q2, pose.q3)
    const standardRotation = cvtQuaternionToStandardCoordinateFrame(inputRotation, CoordinateFrameType.STANDARD)
    const rotationThreeJs = new THREE.Quaternion(standardRotation.y, standardRotation.z, standardRotation.x, standardRotation.w)
    rotationThreeJs.normalize()

		// Used by areaOfInterestManager to passively update  updateAoiHeading
		this.setState({rotationQuaternion: rotationThreeJs})
    // OLD --> this.props.areaOfInterestManager.updateAoiHeading(rotationThreeJs)

		this.props.annotatedScene.updateCurrentLocationStatusMessage(standardPosition)
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
