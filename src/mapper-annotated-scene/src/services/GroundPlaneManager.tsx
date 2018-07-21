import * as React from "react"
import * as THREE from 'three'
import * as lodash from 'lodash'
import {typedConnect} from "@/mapper-annotated-scene/src/styles/Themed";
import toProps from '@/util/toProps'
import {OrderedMap, Map} from "immutable";
import {SuperTile} from "@/mapper-annotated-scene/tile/SuperTile";
import {PointCloudSuperTile} from "@/mapper-annotated-scene/tile/PointCloudSuperTile";
import config from '@/config'
import {isNull} from "util"
import {UtmCoordinateSystem} from "@/mapper-annotated-scene/UtmCoordinateSystem";
import AnnotatedSceneActions from "../store/actions/AnnotatedSceneActions";
import AreaOfInterestManager from "@/mapper-annotated-scene/src/services/AreaOfInterestManager";
import {EventEmitter} from "events"
import mousePositionToGLSpace from '@/util/mousePositionToGLSpace'
import MousePosition from '@/mapper-annotated-scene/src/models/MousePosition'
import * as Electron from "electron"

export interface IGroundPlaneManagerProps {
	// pointCloudSuperTiles ?: OrderedMap<string, SuperTile>
	utmCoordinateSystem: UtmCoordinateSystem
	camera?: THREE.Camera
	mousePosition?: MousePosition
	areaOfInterestManager: AreaOfInterestManager | null
	channel: EventEmitter
	rendererSize?: Electron.Size
	isAddMarkerMode?: boolean
}

export interface IGroundPlaneManagerState {
	pointCloudSuperTiles: OrderedMap<string, SuperTile>
}

@typedConnect(toProps(
	//'pointCloudSuperTiles',
	'camera',
	'mousePosition',
	'rendererSize',
	'isAddMarkerMode',
))
export default
class GroundPlaneManager extends React.Component<IGroundPlaneManagerProps, IGroundPlaneManagerState> {
	allGroundPlanes: THREE.Mesh[] // ground planes for all tiles, denormalized from superTileGroundPlanes
	private raycaster: THREE.Raycaster
	private superTileGroundPlanes: Map<string, THREE.Mesh[]> // super tile key -> all of the super tile's ground planes
	private estimateGroundPlane: boolean
	private tileGroundPlaneScale: number // ground planes don't meet at the edges: scale them up a bit so they are more likely to intersect a raycaster

	constructor(props) {
		super(props)

		this.raycaster = new THREE.Raycaster
		this.raycaster.params.Points!.threshold = 0.1

		this.estimateGroundPlane = !!config['annotator.add_points_to_estimated_ground_plane']

		this.allGroundPlanes = []
		this.superTileGroundPlanes = Map()

		this.tileGroundPlaneScale = 1.05

		this.state = {
            pointCloudSuperTiles: OrderedMap<string, SuperTile>()
		}

        // Setup listeners on add/remove point cloud tiles
        this.props.channel.on('addPointCloudSuperTile', (superTile:SuperTile) => {
        	this.addTileToState(superTile as PointCloudSuperTile)
        	this.loadTileGroundPlanes(superTile as PointCloudSuperTile)})
        this.props.channel.on('removePointCloudSuperTile', (superTile:SuperTile) => {
        	this.removeTileFromState(superTile as PointCloudSuperTile)
        	this.unloadTileGroundPlanes(superTile as PointCloudSuperTile)})
	}

	addTileToState(superTile: PointCloudSuperTile) {
		const pointCloudSuperTiles = this.state.pointCloudSuperTiles
        pointCloudSuperTiles.set(superTile.key(), superTile)
	}

	removeTileFromState(superTile: PointCloudSuperTile) {
        const pointCloudSuperTiles = this.state.pointCloudSuperTiles
        pointCloudSuperTiles.delete(superTile.key())
	}

	// TODO JOR THURSDAY
	// - register a ground plane layer with LayerManager

	// Construct a set of 2D planes, each of which approximates the ground plane within a tile.
	// This assumes that each ground plane is locally flat and normal to gravity.
	// This assumes that the ground planes in neighboring tiles are close enough that the discrete
	// jumps between them won't matter much.
	// ??????

	// RT 7/12
	// componentDidUpdate(oldProps: IGroundPlaneManagerProps) {
	// 	const oldPointCloudSuperTiles = oldProps.pointCloudSuperTiles
	// 	const newPointCloudSuperTiles = this.props.pointCloudSuperTiles
    //
	// 	if ( oldPointCloudSuperTiles !== newPointCloudSuperTiles ) {
	// 		const { added, removed } = getOrderedMapValueDiff( oldPointCloudSuperTiles, newPointCloudSuperTiles )
    //
	// 		added && added.forEach(tile => this.loadTileGroundPlanes(tile as PointCloudSuperTile))
	// 		removed && removed.forEach(tile => this.unloadTileGroundPlanes(tile as PointCloudSuperTile))
	// 	}
	// }

	private loadTileGroundPlanes(superTile: PointCloudSuperTile): void {
		if (!this.estimateGroundPlane) return
		if (!superTile.pointCloud) return
		if (this.superTileGroundPlanes.has(superTile.key())) return

		const groundPlanes: THREE.Mesh[] = []

		superTile.tiles.forEach(tile => {
			const y = tile.groundAverageYIndex()
			if (!isNull(y)) {
				const xSize = tile.index.scale.xSize
				const zSize = tile.index.scale.zSize

				const geometry = new THREE.PlaneGeometry(
					xSize * this.tileGroundPlaneScale,
					zSize * this.tileGroundPlaneScale
				)
				geometry.rotateX(-Math.PI / 2)

				const material = new THREE.MeshNormalMaterial({ wireframe: true })
				const plane = new THREE.Mesh(geometry, material)
				const origin = this.props.utmCoordinateSystem.utmVectorToThreeJs(tile.index.origin)
				plane.position.x = origin.x + xSize / 2
				plane.position.y = y
				plane.position.z = origin.z - zSize / 2
				plane.visible = false // not visible at first, visible only when needed

				groundPlanes.push(plane)
			}
		})

		this.superTileGroundPlanes = this.superTileGroundPlanes.set(superTile.key(), groundPlanes)
		this.allGroundPlanes = this.allGroundPlanes.concat(groundPlanes)
		groundPlanes.forEach(plane => new AnnotatedSceneActions().addObjectToScene(plane))
	}

	private unloadTileGroundPlanes(superTile: PointCloudSuperTile): void {
		if (!this.superTileGroundPlanes.has(superTile.key())) return

		const groundPlanes = this.superTileGroundPlanes.get(superTile.key())!

		this.superTileGroundPlanes = this.superTileGroundPlanes.remove(superTile.key())
		this.allGroundPlanes = lodash.flatten(this.superTileGroundPlanes.valueSeq().toArray())
		groundPlanes.forEach(plane => new AnnotatedSceneActions().removeObjectFromScene(plane))
	}

	intersectWithGround(): THREE.Intersection[] {
		let intersections: THREE.Intersection[] = []

		if (!this.props.camera || !this.props.mousePosition || !this.props.areaOfInterestManager)
			return intersections

		// TODO JOE we need this.props.mousePosition
		this.raycaster.setFromCamera(
			mousePositionToGLSpace( this.props.mousePosition, this.props.rendererSize! ),
			this.props.camera
		)

		if (this.estimateGroundPlane || !this.pointCloudTileCount()) {
			if (this.allGroundPlanes.length)
				intersections = this.raycaster.intersectObjects(this.allGroundPlanes)
			else
				intersections = this.raycaster.intersectObject(this.props.areaOfInterestManager.plane)
		} else {
			intersections = this.raycaster.intersectObjects(this.getPointClouds().valueSeq().toArray())
		}

		return intersections
	}

	getPointClouds(): OrderedMap<string, THREE.Points> {
		return this.state.pointCloudSuperTiles.map<THREE.Points>(superTile => {
			return (superTile as PointCloudSuperTile).pointCloud!
		}) as OrderedMap<string, THREE.Points>
	}

	pointCloudTileCount() {
		let count = 0

		if (this.state.pointCloudSuperTiles) return count

		this.state.pointCloudSuperTiles!.forEach( superTile => {
			count += superTile!.objectCount
		})

		return count
	}

	makePlanesVisible(areVisible: boolean) {
		for (const plane of this.allGroundPlanes) {
			plane.visible = areVisible
		}
	}

	componentDidUpdate(oldProps) {
		if (oldProps.isAddMarkerMode !== this.props.isAddMarkerMode) {
			if (this.props.isAddMarkerMode)
				this.makePlanesVisible(true)
			else
				this.makePlanesVisible(false)
		}
	}

	render() {
		return null
	}

}
