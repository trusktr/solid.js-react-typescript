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
//       liveModeEnabled: true,
//       playModeEnabled: true,
//       flyThroughState: {
//         enabled: true,
//         trajectories: [],
//         currentTrajectoryIndex: 0,
//         currentPoseIndex: 0,
//         endPoseIndex: 0,
//       },
//       isCarInitialized: false,
//       isKioskUserDataLoaded: false,
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
//       ...kioskState, liveModeEnabled: !kioskState.liveModeEnabled
//     })
//   }
//
//   @ActionReducer()
//   togglePlayMode() {
//     log.info("Toggling play mode")
//     return (kioskState: KioskState) => new KioskState({
//       ...kioskState, playModeEnabled: !kioskState.playModeEnabled
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
//   setIsKioskUserDataLoaded(isLoaded:boolean) {
//     log.info("Setting isKioskUserDataLoaded", isLoaded)
//     return (kioskState: KioskState) => new KioskState({
//       ...kioskState, isKioskUserDataLoaded: isLoaded
//     })
//   }
// }
