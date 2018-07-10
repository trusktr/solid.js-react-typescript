import * as THREE from 'three'
import * as React from 'react'
import config from '@/config'
import {isTupleOfNumbers} from "@/util/Validation";
import Logger from "@/util/log";
import AnnotatedSceneActions from "../store/actions/AnnotatedSceneActions";
import {RangeSearch} from "../../tile-model/RangeSearch";
import {UtmCoordinateSystem} from "@/mapper-annotated-scene/UtmCoordinateSystem";
import {typedConnect} from "@/mapper-annotated-scene/src/styles/Themed";
import GroundPlaneManager from "@/mapper-annotated-scene/src/services/GroundPlaneManager"
import {SceneManager} from "@/mapper-annotated-scene/src/services/SceneManager"
import toProps from '@/util/toProps'
import {createStructuredSelector} from "reselect";
import AnnotatedSceneState from "@/mapper-annotated-scene/src/store/state/AnnotatedSceneState";
import {TileManager} from "@/mapper-annotated-scene/tile/TileManager";

const log = Logger(__filename)

type AreaOfInterest = RangeSearch[]

interface IAoiProps {
	getPointOfInterest?: () => THREE.Vector3
	getCurrentRotation?: () => THREE.Quaternion
	utmCoordinateSystem: UtmCoordinateSystem
	groundPlaneManager: GroundPlaneManager | null
	sceneManager: SceneManager | null
	camera ?: THREE.Camera
	cameraIsOrbiting ?: boolean
  loadingTileManagers ?: Set<TileManager>
}

// Area of Interest: where to load point clouds
interface IAoiState {
	enabled: boolean // enable auto-loading points around the AOI
	aoiFocalPoint: THREE.Vector3 | null, // cached value for the center of the AOI
	boundingBoxes: THREE.BoxHelper[] // boxes drawn around the current area of interest
	currentHeading: THREE.Vector3 | null // in fly-through mode: where the vehicle is heading
	bBoxColor: THREE.Color
	fullSize: THREE.Vector3 // the dimensions of an AOI box, which will be constructed around a center point
	halfSize: THREE.Vector3 // half the dimensions of an AOI box
	shouldDrawBoundingBox: boolean
}

@typedConnect(createStructuredSelector({
  camera: (state) => state.get(AnnotatedSceneState.Key).camera,
  cameraIsOrbiting: (state) => state.get(AnnotatedSceneState.Key).cameraIsOrbiting,
  loadingTileManagers: (state) => state.get(AnnotatedSceneState.Key).loadingTileManagers,
}))
export default class AreaOfInterestManager extends React.Component<IAoiProps, IAoiState>{
	private raycaster: THREE.Raycaster
	private estimateGroundPlane: boolean

	constructor(props) {
		super(props)

		const state = {
			enabled: !!config['annotator.area_of_interest.enable'],
			aoiFocalPoint: null,
			boundingBoxes: [],
			currentHeading: null,
			bBoxColor: new THREE.Color(0x00ff00),

			fullSize: new THREE.Vector3(30, 30, 30),
			halfSize: new THREE.Vector3(15, 15, 15),

			shouldDrawBoundingBox: !!config['annotator.draw_bounding_box'],
		}


		const aoiSize: [number, number, number] = config['annotator.area_of_interest.size']

		if (isTupleOfNumbers(aoiSize, 3)) {

			state.fullSize = new THREE.Vector3().fromArray(aoiSize)
			state.halfSize = state.fullSize.clone().divideScalar(2)

		} else if (aoiSize) {

			log.warn(`invalid annotator.area_of_interest.size config: ${aoiSize}`)

		}

		this.state = state

		this.raycaster = new THREE.Raycaster()
		this.raycaster.params.Points!.threshold = 0.1

		this.estimateGroundPlane = !!config['annotator.add_points_to_estimated_ground_plane']
	}

	updateAoiHeading(): void {

		// TODO TMP only called for Kiosk app. Maybe fix with detecting camera movement direction
		const rotationThreeJs = this.props.getCurrentRotation!()

		if (this.state.enabled) {
			const newHeading = rotationThreeJs
				? new THREE.Vector3(-1, 0, 0).applyQuaternion(rotationThreeJs)
				: null
			this.setState({currentHeading: newHeading})
		}
	}


	// Set the area of interest for loading point clouds.
	updatePointCloudAoi(): void {
		if (!this.state.enabled) return

		// avoid while the camera is orbiting because the rotation can cause
		// unnecessary movement of the AoI. TODO JOE This will be removed in
		// https://github.com/Signafy/mapper-annotator/pull/202
		if (this.props.cameraIsOrbiting) return

		// TileManager will only handle one IO request at time. Pause AOI updates if it is busy.
		if (this.props.loadingTileManagers!.size > 0) return

		const currentPoint = this.getPointOfInterest()

		if (currentPoint) {
			const oldPoint = this.state.aoiFocalPoint
			const newPoint = currentPoint.clone().round()
			const samePoint = oldPoint && oldPoint.x === newPoint.x && oldPoint.y === newPoint.y && oldPoint.z === newPoint.z

			if (!samePoint) {
				this.setState({aoiFocalPoint: newPoint})
				new AnnotatedSceneActions().setPointOfInterest( this.state.aoiFocalPoint )
				this.updatePointCloudAoiBoundingBox(this.state.aoiFocalPoint)
			}

		} else {
			if (this.state.aoiFocalPoint !== null) {
				this.setState({aoiFocalPoint: null})
				new AnnotatedSceneActions().setPointOfInterest( this.state.aoiFocalPoint )
				this.updatePointCloudAoiBoundingBox(this.state.aoiFocalPoint)
			}
		}
	}

	private getPointOfInterest(): THREE.Vector3 | null {
        if ( this.props.getPointOfInterest ) {

			return this.props.getPointOfInterest()

			// TODO Kiosk needs to pass the above callback in.
            // return this.carModel.position

        } else {

			return this.getDefaultPointOfInterest()

		}
	}

	// Find the point in the scene that is most interesting to a human user.
    private getDefaultPointOfInterest(): THREE.Vector3 | null {

		// wait until there's a camera
		if (!this.props.camera || !this.props.sceneManager) return null

		const middleOfTheViewport = new THREE.Vector2(0, 0)

        // In interactive mode intersect the camera with the ground plane.
        this.raycaster.setFromCamera(middleOfTheViewport, this.props.camera)

        let intersections: THREE.Intersection[] = []

        if (this.estimateGroundPlane && this.props.groundPlaneManager)
            intersections = this.raycaster.intersectObjects(this.props.groundPlaneManager.allGroundPlanes)

        if (!intersections.length)
            intersections = this.raycaster.intersectObject(this.props.sceneManager.state.plane) // TODO FIXME bad access of state

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
					this.setState({ boundingBoxes: this.state.boundingBoxes.concat(bbox) })
					new AnnotatedSceneActions().addObjectToScene(bbox)
				})
			}

			const utmAOI = threeJsAOI.map(threeJs => {
				return {
					minPoint: this.props.utmCoordinateSystem.threeJsToUtm(threeJs.minPoint),
					maxPoint: this.props.utmCoordinateSystem.threeJsToUtm(threeJs.maxPoint),
				}
			})

			new AnnotatedSceneActions().setAreaOfInterest( utmAOI )
		}
	}

	render() {
		return null
	}

}
