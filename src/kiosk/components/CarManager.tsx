/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as React from 'react'
import OBJLoader from '@mapperai/annotated-scene/src/services/OBJLoader'
import * as THREE from 'three'
import {
	convertToStandardCoordinateFrame, CoordinateFrameType,
	cvtQuaternionToStandardCoordinateFrame,
} from '@mapperai/annotated-scene/src/geometry/CoordinateFrame'
import AnnotatedSceneActions from '@mapperai/annotated-scene/src/store/actions/AnnotatedSceneActions'
import * as MapperProtos from '@mapperai/mapper-models'
import AnnotatedSceneController from '@mapperai/annotated-scene/src/services/AnnotatedSceneController'
import {typedConnect} from '@mapperai/annotated-scene/src/styles/Themed'
import toProps from '@mapperai/annotated-scene/src/util/toProps'
import carModelOBJ from '../models/BMW_X5_4.obj'

export interface CarManagerProps {
	annotatedScene: AnnotatedSceneController
	isCarInitialized?: boolean
}
export interface CarManagerState {
	carModel: THREE.Object3D
	rotationQuaternion: THREE.Quaternion
}
@typedConnect(toProps(
	'isCarInitialized',
))
export default class CarManager extends React.Component<CarManagerProps, CarManagerState> {
	constructor(props: CarManagerProps) {
		super(props)
	}

	componentDidMount(): void {
		this.loadCarModel().then(() => {
			new AnnotatedSceneActions().setCarInitialized(true)
		})
	}

	addObjectToCar(object: THREE.Object3D): void {
		const carModel = this.state.carModel

		carModel.add(object)
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

	private loadCarModel(): Promise<THREE.Object3D> {
		return new Promise((resolve: (carModel: THREE.Object3D) => void, reject: (reason?: Error) => void): void => {
			try {
				const manager = new THREE.LoadingManager()
				const loader = new OBJLoader(manager)

				loader.load(carModelOBJ, (carModel: THREE.Object3D) => {
					const boundingBox = new THREE.Box3().setFromObject(carModel)
					const boxSize = boundingBox.getSize().toArray()
					const modelLength = Math.max(...boxSize)
					const carLength = 4.5 // approx in meters
					const scaleFactor = carLength / modelLength

					carModel.scale.setScalar(scaleFactor)
					carModel.visible = false

					carModel.traverse(child => {
						if (child instanceof THREE.Mesh) {
							child.material = new THREE.MeshPhongMaterial({
								color: new THREE.Color(0x002233),
								specular: 0x222222,
								shininess: 0,
							})
						}
					})

					this.setState({carModel})
					new AnnotatedSceneActions().addObjectToScene(carModel)
					resolve(carModel)
				})
			} catch (err) {
				reject(err)
			}
		})
	}

	updateCarWithPose(pose: MapperProtos.mapper.models.PoseMessage): void {
		const inputPosition = new THREE.Vector3(pose.x, pose.y, pose.z)
		const standardPosition = convertToStandardCoordinateFrame(inputPosition, CoordinateFrameType.STANDARD)
		const positionThreeJs = this.props.annotatedScene.utmCoordinateSystem.utmToThreeJs(standardPosition.x, standardPosition.y, standardPosition.z)
		const inputRotation = new THREE.Quaternion(pose.q0, pose.q1, pose.q2, pose.q3)
		const standardRotation = cvtQuaternionToStandardCoordinateFrame(inputRotation, CoordinateFrameType.STANDARD)
		const rotationThreeJs = new THREE.Quaternion(standardRotation.y, standardRotation.z, standardRotation.x, standardRotation.w)

		rotationThreeJs.normalize()

		// Used by areaOfInterestManager to passively update  updateAoiHeading
		// TODO JOE, huristics on setting the aoiHeading can go into the shared lib
		// instead of here, and be based on camera angle and field of view, etc.
		this.setState({rotationQuaternion: rotationThreeJs})

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

		// RY NOW this.setState({carModel})
	}

	makeCarVisible() {
		const carModel = this.state.carModel

		carModel.visible = true
		// RT NOW this.setState({carModel})
	}

	render(): JSX.Element | null {
		return null
	}
}
