/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

 // TODO JOE register a ground plane layer with LayerManager

import * as React from "react"
import * as THREE from 'three'
import * as lodash from 'lodash'
import {typedConnect} from "@/mapper-annotated-scene/src/styles/Themed";
import toProps from '@/util/toProps'
import {OrderedMap} from "immutable";
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
import LayerManager, {Layer} from "@/mapper-annotated-scene/src/services/LayerManager";
import {Events} from "@/mapper-annotated-scene/src/models/Events";

export interface GroundPlaneManagerProps {
	// pointCloudSuperTiles ?: OrderedMap<string, SuperTile>
	utmCoordinateSystem: UtmCoordinateSystem
	camera?: THREE.Camera
	mousePosition?: MousePosition
	areaOfInterestManager: AreaOfInterestManager | null
	channel: EventEmitter
	rendererSize?: Electron.Size
	isAddMarkerMode?: boolean
	layerManager: LayerManager
}

export interface GroundPlaneManagerState {
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
class GroundPlaneManager extends React.Component<GroundPlaneManagerProps, GroundPlaneManagerState> {
	allGroundPlanes: THREE.Mesh[] // ground planes for all tiles, denormalized from superTileGroundPlanes
	private raycaster: THREE.Raycaster
	private superTileGroundPlanes: Map<string, THREE.Mesh[]> // super tile key -> all of the super tile's ground planes
	private estimateGroundPlane: boolean
	private tileGroundPlaneScale: number // ground planes don't meet at the edges: scale them up a bit so they are more likely to intersect a raycaster
	private groundPlaneGroup: THREE.Group

	constructor(props: GroundPlaneManagerProps) {
		super(props)

		this.groundPlaneGroup = new THREE.Group()

		this.raycaster = new THREE.Raycaster()
		this.raycaster.params.Points!.threshold = 0.1

		this.estimateGroundPlane = !!config['annotator.add_points_to_estimated_ground_plane']

		this.allGroundPlanes = []
		this.superTileGroundPlanes = new Map()

		this.tileGroundPlaneScale = 1.05

		this.state = {
            pointCloudSuperTiles: OrderedMap<string, SuperTile>()
		}

        // Setup listeners on add/remove point cloud tiles
        this.props.channel.on(Events.SUPER_TILE_CREATED, (superTile:SuperTile) => {
			if (!( superTile instanceof PointCloudSuperTile )) return
			if (!superTile.pointCloud) return

        	this.addTileToState(superTile)
        	this.loadTileGroundPlanes(superTile)
		})

        this.props.channel.on(Events.SUPER_TILE_REMOVED, (superTile:SuperTile) => {
			if (!( superTile instanceof PointCloudSuperTile )) return
			if (!superTile.pointCloud) return

        	this.removeTileFromState(superTile)
        	this.unloadTileGroundPlanes(superTile)
		})
	}

	addTileToState(superTile: PointCloudSuperTile) {
		const pointCloudSuperTiles = this.state.pointCloudSuperTiles
        pointCloudSuperTiles.set(superTile.key(), superTile)
	}

	removeTileFromState(superTile: PointCloudSuperTile) {
        const pointCloudSuperTiles = this.state.pointCloudSuperTiles
        pointCloudSuperTiles.delete(superTile.key())
	}

	// Construct a set of 2D planes, each of which approximates the ground plane within a tile.
	// This assumes that each ground plane is locally flat and normal to gravity.
	// This assumes that the ground planes in neighboring tiles are close enough that the discrete
	// jumps between them won't matter much.
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

				const material = new THREE.MeshNormalMaterial({ wireframe: true, transparent: true, opacity: 0.15 })
				const plane = new THREE.Mesh(geometry, material)
				const origin = this.props.utmCoordinateSystem.utmVectorToThreeJs(tile.index.origin)
				plane.position.x = origin.x + xSize / 2
				plane.position.y = y
				plane.position.z = origin.z - zSize / 2
				plane.visible = false // not visible at first, visible only when needed

				groundPlanes.push(plane)
			}
		})

		this.superTileGroundPlanes.set(superTile.key(), groundPlanes)
		this.allGroundPlanes = this.allGroundPlanes.concat(groundPlanes)
		groundPlanes.forEach(plane => this.groundPlaneGroup.add(plane))
	}

	private unloadTileGroundPlanes(superTile: PointCloudSuperTile): void {
		if (!this.superTileGroundPlanes.has(superTile.key())) return

		const groundPlanes = this.superTileGroundPlanes.get(superTile.key())!

		this.superTileGroundPlanes.delete(superTile.key())
		this.allGroundPlanes = lodash.flatten( Array.from( this.superTileGroundPlanes.values() ) )
		groundPlanes.forEach(plane => this.groundPlaneGroup.remove(plane))
	}

	intersectWithGround( pointInGLSpace?: THREE.Vector2 ): THREE.Intersection[] {
		let intersections: THREE.Intersection[] = []

		if (!this.props.camera || !this.props.mousePosition || !this.props.areaOfInterestManager)
			return intersections

		this.raycaster.setFromCamera(
			pointInGLSpace || mousePositionToGLSpace( this.props.mousePosition, this.props.rendererSize! ),
			this.props.camera
		)

		if (this.estimateGroundPlane || !this.pointCloudTileCount()) {
			if (this.allGroundPlanes.length) {

				let toggleVisibility = false
				if (!this.allGroundPlanes[0].visible) toggleVisibility = true

				if (toggleVisibility) {
					this.makePlanesVisible( true )
					this.allGroundPlanes.forEach(m => m.updateMatrixWorld(true))
				}

				intersections = this.raycaster.intersectObjects(this.allGroundPlanes)

				if (toggleVisibility)
					this.makePlanesVisible( false )
			}

			if (!intersections.length)
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

	// This is similar to showGroundPlaneLayer, but used at
	// different times on purpose.
	makePlanesVisible(areVisible: boolean) {
		for (const plane of this.allGroundPlanes) {
			plane.visible = areVisible
		}
		this.props.channel.emit(Events.SCENE_SHOULD_RENDER)
	}

	showGroundPlaneLayer = ( show: boolean ): void => {
		this.groundPlaneGroup.visible = show
	}

	componentDidUpdate(oldProps) {
		if (oldProps.isAddMarkerMode !== this.props.isAddMarkerMode)
			this.makePlanesVisible(!!this.props.isAddMarkerMode)
	}

	componentDidMount() {
		new AnnotatedSceneActions().addObjectToScene( this.groundPlaneGroup )
		this.props.layerManager.addLayer(Layer.GROUND_PLANES, this.showGroundPlaneLayer)
	}

	componentWillUnmount() {
		this.props.layerManager.removeLayer( 'Ground Planes' )
		new AnnotatedSceneActions().removeObjectFromScene( this.groundPlaneGroup )
	}

	render(): JSX.Element | null {
		return null
	}
}
