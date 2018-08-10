/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as THREE from 'three'
import * as React from 'react'
import {isTupleOfNumbers} from '../util/Validation'
import Logger from '../util/log'
import AnnotatedSceneActions from '../store/actions/AnnotatedSceneActions'
import {RangeSearch} from '../tiles/tile-model/RangeSearch'
import {UtmCoordinateSystem} from '../UtmCoordinateSystem'
import {typedConnect} from '../styles/Themed'
import GroundPlaneManager from './GroundPlaneManager'
import TileManagerBase from '../tiles/TileManagerBase'
import {AxesHelper} from './controls/AxesHelper'
import toProps from '../util/toProps'
import {EventEmitter} from 'events'
import {Events} from '../models/Events'
import {throttle} from 'lodash'

const log = Logger(__filename)

type AreaOfInterest = RangeSearch[]

interface AreaOfInterestManagerProps {
	config: any /* eslint-disable-line typescript/no-explicit-any */
	getPointOfInterest?: () => THREE.Vector3
	getCurrentRotation?: () => THREE.Quaternion
	utmCoordinateSystem: UtmCoordinateSystem
	groundPlaneManager: GroundPlaneManager
	camera?: THREE.Camera
	loadingTileManagers?: Set<TileManagerBase>
	sceneStage?: THREE.Vector3
	channel: EventEmitter
}

// Area of Interest: where to load point clouds
interface AreaOfInterestManagerState {
	enabled: boolean // enable auto-loading points around the AOI
	aoiFocalPoint: THREE.Vector3 | null // cached value for the center of the AOI
	boundingBoxes: THREE.BoxHelper[] // boxes drawn around the current area of interest
	currentHeading: THREE.Vector3 | null // in fly-through mode: where the vehicle is heading
	bBoxColor: THREE.Color
	fullSize: THREE.Vector3 // the dimensions of an AOI box, which will be constructed around a center point
	halfSize: THREE.Vector3 // half the dimensions of an AOI box
	shouldDrawBoundingBox: boolean
}

@typedConnect(toProps(
	'camera',
	'loadingTileManagers',
	'sceneStage',
))
export default class AreaOfInterestManager extends React.Component<AreaOfInterestManagerProps, AreaOfInterestManagerState> {
	private raycaster: THREE.Raycaster
	plane: THREE.Mesh
	private grid?: THREE.GridHelper
	private axis?: THREE.Group

	constructor(props: AreaOfInterestManagerProps) {
		super(props)

		const state = {
			enabled: !!props.config['annotator.area_of_interest.enable'],
			aoiFocalPoint: null,
			boundingBoxes: [],
			currentHeading: null,
			bBoxColor: new THREE.Color(0x00ff00),

			fullSize: new THREE.Vector3(30, 30, 30),
			halfSize: new THREE.Vector3(15, 15, 15),

			shouldDrawBoundingBox: !!props.config['annotator.draw_bounding_box'],
		}
		const aoiSize: [number, number, number] = props.config['annotator.area_of_interest.size']

		if (isTupleOfNumbers(aoiSize, 3)) {
			state.fullSize = new THREE.Vector3().fromArray(aoiSize)
			state.halfSize = state.fullSize.clone().divideScalar(2)
		} else if (aoiSize) {
			log.warn(`invalid annotator.area_of_interest.size config: ${aoiSize}`)
		}

		this.state = state

		this.raycaster = new THREE.Raycaster()
		this.raycaster.params.Points!.threshold = 0.1

		this.props.channel.on(Events.SCENE_WILL_RENDER, this.updateAoi)
	}

	private updateAoi = throttle((): void => {
		if (!this.state.enabled) return

		// TileManager will only handle one IO request at time. Pause AOI updates if it is busy.
		if (this.props.loadingTileManagers!.size > 0) return

		this.updateAoiHeading()
		this.updatePointCloudAoi()
	}, 200)

	/**
	 * Update the AOI Heading.  Currently (7/18) this is Kiosk-only logic but may expand
	 */
	private updateAoiHeading(): void {
		const rotationThreeJs = this.props.getCurrentRotation ? this.props.getCurrentRotation() : null

		if (this.state.enabled) {
			const newHeading = rotationThreeJs
				? new THREE.Vector3(-1, 0, 0).applyQuaternion(rotationThreeJs)
				: null

			this.setState({currentHeading: newHeading})
		}
	}

	// Set the area of interest for loading point clouds.
	private updatePointCloudAoi(): void {
		const currentPoint = this.getPointOfInterest()

		if (currentPoint) {
			const oldPoint = this.state.aoiFocalPoint
			const newPoint = currentPoint.clone().round()
			const samePoint = oldPoint && oldPoint.x === newPoint.x && oldPoint.y === newPoint.y && oldPoint.z === newPoint.z

			if (!samePoint) {
				this.setState({aoiFocalPoint: newPoint})
				new AnnotatedSceneActions().setPointOfInterest(newPoint)
				this.updatePointCloudAoiBoundingBox(newPoint)
			}
		} else {
			if (this.state.aoiFocalPoint !== null) {
				this.setState({aoiFocalPoint: null})
				new AnnotatedSceneActions().setPointOfInterest(null)
				this.updatePointCloudAoiBoundingBox(null)
			}
		}
	}

	private getPointOfInterest(): THREE.Vector3 | null {
		// if the app supplies a way to get the point of interest, use it (f.e. Kiosk sets it based on the Car position)
		if (this.props.getPointOfInterest)
			return this.props.getPointOfInterest()

		// otherwise default to where the camera line of sight intersects the ground.
		else
			return this.getDefaultPointOfInterest()
	}

	// Find the point in the scene that is most interesting to a human user.
	private getDefaultPointOfInterest(): THREE.Vector3 | null {
		const middleOfTheViewport = new THREE.Vector2(0, 0)
		const intersections = this.props.groundPlaneManager.intersectWithGround(undefined, middleOfTheViewport)

		if (intersections.length)
			return intersections[0].point
		else
			return null
	}

	// Create a bounding box around the current AOI and optionally display it.
	// Then load the points in and around the AOI. If we have a current heading,
	// extend the AOI with another bounding box in the direction of motion.
	private updatePointCloudAoiBoundingBox(aoiFocalPoint: THREE.Vector3 | null): void {
		if (this.state.shouldDrawBoundingBox) {
			this.state.boundingBoxes.forEach(bbox => {
				new AnnotatedSceneActions().removeObjectFromScene(bbox)
			})

			this.setState({boundingBoxes: []})
		}

		if (aoiFocalPoint) {
			const threeJsAOI: RangeSearch[] = [{
				minPoint: aoiFocalPoint.clone().sub(this.state.halfSize),
				maxPoint: aoiFocalPoint.clone().add(this.state.halfSize),
			}]

			// What could be better than one AOI, but two? Add another one so we see more of what's in front.
			if (this.state.currentHeading) {
				const extendedFocalPoint = aoiFocalPoint.clone()
					.add(this.state.fullSize.clone().multiply(this.state.currentHeading))

				threeJsAOI.push({
					minPoint: extendedFocalPoint.clone().sub(this.state.halfSize),
					maxPoint: extendedFocalPoint.clone().add(this.state.halfSize),
				})
			}

			if (this.state.shouldDrawBoundingBox) {
				threeJsAOI.forEach(search => {
					const geom = new THREE.Geometry()

					geom.vertices.push(search.minPoint, search.maxPoint)

					const bbox = new THREE.BoxHelper(new THREE.Points(geom), this.state.bBoxColor)

					bbox.name = 'AOI Bounding Box'
					this.setState({boundingBoxes: this.state.boundingBoxes.concat(bbox)})
					new AnnotatedSceneActions().addObjectToScene(bbox)
				})
			}

			// convert the area of interest to UTM coordinates
			const areaOfInterest: AreaOfInterest = threeJsAOI.map(threeJs => {
				return {
					minPoint: this.props.utmCoordinateSystem.threeJsToUtm(threeJs.minPoint),
					maxPoint: this.props.utmCoordinateSystem.threeJsToUtm(threeJs.maxPoint),
				}
			})

			new AnnotatedSceneActions().setAreaOfInterest(areaOfInterest)
		}
	}

	removeAxisFromScene(): void {
		if (this.axis)
			this.axis.visible = false
	}

	hideGridVisibility(): void {
		this.grid!.visible = false
	}

	componentDidMount(): void {
		const planeGeometry = new THREE.PlaneGeometry(2000, 2000)

		planeGeometry.rotateX(-Math.PI / 2)

		const planeMaterial = new THREE.ShadowMaterial()

		planeMaterial.side = THREE.DoubleSide // enable raycaster intersections from both sides

		this.plane = new THREE.Mesh(planeGeometry, planeMaterial)
		this.plane.visible = true

		new AnnotatedSceneActions().addObjectToScene(this.plane)

		// Add grid to visualize where the plane is.
		// Add an axes helper to visualize the origin and orientation of the primary directions.

		const axesHelperLength = parseFloat(this.props.config['annotator.axes_helper_length']) || 0

		if (axesHelperLength > 0) {
			const gridSize = parseFloat(this.props.config['annotator.grid_size']) || 200
			const gridUnit = parseFloat(this.props.config['annotator.grid_unit']) || 10
			const gridDivisions = gridSize / gridUnit

			this.grid = new THREE.GridHelper(gridSize, gridDivisions, new THREE.Color('white'))
			this.grid.visible = true
			this.grid.material.opacity = 0.25
			this.grid.material.transparent = true

			this.plane.add(this.grid)

			this.axis = AxesHelper(axesHelperLength)
			this.grid.add(this.axis)
		}
	}

	componentDidUpdate(oldProps: AreaOfInterestManagerProps): void {
		if (oldProps.sceneStage !== this.props.sceneStage) {
			const {x, y, z} = this.props.sceneStage!

			this.plane.geometry.center()
			this.plane.geometry.translate(x, y, z)
		}
	}

	render(): JSX.Element | null {
		return null
	}
}
