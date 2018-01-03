/**
 *  Copyright 2017 Mapper Inc. Part of the mapper-annotator project.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as THREE from 'three'
import {Annotation, AnnotationUuid} from 'annotator-entry-ui/annotations/AnnotationBase'

// Some variables used for rendering

// Some types
export enum ConnectionType {
	UNKNOWN = 0,
	STRAIGHT,
	LEFT_TURN,
	RIGHT_TURN,
	LEFT_MERGE,
	RIGHT_MERGE,
	LEFT_SPLIT,
	RIGHT_SPLIT,
	OTHER
}

export class Connection extends Annotation {
	type: ConnectionType
	startLaneUuid: AnnotationUuid
	endLaneUuid: AnnotationUuid

	constructor(startLaneUuid: AnnotationUuid, endLaneUuid: AnnotationUuid) {
		super()
		this.type = ConnectionType.UNKNOWN
		this.startLaneUuid = startLaneUuid
		this.endLaneUuid = endLaneUuid
	}

	addMarker(position: THREE.Vector3, isLastMarker: boolean = false): void {
		this.updateVisualization()
	}

	deleteLastMarker(): void {}

	makeActive(): void {}

	makeInactive(): void {}

	setLiveMode(): void {}

	unsetLiveMode(): void {}

	highlightMarkers(markers: Array<THREE.Mesh>): void {}

	unhighlightMarkers(): void {}

	updateVisualization(): void {

	}

	setType(type: ConnectionType): void {
		this.type = type
	}
}
