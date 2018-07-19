// import {ActionFactory, ActionMessage, ActionReducer} from "typedux"
// import * as MapperProtos from '@mapperai/mapper-models'
// import Models = MapperProtos.mapper.models
// import Logger from "@/util/log";
// import KioskState from "@/kiosk/store/state/KioskState";
//
// const log = Logger(__filename)
//
//
// export default class KioskActions extends ActionFactory<KioskState, ActionMessage<KioskState>> {
//
//   constructor() {
//     super(KioskState)
//   }
//
//   /**
//    * Leaf name
//    * @returns {string}
//    */
//   leaf(): string {
//     return KioskState.Key
//   }
//
//   /**
//    * Load the state from local storage
//    * @returns {(kioskState: KioskState) => void}
//    */
//   @ActionReducer()
//   loadAppState() {
//     log.info("Loading app state data from local storage")
//
//     const defaultState = {
//       isLiveMode: true,
//       isPlayMode: true,
//       flyThroughState: {
//         enabled: true,
//         trajectories: [],
//         currentTrajectoryIndex: 0,
//         currentPoseIndex: 0,
//         endPoseIndex: 0,
//       },
//       isCarInitialized: false,
//       isInitialOriginSet: false,
//
//       carPose: null, // @TODO can maybe be deleted (will review once app is running)
//     }
//
//     return (__kioskState: KioskState) => new KioskState(defaultState)
//   }
//
//   @ActionReducer()
//   toggleLiveMode() {
//     log.info("Toggling live mode")
//     return (kioskState: KioskState) => new KioskState({
//       ...kioskState, isLiveMode: !kioskState.isLiveMode
//     })
//   }
//
//   @ActionReducer()
//   togglePlayMode() {
//     log.info("Toggling play mode")
//     return (kioskState: KioskState) => new KioskState({
//       ...kioskState, isPlayMode: !kioskState.isPlayMode
//     })
//   }
//
//   @ActionReducer()
//   setCarPose(pose:Models.PoseMessage) {
//     // log.info("Setting car pose", pose)
//     return (kioskState: KioskState) => new KioskState({
//       ...kioskState, carPose: pose
//     })
//   }
//
//   @ActionReducer()
//   setInitialOriginSet(isLoaded:boolean) {
//     log.info("Setting isInitialOriginSet", isLoaded)
//     return (kioskState: KioskState) => new KioskState({
//       ...kioskState, isInitialOriginSet: isLoaded
//     })
//   }
// }
