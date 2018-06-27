import * as React from "react"
import {getValue} from "typeguard";
import * as THREE from "three";
import {createStructuredSelector} from "reselect";
import {typedConnect} from "@/annotator-z-hydra-shared/src/styles/Themed";
import RoadEditorState from "@/annotator-z-hydra-shared/src/store/state/RoadNetworkEditorState";
import StatusWindowState from "@/annotator-z-hydra-shared/src/models/StatusWindowState";
import StatusWindow from "@/annotator-z-hydra-shared/components/StatusWindow";
import Logger from "@/util/log";
import PointCloudManager from "@/annotator-z-hydra-shared/src/services/PointCloudManager";
import {SceneManager} from "@/annotator-z-hydra-shared/src/services/SceneManager";
import {Layer, default as LayerManager} from "@/annotator-z-hydra-shared/src/services/LayerManager";

const log = Logger(__filename)

export interface CameraState {
  lastCameraCenterPoint: THREE.Vector3 | null // point in three.js coordinates where camera center line has recently intersected ground plane
}

export interface IAnnotatedSceneControllerProps {
  statusWindowState ?: StatusWindowState
  onPointOfInterestCall: any
}

export interface IAnnotatedSceneControllerState {
  cameraState: CameraState // isolating camera state incase we decide to migrate it to a Camera Manager down the road
  statusWindow: StatusWindow | null
  pointCloudManager: PointCloudManager | null
  sceneManager: SceneManager | null
  layerManager: LayerManager | null
}


@typedConnect(createStructuredSelector({
  statusWindowState: (state) => state.get(RoadEditorState.Key).statusWindowState,
}))
export default class AnnotatedSceneController extends React.Component<IAnnotatedSceneControllerProps, IAnnotatedSceneControllerState> {

	constructor(props) {
		super(props)

    this.state = {
      cameraState: {
        lastCameraCenterPoint: null,
      },
      statusWindow: null,
      pointCloudManager: null,
      sceneManager: null,
      layerManager: null,
    }
	}

  getStatusWindow = (statusWindow:StatusWindow) => {
    this.setState({statusWindow})
  }

  getPointCloudManager = (pointCloudManager:PointCloudManager) => {
    this.setState({pointCloudManager})
  }

  getSceneManager = (sceneManager:SceneManager) => {
	  this.setState({sceneManager})
  }

  getLayerManager = (layerManager:LayerManager) => {
    this.setState({layerManager})
  }

	render() {
		return (
		  <React.Fragment>
        <StatusWindow ref={this.getStatusWindow} utmCoordinateSystem={}/>
        <PointCloudManager ref={this.getPointCloudManager} sceneManager={} pointCloudTileManager={} layerManager={} handleTileManagerLoadError={} getCurrentPointOfInterest={this.currentPointOfInterest}/>
        <SceneManager ref={this.getSceneManager} width={1000} height={1000}/>
        <LayerManager ref={this.getLayerManager} sceneManager={this.state.sceneManager!} annotationManager={} pointCloudTileManager={} pointCloudManager={} imageManager={} onRerender={}/>
      </React.Fragment>
    )
	}

  /**
   * Set the point cloud as the center of the visible world.
   */
  // Currently this function is only used on keyboard shortcuts
  // @TODO long term move orbit controls to Camera Manger
  focusOnPointCloud(): void {
    const center = this.state.pointCloudTileManager.centerPoint()
    if(!center) {
      log.warn('point cloud has not been initialized')
    }

    this.state.sceneManager!.setOrbitControlsTargetPoint(center)
    this.displayCameraInfo()
  }

  // @TODO long term move orbit controls to Camera Manger
  // Display some info in the UI about where the camera is pointed.
  private displayCameraInfo = (): void => {

    if( !getValue( () => this.props.statusWindowState && this.props.statusWindowState.enabled, false ) ) return

    const currentPoint = this.currentPointOfInterest()
    if (currentPoint) {
      const oldPoint = this.state.cameraState.lastCameraCenterPoint
      const newPoint = currentPoint.clone().round()
      const samePoint = oldPoint && oldPoint.x === newPoint.x && oldPoint.y === newPoint.y && oldPoint.z === newPoint.z
      if (!samePoint) {
        const cameraState = this.state.cameraState
        cameraState.lastCameraCenterPoint = newPoint
        this.setState({cameraState})

        const utm = this.state.utmCoordinateSystem.threeJsToUtm(newPoint)
        this.state.statusWindow!.updateCurrentLocationStatusMessage(utm)
      }
    }
  }


  // Find the point in the scene that is most interesting to a human user.
  currentPointOfInterest(): THREE.Vector3 | null {
    // @TODO JOE/RYAN - apps must pass a function as a prop to AnnotatedSceneController
    return this.props.onPointOfInterestCall()
  }

  activateReadOnlyViewingMode() {
    this.state.layerManager!.setLayerVisibility([Layer.POINT_CLOUD.toString(), Layer.ANNOTATIONS.toString()], true)

    // @TODO originally this function all called 'this.gui.close()' -- look into adding this funtionality
    this.state.sceneManager!.removeAxisFromScene()
    this.state.sceneManager!.removeCompassFromScene()
    this.state.sceneManager!.hideGridVisibility()

    // @TODO annotatorOrbitControls.enabled = false
    // @TODO flyThroughOrbitControls.enabled = true

    this.state.pointCloudManager!.hidePointCloudBoundingBox()
  }

}
