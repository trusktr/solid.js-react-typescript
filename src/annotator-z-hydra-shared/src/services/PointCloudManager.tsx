import * as React from "react"
import * as THREE from "three";
import {PointCloudTileManager} from "@/annotator-entry-ui/tile/PointCloudTileManager";
import {SceneManager} from "@/annotator-z-hydra-shared/src/services/SceneManager";
import Logger from "@/util/log";
import config from "@/config";
import LayerManager, {Layer} from "@/annotator-z-hydra-shared/src/services/LayerManager";
import {RangeSearch} from "@/annotator-entry-ui/model/RangeSearch";
import {CoordinateFrameType} from "@/annotator-entry-ui/geometry/CoordinateFrame";
import {isTupleOfNumbers} from "@/util/Validation";
import RoadEditorState from "@/annotator-z-hydra-shared/src/store/state/RoadNetworkEditorState";
import {typedConnect} from "@/annotator-z-hydra-shared/src/styles/Themed";
import {createStructuredSelector} from "reselect";

const log = Logger(__filename)

export interface PointCloudManagerProps {
  sceneManager: SceneManager
  pointCloudTileManager: PointCloudTileManager
  layerManager: LayerManager
  handleTileManagerLoadError: (err: Error) => void
  isPointCloudVisible ?: boolean
  getCurrentPointOfInterest ?: () => THREE.Vector3 | null
}

export interface PointCloudManagerState {
  pointCloudBoundingBox: THREE.BoxHelper | null // just a box drawn around the point cloud
  shouldDrawBoundingBox: boolean
  pointCloudBboxColor: THREE.Color
  aoiState: AoiState
}

// Area of Interest: where to load point clouds
interface AoiState {
  enabled: boolean // enable auto-loading points around the AOI
  focalPoint: THREE.Vector3 | null, // cached value for the center of the AOI
  boundingBoxes: THREE.BoxHelper[] // boxes drawn around the current area of interest
  currentHeading: THREE.Vector3 | null // in fly-through mode: where the vehicle is heading
  bBoxColor: THREE.Color
  fullSize: THREE.Vector3 // the dimensions of an AOI box, which will be constructed around a center point
  halfSize: THREE.Vector3 // half the dimensions of an AOI box
}

@typedConnect(createStructuredSelector({
  isPointCloudVisible: (state) => state.get(RoadEditorState.Key).isPointCloudVisible,
}))
export default class PointCloudManager extends React.Component<PointCloudManagerProps, PointCloudManagerState> {

  constructor(props) {
    super(props)

    this.state = {
      pointCloudBoundingBox: null,
      shouldDrawBoundingBox: !!config.get('annotator.draw_bounding_box'),
      pointCloudBboxColor: new THREE.Color(0xff0000),
      aoiState: {
        enabled: !!config.get('annotator.area_of_interest.enable'),
        focalPoint: null,
        boundingBoxes: [],
        currentHeading: null,
        bBoxColor: new THREE.Color(0x00ff00),

        fullSize: new THREE.Vector3(30, 30, 30),
        halfSize: new THREE.Vector3(15, 15, 15),
      }
    }

    const aoiSize: [number, number, number] = config.get('annotator.area_of_interest.size')
    if (isTupleOfNumbers(aoiSize, 3)) {
      this.state.aoiState.fullSize = new THREE.Vector3().fromArray(aoiSize)
      this.state.aoiState.halfSize = this.state.aoiState.fullSize.clone().divideScalar(2)
    } else if (aoiSize) {
      log.warn(`invalid annotator.area_of_interest.size config: ${aoiSize}`)
    }

    // used to be called after the CarModel was setup
    this.loadUserData()

  }

  // only called as a keyboard shortcut
  unloadPointCloudData(): void {
    if (this.props.pointCloudTileManager.unloadAllTiles()) {
      if (this.state.pointCloudBoundingBox)
        this.props.sceneManager.removeObjectToScene(this.state.pointCloudBoundingBox)
    } else {
      log.warn('unloadPointCloudData failed')
    }
  }

  /**
   * 	Draw a box around the data. Useful for debugging.
   */
  updatePointCloudBoundingBox(): void {
    if (this.state.shouldDrawBoundingBox) {
      if (this.state.pointCloudBoundingBox) {
        this.props.sceneManager.removeObjectToScene(this.state.pointCloudBoundingBox)
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
        this.setState({pointCloudBoundingBox: pointCloudBoundingBox})
        this.props.sceneManager.addObjectToScene(pointCloudBoundingBox)
      }
    }
  }

  getPointCloudBoundingBox(): THREE.BoxHelper | null {
    return this.state.pointCloudBoundingBox
  }

  // Do some house keeping after loading a point cloud, such as drawing decorations
  // and centering the stage and the camera on the point cloud.
  private pointCloudLoadedSideEffects(resetCamera: boolean = true): void {
    this.props.layerManager.setLayerVisibility([Layer.POINT_CLOUD.toString()])

    this.updatePointCloudBoundingBox()
    this.setCompassRoseByPointCloud()
    this.props.sceneManager.setStageByPointCloud(resetCamera)
    this.props.sceneManager.renderScene()
  }

  // Load tiles within a bounding box and add them to the scene.
  private loadPointCloudDataFromMapServer(searches: RangeSearch[], loadAllPoints: boolean = false, resetCamera: boolean = true): Promise<void> {
    return this.props.pointCloudTileManager.loadFromMapServer(searches, CoordinateFrameType.STANDARD, loadAllPoints)
      .then(loaded => {if (loaded) this.pointCloudLoadedSideEffects(resetCamera)})
      .catch(err => this.props.handleTileManagerLoadError(err))
  }

  // Load tiles within a bounding box and add them to the scene.
  private loadPointCloudDataFromConfigBoundingBox(bbox: number[]): Promise<void> {
    if (!isTupleOfNumbers(bbox, 6)) {
      this.props.handleTileManagerLoadError(Error('invalid point cloud bounding box config'))
      return Promise.resolve()
    } else {
      const p1 = new THREE.Vector3(bbox[0], bbox[1], bbox[2])
      const p2 = new THREE.Vector3(bbox[3], bbox[4], bbox[5])
      return this.loadPointCloudDataFromMapServer([{minPoint: p1, maxPoint: p2}])
    }
  }




  /**
   * 	Load up any data which configuration has asked for on start-up.
   */
  private loadUserData(): Promise<void> {
    const annotationsPath = config.get('startup.annotations_path')
    let annotationsResult: Promise<void>
    if (annotationsPath) {
      annotationsResult = this.loadAnnotations(annotationsPath)
    } else {
      annotationsResult = Promise.resolve()
    }

    const pointCloudBbox: [number, number, number, number, number, number] = config.get('startup.point_cloud_bounding_box')
    let pointCloudResult: Promise<void>
    if (pointCloudBbox) {
      pointCloudResult = annotationsResult
        .then(() => {
          log.info('loading pre-configured bounding box ' + pointCloudBbox)
          return this.loadPointCloudDataFromConfigBoundingBox(pointCloudBbox)
        })
    } else {
      pointCloudResult = annotationsResult
    }

    if (config.get('startup.point_cloud_directory'))
      log.warn('config option startup.point_cloud_directory has been removed.')
    if (config.get('live_mode.trajectory_path'))
      log.warn('config option live_mode.trajectory_path has been renamed to fly_through.trajectory_path')

    return pointCloudResult
  }

  /**
   * 	Display the compass rose just outside the bounding box of the point cloud.
   */
  setCompassRoseByPointCloud(): void {
    const boundingBox = this.props.pointCloudTileManager.getLoadedObjectsBoundingBox()
    if (!boundingBox) {
      log.error("Attempting to set compassRose, unable to find bounding box")
      return
    }

    // Find the center of one of the sides of the bounding box. This is the side that is
    // considered to be North given the current implementation of UtmInterface.utmToThreeJs().
    const topPoint = boundingBox.getCenter().setZ(boundingBox.min.z)
    const boundingBoxHeight = Math.abs(boundingBox.max.z - boundingBox.min.z)
    const zOffset = boundingBoxHeight / 10

    this.props.sceneManager.updateCompassRosePosition(topPoint.x, topPoint.y, topPoint.z - zOffset)
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

  updateAoiHeading(rotationThreeJs: THREE.Quaternion | null): void {
    if (this.state.aoiState.enabled) {
      const newHeading = rotationThreeJs
        ? new THREE.Vector3(-1, 0, 0).applyQuaternion(rotationThreeJs)
        : null
      const aoiState = this.state.aoiState
      aoiState.currentHeading = newHeading
      this.setState({aoiState})
    }
  }


  // Set the area of interest for loading point clouds.
  updatePointCloudAoi(): void {
    if (!this.state.aoiState.enabled) return
    // The only use of Control at the moment is to enable model rotation in OrbitControls. Updating AOI is useful
    // mainly while panning across the model. Disable it during rotation for better rendering performance.
    if (this.uiState.isControlKeyPressed) return
    // Don't update AOI and load tiles if the point cloud is not visible.
    if (!this.props.isPointCloudVisible) return
    // TileManager will only handle one IO request at time. Pause AOI updates if it is busy.
    if (this.props.pointCloudTileManager.isLoadingTiles) return

    const currentPoint = this.props.getCurrentPointOfInterest()
    if (currentPoint) {
      const oldPoint = this.state.aoiState.focalPoint
      const newPoint = currentPoint.clone().round()
      const samePoint = oldPoint && oldPoint.x === newPoint.x && oldPoint.y === newPoint.y && oldPoint.z === newPoint.z
      if (!samePoint) {
        const aoiState = this.state.aoiState
        aoiState.focalPoint = newPoint
        this.setState({aoiState})
        this.updatePointCloudAoiBoundingBox(aoiState.focalPoint)
      }
    } else {
      if (this.state.aoiState.focalPoint !== null) {
        const aoiState = this.state.aoiState
        aoiState.focalPoint = null
        this.setState({aoiState})
        this.updatePointCloudAoiBoundingBox(aoiState.focalPoint)
      }
    }
  }

  // Create a bounding box around the current AOI and optionally display it.
  // Then load the points in and around the AOI. If we have a current heading,
  // extend the AOI with another bounding box in the direction of motion.
  private updatePointCloudAoiBoundingBox(focalPoint: THREE.Vector3 | null): void {
    if (this.state.shouldDrawBoundingBox) {
      const aoiState = this.state.aoiState
      aoiState.boundingBoxes.forEach(bbox => this.props.sceneManager.removeObjectToScene(bbox))
      aoiState.boundingBoxes = []
      this.setState({aoiState})
    }

    if (focalPoint) {
      const threeJsSearches: RangeSearch[] = [{
        minPoint: focalPoint.clone().sub(this.state.aoiState.halfSize),
        maxPoint: focalPoint.clone().add(this.state.aoiState.halfSize),
      }]

      // What could be better than one AOI, but two? Add another one so we see more of what's in front.
      if (this.state.aoiState.currentHeading) {
        const extendedFocalPoint = focalPoint.clone()
          .add(this.state.aoiState.fullSize.clone().multiply(this.state.aoiState.currentHeading))
        threeJsSearches.push({
          minPoint: extendedFocalPoint.clone().sub(this.state.aoiState.halfSize),
          maxPoint: extendedFocalPoint.clone().add(this.state.aoiState.halfSize),
        })
      }

      if (this.state.shouldDrawBoundingBox) {
        threeJsSearches.forEach(search => {
          const geom = new THREE.Geometry()
          geom.vertices.push(search.minPoint, search.maxPoint)
          const bbox = new THREE.BoxHelper(new THREE.Points(geom), this.state.aoiState.bBoxColor)
          this.state.aoiState.boundingBoxes.push(bbox)
          this.props.sceneManager.addObjectToScene(bbox)
        })
      }

      const utmSearches = threeJsSearches.map(threeJs => {
        return {
          minPoint: this.utmCoordinateSystem.threeJsToUtm(threeJs.minPoint),
          maxPoint: this.utmCoordinateSystem.threeJsToUtm(threeJs.maxPoint),
        }
      })

      this.loadPointCloudDataFromMapServer(utmSearches, true, false)
        .catch(err => {log.warn(err.message)})

      if (this.settings.enableAnnotationTileManager)
        this.loadAnnotationDataFromMapServer(utmSearches, true)
          .catch(err => {log.warn(err.message)})
    }
  }

  render() {
    return null
  }
}

