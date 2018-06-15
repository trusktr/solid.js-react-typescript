


// live_mode_pause

// live_recorded_playback_toggle

// select_trajectory_playback_file




// MAPPING

// old ------> new
//  --> liveModeEnabled
//  this.uiState.isLiveModePaused    --> playModeEnabled

import * as MapperProtos from '@mapperai/mapper-models'
import Models = MapperProtos.mapper.models

// A pre-processed trajectory, presumably generated from one gps/imu recording session.
import {TrajectoryDataSet} from "@/util/Perception";

interface FlyThroughTrajectory {
	dataSet: TrajectoryDataSet | null
	poses: Models.PoseMessage[]
}


interface FlyThroughState {
	enabled: boolean
	trajectories: FlyThroughTrajectory[]
	currentTrajectoryIndex: number
	currentPoseIndex: number
	endPoseIndex: number
}









