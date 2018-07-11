import {TrajectoryDataSet} from "@/util/Perception"
import * as MapperProtos from '@mapperai/mapper-models'
import Models = MapperProtos.mapper.models

// A pre-processed trajectory, presumably generated from one gps/imu recording session.
export interface FlyThroughTrajectory {
	dataSet: TrajectoryDataSet | null
	poses: Models.PoseMessage[]
}

export class FlyThroughState {

	constructor(o:FlyThroughState) {
		Object.assign(this, o)
	}

	enabled:boolean
	trajectories:FlyThroughTrajectory[]
	currentTrajectoryIndex:number
	currentPoseIndex:number
	endPoseIndex:number
}
