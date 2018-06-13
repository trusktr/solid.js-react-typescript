import RoadnetworkVertex from "annotator-operation-hydra/src/models/RoadnetworkVertex"
import Logger from "@/util/log";

const log = Logger(__filename)
export class LineSegment {

  constructor(o:any = {}) {
    Object.assign(this, o)
  }

  id:string
  origin:RoadnetworkVertex
  destination:RoadnetworkVertex
}

export function mapToLineSegment(cloudLineSegment) {
  try {
    return new LineSegment({
      id: cloudLineSegment.id,
      origin: new RoadnetworkVertex({
        id: cloudLineSegment.origin.id,
        longitude: cloudLineSegment.origin.longitude,
        latitude: cloudLineSegment.origin.latitude,
      }),
      destination: new RoadnetworkVertex({
        id: cloudLineSegment.destination.id,
        longitude: cloudLineSegment.destination.longitude,
        latitude: cloudLineSegment.destination.latitude,
      }),
    })
  } catch (err) {
    log.error("Error while parsing MCS Line Segment", cloudLineSegment.id)
    throw err
  }
}

export default LineSegment
