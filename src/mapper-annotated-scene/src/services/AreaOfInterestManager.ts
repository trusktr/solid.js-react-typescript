import * as THREE from 'three'
import * as React from 'react'
import config from '@/config'
import {isTupleOfNumbers} from "@/util/Validation";
import Logger from "@/util/log";
import AnnotatedSceneActions from "../store/actions/AnnotatedSceneActions";
import {RangeSearch} from "../../tile-model/RangeSearch";

const log = Logger(__filename)

interface IAoiProps {
	// JOE MONDAY 7/2 moved from PointCloudManager
	getCurrentPointOfInterest: () => THREE.Vector3 | null
}

// Area of Interest: where to load point clouds
interface IAoiState {
	enabled: boolean // enable auto-loading points around the AOI
	focalPoint: THREE.Vector3 | null, // cached value for the center of the AOI
	boundingBoxes: THREE.BoxHelper[] // boxes drawn around the current area of interest
	currentHeading: THREE.Vector3 | null // in fly-through mode: where the vehicle is heading
	bBoxColor: THREE.Color
	fullSize: THREE.Vector3 // the dimensions of an AOI box, which will be constructed around a center point
	halfSize: THREE.Vector3 // half the dimensions of an AOI box
	shouldDrawBoundingBox: boolean
}

export default
class AreaOfInterestManager extends React.Component<IAoiProps, IAoiState>{

	constructor(props) {
		super(props)

		const _state = {
			enabled: !!config['annotator.area_of_interest.enable'],
			focalPoint: null,
			boundingBoxes: [],
			currentHeading: null,
			bBoxColor: new THREE.Color(0x00ff00),

			fullSize: new THREE.Vector3(30, 30, 30),
			halfSize: new THREE.Vector3(15, 15, 15),

			shouldDrawBoundingBox: !!config['annotator.draw_bounding_box'],
		}


		const aoiSize: [number, number, number] = config['annotator.area_of_interest.size']

		if (isTupleOfNumbers(aoiSize, 3)) {

			_state.fullSize = new THREE.Vector3().fromArray(aoiSize)
			_state.halfSize = _state.fullSize.clone().divideScalar(2)

		} else if (aoiSize) {

			log.warn(`invalid annotator.area_of_interest.size config: ${aoiSize}`)

		}

		this.state = _state
	}

	updateAoiHeading(rotationThreeJs: THREE.Quaternion | null): void {
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

		// TODO JOE MONDAY 7/2 get cameraIsOrbiting from redux
		if (this.props.cameraIsOrbiting) return

		// TileManager will only handle one IO request at time. Pause AOI updates if it is busy.
		// TODO JOE MONDAY 7/2 if any tiles of any layer are loading, not just point cloud tiles
		if (this.props.pointCloudTileManager.isLoadingTiles) return

		// TODO JOE MONDAY 7/2 replace with a variable from Redux. We can use componentDidUpdate to trigger updatePointCloudAoi
		const currentPoint = this.props.getCurrentPointOfInterest()

		if (currentPoint) {
			const oldPoint = this.state.focalPoint
			const newPoint = currentPoint.clone().round()
			const samePoint = oldPoint && oldPoint.x === newPoint.x && oldPoint.y === newPoint.y && oldPoint.z === newPoint.z
			if (!samePoint) {
				this.setState({focalPoint: newPoint})
				this.updatePointCloudAoiBoundingBox(this.state.focalPoint)
			}
		} else {
			if (this.state.focalPoint !== null) {
				this.setState({focalPoint: null})
				this.updatePointCloudAoiBoundingBox(this.state.focalPoint)
			}
		}
	}

	// Create a bounding box around the current AOI and optionally display it.
	// Then load the points in and around the AOI. If we have a current heading,
	// extend the AOI with another bounding box in the direction of motion.
	private updatePointCloudAoiBoundingBox(focalPoint: THREE.Vector3 | null): void {
		if (this.state.shouldDrawBoundingBox) {
			this.state.boundingBoxes.forEach(bbox => this.props.sceneManager.removeObjectToScene(bbox))
			this.setState({boundingBoxes: []})
		}

		if (focalPoint) {
			const threeJsSearches: RangeSearch[] = [{
				minPoint: focalPoint.clone().sub(this.state.halfSize),
				maxPoint: focalPoint.clone().add(this.state.halfSize),
			}]

			// What could be better than one AOI, but two? Add another one so we see more of what's in front.
			if (this.state.currentHeading) {
				const extendedFocalPoint = focalPoint.clone()
					.add(this.state.fullSize.clone().multiply(this.state.currentHeading))
				threeJsSearches.push({
					minPoint: extendedFocalPoint.clone().sub(this.state.halfSize),
					maxPoint: extendedFocalPoint.clone().add(this.state.halfSize),
				})
			}

			if (this.state.shouldDrawBoundingBox) {
				threeJsSearches.forEach(search => {
					const geom = new THREE.Geometry()
					geom.vertices.push(search.minPoint, search.maxPoint)
					const bbox = new THREE.BoxHelper(new THREE.Points(geom), this.state.bBoxColor)
					this.setState({ boundingBoxes: this.state.boundingBoxes.concat(bbox) })
					new AnnotatedSceneActions().addObjectToScene(bbox)
				})
			}

			const utmSearches = threeJsSearches.map(threeJs => {
				return {
					minPoint: this.props.utmCoordinateSystem.threeJsToUtm(threeJs.minPoint),
					maxPoint: this.props.utmCoordinateSystem.threeJsToUtm(threeJs.maxPoint),
				}
			})

			// TODO JOE MONDAY 7/2 for each tile manager, tell them to load their tile data for the new AoI. {{{

				this.loadPointCloudDataFromMapServer(utmSearches, true)
					.catch(err => {log.warn(err.message)})

				// TODO JOE MONDAY 7/2/18 annotation tiles are coupled to point cloud
				// tiles here, relying on based on the
				// point cloud Aoi. We should probably take out the Aoi from point cloud
				// manager and move to a common place so that all managers can
				// use it
				if (this.settings.enableAnnotationTileManager)
				this.loadAnnotationDataFromMapServer(utmSearches, true)
					.catch(err => {log.warn(err.message)})

			// }}}
		}
	}

}
