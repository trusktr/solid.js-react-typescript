/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import {TrajectoryDataSet} from '../../../util/Perception'
import * as MapperProtos from '@mapperai/mapper-models'

// A pre-processed trajectory, presumably generated from one gps/imu recording session.
export interface FlyThroughTrajectory {
	dataSet: TrajectoryDataSet | null
	poses: MapperProtos.mapper.models.PoseMessage[]
}
export class FlyThroughState {
	constructor(o: FlyThroughState) {
		Object.assign(this, o)
	}

	trajectories: FlyThroughTrajectory[]
	currentTrajectoryIndex: number
	currentPoseIndex: number
	endPoseIndex: number
}
