/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

export interface TrajectoryDataSet {
	name: string
	path: string
}

// A rough heuristic to find the name of a processed data set. They are usually named as
// something like a timestamp for the directory, with some .md files inside.
export function dataSetNameFromPath(path: string): string | null {
	const pieces = path.split('/').filter(piece => piece !== '')
	const count = pieces.length

	if (count < 2)
		return null
	else if (pieces[count - 1].endsWith('.md'))
		return pieces[count - 2]
	else
		return null
}

// This magic file is created by the S1 capture pipeline.
export const s1SessionFileName = 'session.json'
// This magic file is created by RunBatchLidarSLAM.
// https://github.com/Signafy/Perception/tree/develop/apps/Core/RunBatchLidarSLAM
export const trajectoryFileName = 'trajectory_lidar.md'
