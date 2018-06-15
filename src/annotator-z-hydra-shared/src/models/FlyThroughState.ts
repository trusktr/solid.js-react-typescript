
export class FlyThroughState {

	constructor(o:any = {}) {
		Object.assign(this, o)
	}

	enabled:boolean
	trajectories:any[]
	currentTrajectoryIndex:number
	currentPoseIndex:number
	endPoseIndex:number
}
