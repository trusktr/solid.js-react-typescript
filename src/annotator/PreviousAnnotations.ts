/**
 *  Copyright 2019 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import {
  Annotation,
  AnnotationType,
  Boundary,
  LaneSegment,
  Polygon,
  TrafficDevice,
  Box,
  getLogger as Logger,
} from '@mapperai/mapper-annotated-scene'

const log = Logger(__filename)

// This captures a bit of state for the current session, namely which are the
// recently-selected annotations of each type.
export class PreviousAnnotations {
  private boundary: Boundary | null
  private laneSegment: LaneSegment | null
  private polygon: Polygon | null
  private trafficDevice: TrafficDevice | null
  private box: Box | null

  getByType(annotationType: AnnotationType): Annotation | null {
    switch (annotationType) {
      case AnnotationType.Boundary:
        return this.boundary
      case AnnotationType.LaneSegment:
        return this.laneSegment
      case AnnotationType.Polygon:
        return this.polygon
      case AnnotationType.TrafficDevice:
        return this.trafficDevice
      case AnnotationType.Box:
        return this.box
    }
  }

  setByType(annotation: Annotation): void {
    if (annotation instanceof Boundary) this.boundary = annotation
    else if (annotation instanceof LaneSegment) this.laneSegment = annotation
    else if (annotation instanceof Polygon) this.polygon = annotation
    else if (annotation instanceof TrafficDevice) this.trafficDevice = annotation
    else if (annotation instanceof Box) this.box = annotation
    else log.error(`annotation with unknown type ${AnnotationType[annotation.annotationType]}`)
  }
}
