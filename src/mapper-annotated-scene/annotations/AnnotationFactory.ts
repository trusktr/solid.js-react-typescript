/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import {AnnotationType} from './AnnotationType'
import {Annotation, AnnotationJsonInputInterface} from './AnnotationBase'
import {Boundary, BoundaryJsonInputInterface} from './Boundary'
import {Connection, ConnectionJsonInputInterface} from './Connection'
import {Lane, LaneJsonInputInterfaceV3} from './Lane'
import {Territory, TerritoryJsonInputInterface} from './Territory'
import {TrafficDevice, TrafficDeviceJsonInputInterface} from './TrafficDevice'

export function construct(annotationType: AnnotationType, obj?: AnnotationJsonInputInterface): Annotation | null {
	try {
		switch (annotationType) {
			case AnnotationType.BOUNDARY:
				return new Boundary(obj as BoundaryJsonInputInterface)
			case AnnotationType.CONNECTION:
				return new Connection(obj as ConnectionJsonInputInterface)
			case AnnotationType.LANE:
				return new Lane(obj as LaneJsonInputInterfaceV3)
			case AnnotationType.TERRITORY:
				return new Territory(obj as TerritoryJsonInputInterface)
			case AnnotationType.TRAFFIC_DEVICE:
				return new TrafficDevice(obj as TrafficDeviceJsonInputInterface)
			default:
				return null
		}
	} catch (err) {
		console.error(`construct(${AnnotationType[annotationType]}, ${obj && obj.uuid ? obj.uuid : 'undefined'}) failed: ${err.message}`)
		return null
	}
}
