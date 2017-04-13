/**
 * Created by alonso on 4/13/17.
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