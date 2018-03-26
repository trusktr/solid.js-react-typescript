/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import {AnnotationType} from "./AnnotationType"
import {Annotation, AnnotationJsonInputInterface} from "./AnnotationBase"
import {Boundary, BoundaryJsonInputInterface} from "./Boundary"
import {Connection, ConnectionJsonInputInterface} from "./Connection"
import {Lane, LaneJsonInputInterfaceV3} from "./Lane"
import {Territory, TerritoryJsonInputInterface} from "./Territory"
import {TrafficSign, TrafficSignJsonInputInterface} from "./TrafficSign"

export function construct(annotationType: AnnotationType, obj?: AnnotationJsonInputInterface): Annotation | null {
	switch (annotationType) {
		case AnnotationType.BOUNDARY:
			return new Boundary(obj as BoundaryJsonInputInterface)
		case AnnotationType.CONNECTION:
			return new Connection(obj as ConnectionJsonInputInterface)
		case AnnotationType.LANE:
			return new Lane(obj as LaneJsonInputInterfaceV3)
		case AnnotationType.TERRITORY:
			return new Territory(obj as TerritoryJsonInputInterface)
		case AnnotationType.TRAFFIC_SIGN:
			return new TrafficSign(obj as TrafficSignJsonInputInterface)
		default:
			return null
	}
}
