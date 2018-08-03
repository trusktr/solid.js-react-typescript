// import {FlyThroughState} from "@/mapper-annotated-scene/src/models/FlyThroughState";
// import * as MapperProtos from '@mapperai/mapper-models'
// import Models = MapperProtos.mapper.models
//
// export default class KioskState {
//
//   static Key = 'KioskState'
//
//   /**
//	* Create state from JS (method required to comply with by IStateConstructor on the reducer)
//	* @param o
//	* @returns {KioskState}
//	*/
//   static fromJS(o: any = {}): KioskState {
//	 return new KioskState(o)
//   }
//
//   constructor(o: any = {}) {
//	 Object.assign(this, o)
//   }
//   isLiveMode: boolean // toggles between live mode and recorded mode
//   isPlayMode: boolean // toggles between play and pause modes
//
//   flyThroughState: FlyThroughState
//   isCarInitialized: boolean
//   isInitialOriginSet: boolean
//   carPose: MapperProtos.mapper.models.PoseMessage
// }
