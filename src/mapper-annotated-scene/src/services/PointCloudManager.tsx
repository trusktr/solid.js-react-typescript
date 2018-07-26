/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as React from "react"
import * as THREE from "three"
import {PointCloudTileManager} from "@/mapper-annotated-scene/tile/PointCloudTileManager"
import {SceneManager} from "@/mapper-annotated-scene/src/services/SceneManager"
import Logger from "@/util/log"
import config from "@/config"
import LayerManager, {Layer} from "@/mapper-annotated-scene/src/services/LayerManager"
import {RangeSearch} from "@/mapper-annotated-scene/tile-model/RangeSearch"
import {CoordinateFrameType} from "@/mapper-annotated-scene/geometry/CoordinateFrame"
import {isTupleOfNumbers} from "@/util/Validation"
import {typedConnect} from "@/mapper-annotated-scene/src/styles/Themed"
import toProps from '@/util/toProps'
import AnnotatedSceneActions from "../store/actions/AnnotatedSceneActions"
import {UtmCoordinateSystem} from "@/mapper-annotated-scene/UtmCoordinateSystem"
import EventEmitter from 'events'
import {Events} from "@/mapper-annotated-scene/src/models/Events";
import {PointCloudSuperTile} from "@/mapper-annotated-scene/tile/PointCloudSuperTile";

const log = Logger(__filename)

export interface PointCloudManagerProps {

	// redux props
	areaOfInterest?: RangeSearch[]

  sceneManager: SceneManager
  pointCloudTileManager: PointCloudTileManager
  layerManager: LayerManager
  handleTileManagerLoadError: (msg: string, err: Error) => void // TODO JOE do we need this?
  utmCoordinateSystem: UtmCoordinateSystem
  isInitialOriginSet?: boolean
  channel: EventEmitter
}

export interface PointCloudManagerState {
  pointCloudBoundingBox: THREE.BoxHelper | null // just a box drawn around the point cloud
  shouldDrawBoundingBox: boolean
  pointCloudBboxColor: THREE.Color
}

@typedConnect(toProps(
	'areaOfInterest',
	'isInitialOriginSet',
))
export default class PointCloudManager extends React.Component<PointCloudManagerProps, PointCloudManagerState> {
	private pointCloudGroup = new THREE.Group()

  constructor(props: PointCloudManagerProps) {
    super(props)

    this.state = {
      pointCloudBoundingBox: null,
      shouldDrawBoundingBox: !!config['annotator.draw_bounding_box'],
      pointCloudBboxColor: new THREE.Color(0xff0000),
    }

	this.props.channel.on(Events.SUPER_TILE_CREATED, this.addSuperTile)
	this.props.channel.on(Events.SUPER_TILE_REMOVED, this.removeSuperTile)
  }

  private showPointCloud = ( show: boolean ): void => {

	  this.pointCloudGroup.visible = show

	  // TODO JOE we should have a more generic `setLayerVisible( 'decorations',
	  // true )` type of action, rather than the state knowing ahead of time
	  // which layers we'll have
    new AnnotatedSceneActions().setIsDecorationsVisible( show )

    const pointCloudBoundingBox = this.getPointCloudBoundingBox()
    if (pointCloudBoundingBox)
		pointCloudBoundingBox.visible = show
  }

	addSuperTile = (superTile: PointCloudSuperTile): void => {
		if (!( superTile instanceof PointCloudSuperTile )) return
		if (!superTile.pointCloud) return

		this.pointCloudGroup.add(superTile.pointCloud)
		this.props.channel.emit(Events.SCENE_SHOULD_RENDER)
	}

	removeSuperTile = (superTile: PointCloudSuperTile): void => {
		if (!( superTile instanceof PointCloudSuperTile )) return
		if (!superTile.pointCloud) return

		this.pointCloudGroup.remove(superTile.pointCloud)
		this.props.channel.emit(Events.SCENE_SHOULD_RENDER)
	}

  // only called as a keyboard shortcut
  unloadPointCloudData(): void {
    if (this.props.pointCloudTileManager.unloadAllTiles()) {
      if (this.state.pointCloudBoundingBox)
        new AnnotatedSceneActions().removeObjectFromScene(this.state.pointCloudBoundingBox)
    } else {
      log.warn('unloadPointCloudData failed')
    }
  }

	intersectWithPointCloud(raycaster: THREE.Raycaster): THREE.Intersection[] {
		return raycaster.intersectObjects(this.props.pointCloudTileManager.getPointClouds())
	}

  /**
   * 	Draw a box around the data. Useful for debugging.
   */
  updatePointCloudBoundingBox(): void {
    if (this.state.shouldDrawBoundingBox) {
      if (this.state.pointCloudBoundingBox) {
        new AnnotatedSceneActions().removeObjectFromScene(this.state.pointCloudBoundingBox)
        this.setState({
          pointCloudBoundingBox: null
        })
      }

      const bbox = this.props.pointCloudTileManager.getLoadedObjectsBoundingBox()
      if (bbox) {
        // BoxHelper wants an Object3D, but a three.js bounding box is a Box3, which is not an Object3D.
        // Maybe BoxHelper isn't so helpful after all. But guess what? It will take a Box3 anyway and
        // do the right thing with it.
        // tslint:disable-next-line:no-any
        const pointCloudBoundingBox = new THREE.BoxHelper(bbox as any, this.state.pointCloudBboxColor)
        pointCloudBoundingBox.name = 'pointCloudBoundingBox'
        this.setState({pointCloudBoundingBox: pointCloudBoundingBox})
        new AnnotatedSceneActions().addObjectToScene(pointCloudBoundingBox)
      }
    }
  }

  /**
   * Set the point cloud as the center of the visible world.
   */
  // Currently this function is only used on keyboard shortcuts
  // IDEA JOE long term move orbit controls to Camera Manger
  focusOnPointCloud(): void {
    const center = this.props.pointCloudTileManager.centerPoint()
    if(!center) {
      log.warn('point cloud has not been initialized')
      return
    }

    new AnnotatedSceneActions().setOrbitControlsTargetPoint(center)
  }

  getPointCloudBoundingBox(): THREE.BoxHelper | null {
    return this.state.pointCloudBoundingBox
  }

  // Do some house keeping after loading a point cloud, such as drawing decorations
  // and centering the stage and the camera on the point cloud.
  private pointCloudLoadedSideEffects(resetCamera: boolean = false): void {
    this.updatePointCloudBoundingBox()

    this.setCompassRoseByPointCloud()

    const focalPoint = this.props.pointCloudTileManager.centerPoint()
    if (focalPoint) {
        this.props.sceneManager.setStage(focalPoint.x, focalPoint.y, focalPoint.z, resetCamera)
    }

    this.props.sceneManager.renderScene()
  }

  // Load tiles within a bounding box and add them to the scene.
  private loadPointCloudDataFromMapServer(searches: RangeSearch[], loadAllPoints: boolean = false, resetCamera: boolean = false): Promise<void> {
      return this.props.pointCloudTileManager.loadFromMapServer(searches, CoordinateFrameType.STANDARD, loadAllPoints)
      .then(loaded => {if (loaded) this.pointCloudLoadedSideEffects(resetCamera)})
      .catch(err => this.props.handleTileManagerLoadError('Point Cloud', err))
  }

  // Load tiles within a bounding box and add them to the scene.
  loadPointCloudDataFromConfigBoundingBox(bbox: number[]): Promise<void> {
    if (!isTupleOfNumbers(bbox, 6)) {
      this.props.handleTileManagerLoadError('Point Cloud', Error('invalid point cloud bounding box config'))
      return Promise.reject(Error('invalid point cloud bounding box config'))
    } else {
      const p1 = new THREE.Vector3(bbox[0], bbox[1], bbox[2])
      const p2 = new THREE.Vector3(bbox[3], bbox[4], bbox[5])
      return this.loadPointCloudDataFromMapServer([{minPoint: p1, maxPoint: p2}])
    }
  }

  hidePointCloudBoundingBox() {
    const pointCloudBoundingBox = this.state.pointCloudBoundingBox
    if(pointCloudBoundingBox) {
      pointCloudBoundingBox.material.visible = false
      this.setState({pointCloudBoundingBox})
    } else {
      log.warn("Unable to hide point cloud bounding box for fly through")
    }
  }

	/**
	 * 	Display the compass rose just outside the bounding box of the point cloud.
	 */
	setCompassRoseByPointCloud(): void {
		const boundingBox = this.props.pointCloudTileManager.getLoadedObjectsBoundingBox()
		if (!boundingBox) return

		// Find the center of one of the sides of the bounding box. This is the side that is
		// considered to be North given the current implementation of UtmInterface.utmToThreeJs().
		const topPoint = boundingBox.getCenter().setZ(boundingBox.min.z)
		const boundingBoxHeight = Math.abs(boundingBox.max.z - boundingBox.min.z)
		const zOffset = boundingBoxHeight / 10

		new AnnotatedSceneActions().setCompassRosePosition(new THREE.Vector3(topPoint.x, topPoint.y, topPoint.z - zOffset))
	}

	componentDidMount() {
		new AnnotatedSceneActions().addObjectToScene( this.pointCloudGroup )
		this.props.layerManager.addLayer( Layer.POINT_CLOUD, this.showPointCloud )
	}

	componentWillUnmount() {
		this.props.layerManager.removeLayer( Layer.POINT_CLOUD )
		new AnnotatedSceneActions().removeObjectFromScene( this.pointCloudGroup )
	}

	render(): JSX.Element | null {
		return null
	}

	componentDidUpdate(previousProps: PointCloudManagerProps): void {
	    // IMPORTANT - Kiosk User Data must be loaded before this runs otherwise the UTM Offset is set based on AOI
        // Instead of Config Bounding Box (the reverse will cause the scene to flicker)
		// NOTE JOE isInitialOriginSet will be replaced with a dynamically changing origin
	    if (previousProps.areaOfInterest !== this.props.areaOfInterest && this.props.isInitialOriginSet) {
			if (this.props.areaOfInterest) {
				this.loadPointCloudDataFromMapServer( this.props.areaOfInterest, true, false )
					.catch(err => {log.warn(err.message)})
			}
		}
	}


}
