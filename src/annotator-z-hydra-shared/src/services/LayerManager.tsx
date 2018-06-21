import * as React from "react"
import LayerToggle from "@/annotator-z-hydra-shared/src/models/LayerToggle";
import * as lodash from "lodash";
import Logger from "@/util/log";

const log = Logger(__filename)


enum Layer {
  POINT_CLOUD,
  SUPER_TILES,
  IMAGE_SCREENS,
  ANNOTATIONS,
}

export interface LayerManagerProps {
  onRerender: () => void
}

export interface LayerManagerState {
  layerToggles: Map<string, LayerToggle>

}

export default class LayerManager extends React.Component<LayerManagerProps, LayerManagerState> {

  constructor(props) {
    super(props)

    this.state = {
      layerToggles: new Map()
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

  render() {
    return null
  }
}
