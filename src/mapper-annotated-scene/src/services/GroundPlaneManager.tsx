import * as React from "react"
import * as THREE from 'three'
import {typedConnect} from "@/mapper-annotated-scene/src/styles/Themed";
import toProps from '@/util/toProps'
import getOrderedMapValueDiff from '../util/getOrderedMapValueDiff'
import {OrderedMap, Map} from "immutable";
import {SuperTile} from "@/mapper-annotated-scene/tile/SuperTile";
import {PointCloudSuperTile} from "@/mapper-annotated-scene/tile/PointCloudSuperTile";
import config from '@/config'

export interface IGroundPlaneManagerProps {
  pointCloudSuperTiles ?: OrderedMap<string, SuperTile>
}

export interface IGroundPlaneManagerState {

}

@typedConnect(toProps(
	'pointCloudSuperTiles',
))
export default
class GroundPlaneManager extends React.Component<IGroundPlaneManagerProps, IGroundPlaneManagerState> {
	private raycaster: THREE.Raycaster
	private allGroundPlanes: THREE.Mesh[] // ground planes for all tiles, denormalized from superTileGroundPlanes
	private superTileGroundPlanes: Map<string, THREE.Mesh[]> // super tile key -> all of the super tile's ground planes
	private estimateGroundPlane: boolean

	constructor(props) {
		super(props)

		this.raycaster = new THREE.Raycaster
		this.raycaster.params.Points!.threshold = 0.1

		this.estimateGroundPlane = !!config['annotator.add_points_to_estimated_ground_plane']

		this.allGroundPlanes = []
		this.superTileGroundPlanes = Map()
	}

	// TODO JOR THURSDAY
	// - register a ground plane layer with LayerManager

	// Construct a set of 2D planes, each of which approximates the ground plane within a tile.
	// This assumes that each ground plane is locally flat and normal to gravity.
	// This assumes that the ground planes in neighboring tiles are close enough that the discrete
	// jumps between them won't matter much.
	// ??????

	componentDidUpdate(oldProps: IGroundPlaneManagerProps) {
		const oldPointCloudSuperTiles = oldProps.pointCloudSuperTiles
		const newPointCloudSuperTiles = this.props.pointCloudSuperTiles

		if ( oldPointCloudSuperTiles !== newPointCloudSuperTiles ) {
			const { added, removed } = getOrderedMapValueDiff( oldPointCloudSuperTiles, newPointCloudSuperTiles )

			added && added.forEach(tile => this.loadTileGroundPlanes(tile))
			removed && removed.forEach(tile => this.unloadTileGroundPlanes(tile))
		}
	}

	getSuperTileDiff( oldSuperTiles, newSuperTiles ) {
		let added
		let removed

		if (!oldSuperTiles && newSuperTiles) {
			added = newSuperTiles
		}
		else if (oldSuperTiles && !newSuperTiles) {
			removed = oldSuperTiles
		}
		else {
			added = newSuperTiles.filter(superTile => !oldSuperTiles.includes(superTile))
			removed = oldSuperTiles.filter(superTile => !newSuperTiles.includes(superTile))
		}

		return { added, removed }
	}

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
					xSize * this.settings.tileGroundPlaneScale,
					zSize * this.settings.tileGroundPlaneScale
				)
				geometry.rotateX(-Math.PI / 2)

				const material = new THREE.ShadowMaterial()
				const plane = new THREE.Mesh(geometry, material)
				const origin = this.utmCoordinateSystem.utmVectorToThreeJs(tile.index.origin)
				plane.position.x = origin.x + xSize / 2
				plane.position.y = y
				plane.position.z = origin.z - zSize / 2

				groundPlanes.push(plane)
			}
		})

		this.superTileGroundPlanes = this.superTileGroundPlanes.set(superTile.key(), groundPlanes)
		this.allGroundPlanes = this.allGroundPlanes.concat(groundPlanes)
		groundPlanes.forEach(plane => this.scene.add(plane))
	}

	private unloadTileGroundPlanes(superTile: PointCloudSuperTile): void {
		if (!this.superTileGroundPlanes.has(superTile.key())) return

		const groundPlanes = this.superTileGroundPlanes.get(superTile.key())!

		this.superTileGroundPlanes = this.superTileGroundPlanes.remove(superTile.key())
		this.allGroundPlanes = lodash.flatten(this.superTileGroundPlanes.valueSeq().toArray())
		groundPlanes.forEach(plane => this.scene.remove(plane))
	}

    // TODO JOE ground tiles can be in their own tile layer, and they are
    // added/removed based load/unload events from point cloud tile layer
	private intersectWithGround(): THREE.Intersection[] {
		let intersections: THREE.Intersection[]

		// TODO JOE we need this.props.mousePosition
		this.raycaster.setFromCamera(this.props.mousePosition, this.props.camera)

		if (this.estimateGroundPlane || !this.pointCloudTileCount()) {
			if (this.allGroundPlanes.length)
				intersections = this.raycaster.intersectObjects(this.allGroundPlanes)
			else
				intersections = this.raycaster.intersectObject(this.plane)
		} else {
			intersections = this.raycaster.intersectObjects(this.pointCloudTileManager.getPointClouds())
		}

		return intersections
	}

	pointCloudTileCount() {
		let count = 0

		if (!this.props.pointCloudSuperTiles) return count

		this.props.pointCloudSuperTiles.forEach( superTile => {
			count += superTile.objectCount()
		})

		return count
	}

}
