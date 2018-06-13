import * as SaffronSDK from "@mapperai/mapper-saffron-sdk"

import LineSegment, {mapToLineSegment} from "annotator-operation-hydra/src/models/LineSegment"
import {apiDomain, apiRoadNetwork, apiVersion, defaultRequestHeaders} from "annotator-operation-hydra/src/services/Constants"
import UIMessage, {UIMessageType} from "annotator-operation-hydra/src/models/UIMessage"
import RoadNetworkEditorActions from "annotator-operation-hydra/src/store/actions/RoadNetworkEditorActions"
import RoadNetworkEditorState from "annotator-operation-hydra/src/store/state/RoadNetworkEditorState"
import RoadnetworkVertex, {mapToVertex} from "annotator-operation-hydra/src/models/RoadnetworkVertex"
import Logger from "@/util/log";

const log = Logger(__filename)
/**
 * Get the road segments for a bounded box set of coordinates
 * @param {number} longitude1
 * @param {number} latitude1
 * @param {number} longitude2
 * @param {number} latitude2
 * @returns {Promise<Map<string, LineSegment>>}
 */
export async function getRoadSegments(longitude1:number, latitude1:number, longitude2:number, latitude2:number):Promise<Map<string, LineSegment>> {
  log.debug("Fetching line segments from RoadNetwork")
  const method = SaffronSDK.CloudConstants.HttpMethod.PUT
  const endpoint = '/segments/search/box'
  const uri = `roadnetwork/${apiVersion}${endpoint}`

  const body = {
    northWest: {longitude: longitude1, latitude: latitude1},
    southEast: {longitude: longitude2, latitude: latitude2}
  }

  //@TODO: Paginate this request

  try {
    const result = await new SaffronSDK.CloudService.default().makeAPIRequest(
      apiRoadNetwork,
      apiDomain,
      method,
      uri,
      body,
      null,
      defaultRequestHeaders
    )

    const lineSegments = result.data.segments.map(jsonSegment => mapToLineSegment(jsonSegment)).reduce((lineSegmentMap, lineSegment) => {
      lineSegmentMap.set(lineSegment.id, lineSegment)
      return lineSegmentMap
    }, new Map<string, LineSegment>())

    return lineSegments
  } catch (err) {
    const message = "Unable to retrieve line segments"
    log.error(message, err)
    const errorMessage = new UIMessage({
      type: UIMessageType.ERROR,
      expiresAt: Date.now() + 5000,
      message: message,
    })

    new RoadNetworkEditorActions().addMessage(errorMessage)
    throw err
  }
}

export async function createRoadSegments(roadSegments: Map<string, LineSegment>): Promise<Map<string, LineSegment>> {
  log.debug("Creating line segments in Mapper Cloud Services")
  const method = SaffronSDK.CloudConstants.HttpMethod.POST
  const endpoint = '/segments/'
  const uri = `roadnetwork/${apiVersion}${endpoint}`

  const body = {
    segments: [...roadSegments.values()],
  }

  try {
    const result = await new SaffronSDK.CloudService.default().makeAPIRequest(
      apiRoadNetwork,
      apiDomain,
      method,
      uri,
      body,
      null,
      defaultRequestHeaders
    )

    const newLineSegments = result.data.segments.map(jsonSegment => mapToLineSegment(jsonSegment)).reduce((lineSegmentMap, lineSegment) => {
      lineSegmentMap.set(lineSegment.id, lineSegment)
      return lineSegmentMap
    }, new Map<string, LineSegment>())

    return newLineSegments
  } catch (err) {
    const message = "Unable to create line segments"
    log.error(message, err)
    const errorMessage = new UIMessage({
      type: UIMessageType.ERROR,
      expiresAt: Date.now() + 5000,
      message: message,
    })

    new RoadNetworkEditorActions().addMessage(errorMessage)
    throw err
  }
}

export async function deleteRoadSegment(segmentId:string) {
  log.debug("Deleting line segments in Mapper Cloud Services")
  const method = SaffronSDK.CloudConstants.HttpMethod.DELETE
  const endpoint = '/segments/'
  const uri = `roadnetwork/${apiVersion}${endpoint}${segmentId}`

  try {
    const result = await new SaffronSDK.CloudService.default().makeAPIRequest(
      apiRoadNetwork,
      apiDomain,
      method,
      uri,
      {},
      null,
      defaultRequestHeaders
    )
  } catch (err) {
    const message = `Unable to delete line segment ${segmentId}`
    log.error(message, err)
    const errorMessage = new UIMessage({
      type: UIMessageType.ERROR,
      expiresAt: Date.now() + 5000,
      message: message,
    })

    new RoadNetworkEditorActions().addMessage(errorMessage)
    throw err
  }

}

/**
 * Get the vertices within a bounded box set of coordinates
 * @param {number} longitude1
 * @param {number} latitude1
 * @param {number} longitude2
 * @param {number} latitude2
 * @returns {Promise<Map<string, Vertex>>}
 */
export async function getVertices(longitude1:number, latitude1:number, longitude2:number, latitude2:number):Promise<Map<string, RoadnetworkVertex>> {
  log.debug("Fetching vertices from RoadNetwork")
  const method = SaffronSDK.CloudConstants.HttpMethod.PUT
  const endpoint = '/vertices/search/box'
  const uri = `roadnetwork/${apiVersion}${endpoint}`

  const body = {
    northWest: {longitude: longitude1, latitude: latitude1},
    southEast: {longitude: longitude2, latitude: latitude2}
  }

  //@TODO: Paginate this request

  try {
    const result = await new SaffronSDK.CloudService.default().makeAPIRequest(
      apiRoadNetwork,
      apiDomain,
      method,
      uri,
      body,
      null,
      defaultRequestHeaders
    )

    const vertices = result.data.vertices.map(jsonVertex => mapToVertex(jsonVertex)).reduce((vertexMap, vertex) => {
      vertexMap.set(vertex.id, vertex)
      return vertexMap
    }, new Map<string, RoadnetworkVertex>())

    return vertices
  } catch (err) {
    const message = "Unable to retrieve vertices"
    log.error(message, err)
    const errorMessage = new UIMessage({
      type: UIMessageType.ERROR,
      expiresAt: Date.now() + 5000,
      message: message,
    })

    new RoadNetworkEditorActions().addMessage(errorMessage)
    throw err
  }
}

async function syncUnpublishedSegments() {
  const unpublishedSegments = getRoadNetworkEditorStoreState().get(RoadNetworkEditorState.Key).unpublishedLineSegments
  if(unpublishedSegments.size > 0) {
    log.info("Detected unsynced segments", Array.from(unpublishedSegments.keys()))
    const message = new UIMessage({
      type: UIMessageType.INFO,
      expiresAt: Date.now() + 60000,
      message: "Syncing your work...",
    })

    new RoadNetworkEditorActions().addMessage(message)
    const newSegments = await createRoadSegments(unpublishedSegments)
    new RoadNetworkEditorActions().addLineSegments(newSegments)
    new RoadNetworkEditorActions().removeUnpublishedSegments(unpublishedSegments)
    new RoadNetworkEditorActions().removeMessage(message.id)
    log.info("Finished syncing segments")
  }
}

const expirationTimer = setInterval(syncUnpublishedSegments,60000)

if (module.hot) {
  module.hot.dispose(() => clearInterval(expirationTimer))
}


