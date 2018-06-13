import Logger from "@/util/log";

const log = Logger(__filename)
export class RoadnetworkVertex {

  constructor(o:any = {}) {
    Object.assign(this, o)
  }

  id:string
  longitude:number
  latitude:number
}

export function mapToVertex(cloudVertex) {
  try {
    return new RoadnetworkVertex({
      id: cloudVertex.id,
      longitude: cloudVertex.longitude,
      latitude: cloudVertex.latitude,
    })
  } catch (err) {
    log.error("Error while parsing MCS vertex", cloudVertex.id)
    throw err
  }
}

export default RoadnetworkVertex
