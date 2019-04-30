/**
 *  Copyright 2019 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import {
  Annotation,
  AnnotationType,
  Boundary,
  Connection,
  Lane,
  Polygon,
  TrafficDevice,
  getLogger as Logger,
} from '@mapperai/mapper-annotated-scene'

const log = Logger(__filename)

// This captures a bit of state for the current session, namely which are the
// recently-selected annotations of each type.
export class PreviousAnnotations {
  private boundary: Boundary | null
  private connection: Connection | null
  private lane: Lane | null
  private polygon: Polygon | null
  private trafficDevice: TrafficDevice | null

  getByType(annotationType: AnnotationType): Annotation | null {
    switch (annotationType) {
      case AnnotationType.Boundary:
        return this.boundary
      case AnnotationType.Connection:
        return this.connection
      case AnnotationType.Lane:
        return this.lane
      case AnnotationType.Polygon:
        return this.polygon
      case AnnotationType.TrafficDevice:
        return this.trafficDevice
      default:
        log.error(`unknown annotation type ${AnnotationType[annotationType]}`)
        return null
    }
  }

  setByType(annotation: Annotation): void {
    if (annotation instanceof Boundary) this.boundary = annotation
    else if (annotation instanceof Connection) this.connection = annotation
    else if (annotation instanceof Lane) this.lane = annotation
    else if (annotation instanceof Polygon) this.polygon = annotation
    else if (annotation instanceof TrafficDevice) this.trafficDevice = annotation
    else log.error(`annotation with unknown type ${AnnotationType[annotation.annotationType]}`)
  }
}
