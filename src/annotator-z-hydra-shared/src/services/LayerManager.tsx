import * as React from "react"
import LayerToggle from "@/annotator-z-hydra-shared/src/models/LayerToggle";
import * as lodash from "lodash";
import Logger from "@/util/log";
import {createStructuredSelector} from "reselect";
import {typedConnect} from "@/annotator-z-hydra-shared/src/styles/Themed";
import RoadEditorState from "@/annotator-z-hydra-shared/src/store/state/RoadNetworkEditorState";
import RoadNetworkEditorActions from "@/annotator-z-hydra-shared/src/store/actions/RoadNetworkEditorActions";
import {SceneManager} from "@/annotator-z-hydra-shared/src/services/SceneManager";

const log = Logger(__filename)


export enum Layer {
  POINT_CLOUD,
  IMAGE_SCREENS,
  ANNOTATIONS,
}

export interface LayerManagerProps {
  sceneManager: SceneManager
  onRerender: () => void
}

export interface LayerManagerState {
  layerToggles: Map<string, LayerToggle>

}

@typedConnect(createStructuredSelector({
  isPointCloudVisible: (state) => state.get(RoadEditorState.Key).isPointCloudVisible,
  isImageScreensVisible: (state) => state.get(RoadEditorState.Key).isImageScreensVisible,
  isAnnotationsVisible: (state) => state.get(RoadEditorState.Key).isAnnotationsVisible,

}))
export default class LayerManager extends React.Component<LayerManagerProps, LayerManagerState> {

  constructor(props) {
    super(props)

    const pointCloudLayerToggle = new LayerToggle({show: this.showPointCloud, hide: this.hidePointCloud})
    const imageScreensLayerToggle = new LayerToggle({show: this.showImageScreens, hide: this.hideImageScreens})
    const annotationLayerToggle = new LayerToggle({show: this.showAnnotations, hide: this.hideAnnotations})

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
    this.props.sceneManager.hideDecorations()
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
    this.props.sceneManager.showDecorations()
    this.props.pointCloudTileManager.getPointClouds().forEach(pc => this.props.sceneManager.addObjectToScene(pc))

    const pointCloudBoundingBox = this.props.pointCloudManager.getPointCloudBoundingBox()
    if (pointCloudBoundingBox)
      this.props.sceneManager.addObjectToScene(pointCloudBoundingBox)

    new RoadNetworkEditorActions().setIsPointCloudVisible(true)
    return true
  }

  private hideImageScreens = (): boolean => {
    if (!this.props.isImageScreensVisible)
      return false
    this.props.imageManager.hideImageScreens()
    new RoadNetworkEditorActions().setIsImageScreensVisible(false)
    return true
  }

  private showImageScreens = (): boolean => {
    if (this.props.isImageScreensVisible)
      return false
    this.props.imageManager.showImageScreens()
    new RoadNetworkEditorActions().setIsImageScreensVisible(true)
    return true
  }

  private hideAnnotations = (): boolean => {
    if (!this.props.isAnnotationsVisible)
      return false
    this.props.annotationManager.hideAnnotations()
    new RoadNetworkEditorActions().setIsAnnotationsVisible(false)
    return true
  }

  private showAnnotations = (): boolean => {
    if (this.props.isAnnotationsVisible)
      return false
    this.props.annotationManager.showAnnotations()
    new RoadNetworkEditorActions().setIsAnnotationsVisible(true)
    return true
  }

  render() {
    return null
  }
}
