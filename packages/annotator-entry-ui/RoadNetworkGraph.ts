/**
 *  Copyright 2017 Mapper Inc. Part of the mapper-annotator project.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import {LaneAnnotation} from 'annotator-entry-ui/LaneAnnotation'

export class RoadNetworkGraph {
	lanes : Array<LaneAnnotation>
	edges
	
	constructor()  {
		this.lanes = []
		this.edges = []
	}
	
	addLane(lane : LaneAnnotation) {
		this.lanes.push(lane)
	}
}