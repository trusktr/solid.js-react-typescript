import * as React from "react"
import LayerToggle from "@/annotator-z-hydra-shared/src/models/LayerToggle";
import * as lodash from "lodash";
import Logger from "@/util/log";
import {AnnotationSuperTile} from "@/annotator-entry-ui/tile/AnnotationSuperTile";
import {SuperTile} from "@/annotator-entry-ui/tile/SuperTile";
import {PointCloudSuperTile} from "@/annotator-entry-ui/tile/PointCloudSuperTile";
import {createStructuredSelector} from "reselect";
import {typedConnect} from "@/annotator-z-hydra-shared/src/styles/Themed";
import RoadEditorState from "@/annotator-z-hydra-shared/src/store/state/RoadNetworkEditorState";
import RoadNetworkEditorActions from "@/annotator-z-hydra-shared/src/store/actions/RoadNetworkEditorActions";
import {SceneManager} from "@/annotator-z-hydra-shared/src/services/SceneManager";
import {PointCloudTileManager} from "@/annotator-entry-ui/tile/PointCloudTileManager";
import {ImageScreen} from "@/annotator-entry-ui/image/ImageScreen";
import {ImageManager} from "@/annotator-entry-ui/image/ImageManager";
import PointCloudManager from "@/annotator-z-hydra-shared/src/services/PointCloudManager";

const log = Logger(__filename)


export enum Layer {
  POINT_CLOUD,
  IMAGE_SCREENS,
  ANNOTATIONS,
}

export interface LayerManagerProps {
  sceneManager: SceneManager
  pointCloudTileManager: PointCloudTileManager
  pointCloudManager: PointCloudManager
  imageManager: ImageManager
  onRerender: () => void
  isPointCloudVisible ?: boolean
}

export interface LayerManagerState {
  layerToggles: Map<string, LayerToggle>

}

@typedConnect(createStructuredSelector({
  isPointCloudVisible: (state) => state.get(RoadEditorState.Key).isPointCloudVisible,

}))
export default class LayerManager extends React.Component<LayerManagerProps, LayerManagerState> {

  constructor(props) {
    super(props)

    const pointCloudLayerToggle = new LayerToggle({show: this.showPointCloud, hide: this.hidePointCloud})

    const imageScreensLayerToggle = new LayerToggle({
      show: () => {new RoadNetworkEditorActions().setIsImageScreensVisible(false)},
      hide: () => {new RoadNetworkEditorActions().setIsImageScreensVisible(false)}
    })

    const annotationLayerToggle = new LayerToggle({
      show: () => {new RoadNetworkEditorActions().setIsAnnotationsVisible(true)},
      hide: () => {new RoadNetworkEditorActions().setIsAnnotationsVisible(false)}
    })

    this.state = {
      layerToggles: new Map([
        [Layer.POINT_CLOUD.toString(), pointCloudLayerToggle],
        [Layer.IMAGE_SCREENS.toString(), imageScreensLayerToggle],
        [Layer.ANNOTATIONS.toString(), annotationLayerToggle]
      ])
    }
  }

  addLayerToggle(layerName:string, toggle:LayerToggle) {
    const layerToggles = this.state.layerToggles
    layerToggles.set(layerName, toggle)
    this.setState({layerToggles})
  }

  // Ensure that some layers of the model are visible. Optionally hide the other layers.
  setLayerVisibility(layerKeysToShow: string[], hideOthers: boolean = false): void {
    let updated = 0

    layerKeysToShow.forEach(key => {
      if (this.state.layerToggles.has(key)) {
        // tslint:disable-next-line:no-unused-expression <-- work around a tslint bug
        this.state.layerToggles.get(key)!.show()
        updated++
      }
    else
        log.error(`missing visibility toggle for ${key}`)
    })

    if (hideOthers) {
      const hide = lodash.difference(Array.from(this.state.layerToggles.keys()), layerKeysToShow)
      hide.forEach(key => {
        if (this.state.layerToggles.has(key)) {
          // tslint:disable-next-line:no-unused-expression <-- work around a tslint bug
          this.state.layerToggles.get(key)!.hide()
          updated++
        }
        else
          log.error(`missing visibility toggle for ${key}`)
      })
    }

    if (updated)
      this.props.onRerender()
  }

  private hidePointCloud = (): boolean => {
    if (!this.props.isPointCloudVisible)
      return false
    new RoadNetworkEditorActions().setIsDecorationsVisible(false)
    this.props.pointCloudTileManager.getPointClouds().forEach(pc => this.props.sceneManager.removeObjectToScene(pc))

    const pointCloudBoundingBox = this.props.pointCloudManager.getPointCloudBoundingBox()
    if (pointCloudBoundingBox)
      this.props.sceneManager.removeObjectToScene(pointCloudBoundingBox)
    new RoadNetworkEditorActions().setIsPointCloudVisible(false)
    return true
  }

  private showPointCloud = (): boolean => {
    if (this.props.isPointCloudVisible)
      return false
    new RoadNetworkEditorActions().setIsDecorationsVisible(true)
    this.props.pointCloudTileManager.getPointClouds().forEach(pc => this.props.sceneManager.addObjectToScene(pc))

    const pointCloudBoundingBox = this.props.pointCloudManager.getPointCloudBoundingBox()
    if (pointCloudBoundingBox)
      this.props.sceneManager.addObjectToScene(pointCloudBoundingBox)

    new RoadNetworkEditorActions().setIsPointCloudVisible(true)
    return true
  }

  render() {
    return null
  }
}
