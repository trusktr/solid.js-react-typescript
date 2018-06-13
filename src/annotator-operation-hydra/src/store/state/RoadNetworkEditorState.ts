import LineSegment from "annotator-operation-hydra/src/models/LineSegment"
import UIMessage from "annotator-operation-hydra/src/models/UIMessage"
import RoadnetworkVertex from "annotator-operation-hydra/src/models/RoadnetworkVertex"


export default class RoadNetworkEditorState {

  static Key = 'RoadNetworkEditorState'

  /**
   * Create state from JS (method required to comply with by IStateConstructor on the reducer)
   * @param o
   * @returns {RoadNetworkEditorState}
   */
  static fromJS(o:any = {}):RoadNetworkEditorState {
    return new RoadNetworkEditorState(o)
  }

  constructor(o:any = {}) {
    Object.assign(this, o)
  }

  lineSegments: Map<string, LineSegment>
  vertices: Map<string, RoadnetworkVertex>
  messages: Array<UIMessage>
  unpublishedLineSegments: Map<string, LineSegment>
  creationModeEnabled: boolean
  segmentSelectionModeEnabled: boolean
  selectedLineSegment: LineSegment
  selectedVertex: RoadnetworkVertex
  startingPoint: RoadnetworkVertex
  previousPoint: RoadnetworkVertex
  mapStyle: string
}
