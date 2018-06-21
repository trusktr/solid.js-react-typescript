

import * as React from "react"
import * as THREE from "three";
import {PointCloudTileManager} from "@/annotator-entry-ui/tile/PointCloudTileManager";
import {SceneManager} from "@/annotator-z-hydra-shared/src/services/SceneManager";
import Logger from "@/util/log";
import config from "@/config";
import LayerManager, {Layer} from "@/annotator-z-hydra-shared/src/services/LayerManager";

const log = Logger(__filename)

export interface PointCloudManagerProps {
  sceneManager: SceneManager
  pointCloudTileManager: PointCloudTileManager
  layerManager: LayerManager
}

export interface PointCloudManagerState {
  pointCloudBoundingBox: THREE.BoxHelper | null // just a box drawn around the point cloud
  shouldDrawBoundingBox: boolean
  pointCloudBboxColor: THREE.Color
}

export default class PointCloudManager extends React.Component<PointCloudManagerProps, PointCloudManagerState> {

  constructor(props) {
    super(props)

    this.state = {
      pointCloudBoundingBox: null,
      shouldDrawBoundingBox: !!config.get('annotator.draw_bounding_box'),
      pointCloudBboxColor: new THREE.Color(0xff0000),
    }

  }

  private unloadPointCloudData(): void {
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
  private updatePointCloudBoundingBox(): void {
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

  // Do some house keeping after loading a point cloud, such as drawing decorations
  // and centering the stage and the camera on the point cloud.
  // BOTH
  private pointCloudLoadedSideEffects(resetCamera: boolean = true): void {
    this.props.layerManager.setLayerVisibility([Layer.POINT_CLOUD.toString()])

    this.updatePointCloudBoundingBox()
    this.props.sceneManager.setCompassRoseByPointCloud()
    this.props.sceneManager.setStageByPointCloud(resetCamera)
    this.props.sceneManager.renderScene()
  }





  render() {
    return null
  }
}

