import * as THREE from "three"
import config from '@/config'
import {ActionFactory, ActionMessage, ActionReducer} from "typedux"
import RoadNetworkEditorState from "annotator-z-hydra-shared/src/store/state/RoadNetworkEditorState"
import UIMessage from "annotator-z-hydra-shared/src/models/UIMessage"
import * as MapperProtos from '@mapperai/mapper-models'
import Models = MapperProtos.mapper.models
import Logger from "@/util/log";
import {CameraType} from "@/annotator-z-hydra-shared/src/models/CameraType";

const log = Logger(__filename)


export default class RoadNetworkEditorActions extends ActionFactory<RoadNetworkEditorState, ActionMessage<RoadNetworkEditorState>> {

	constructor() {
		super(RoadNetworkEditorState)
	}

	/**
	 * Leaf name
	 * @returns {string}
	 */
	leaf(): string {
		return RoadNetworkEditorState.Key
	}

	/**
	 * Load the state from local storage
	 * @returns {(roadEditorState: RoadNetworkEditorState) => void}
	 */
	@ActionReducer()
	loadAppState() {
		log.info("Loading app state data from local storage")

		const defaultState = {
			messages: Array<UIMessage>(),

			liveModeEnabled: true,
			playModeEnabled: true,


			flyThroughState: {
				enabled: true,
				trajectories: [],
				currentTrajectoryIndex: 0,
				currentPoseIndex: 0,
				endPoseIndex: 0,
			},

			statusWindowState: {
				enabled: !!config.get('startup.show_status_panel'),
				messages: new Map<string, string>()
			},

			uiMenuVisible: config.get('startup.show_menu'),
			shouldAnimate: false,
			carPose: null,
      isCarInitialized: false,

			cameraPreference: CameraType.PERSPECTIVE,
			sceneInitialized: false,

      compassRosePosition: new THREE.Vector3(0, 0, 0),

			isDecorationsVisible: false,
      isPointCloudVisible: true,
      isImageScreensVisible: true,
      isAnnotationsVisible: true,
		}

		return (__roadEditorState: RoadNetworkEditorState) => new RoadNetworkEditorState(defaultState)
	}

	@ActionReducer()
	addMessage(message: UIMessage) {
		log.info("Adding UI Message", message.id)
		return (roadEditorState: RoadNetworkEditorState) => {
			let messages = [...roadEditorState.messages, message]
			return new RoadNetworkEditorState({...roadEditorState, messages: messages})
		}
	}

	@ActionReducer()
	removeMessage(messageId: string) {
		log.info("Removing UI Message", messageId)
		return (roadEditorState: RoadNetworkEditorState) => {
			let messages = [...roadEditorState.messages]
			messages = messages.filter(it => it.id !== messageId)

			return new RoadNetworkEditorState({...roadEditorState, messages: messages})
		}
	}

	@ActionReducer()
	toggleLiveMode() {
		log.info("Toggling live mode")
		return (roadEditorState: RoadNetworkEditorState) => new RoadNetworkEditorState({
			...roadEditorState, liveModeEnabled: !roadEditorState.liveModeEnabled
		})
	}

	@ActionReducer()
	togglePlayMode() {
		log.info("Toggling play mode")
		return (roadEditorState: RoadNetworkEditorState) => new RoadNetworkEditorState({
			...roadEditorState, playModeEnabled: !roadEditorState.playModeEnabled
		})
	}

	@ActionReducer()
	toggleUIMenuVisible() {
		log.info("Toggling UI Menu Visibility")
		return (roadEditorState: RoadNetworkEditorState) => new RoadNetworkEditorState({
			...roadEditorState, uiMenuVisible: !roadEditorState.uiMenuVisible
		})
	}

	@ActionReducer()
	setUIMenuVisibility(visible:boolean) {
		log.info("Setting UI Menu Visibility", visible)
		return (roadEditorState: RoadNetworkEditorState) => new RoadNetworkEditorState({
			...roadEditorState, uiMenuVisible: visible
		})
	}

	@ActionReducer()
	setShouldAnimate(shouldAnimate:boolean) {
		log.info("Setting should animate", shouldAnimate)
		return (roadEditorState: RoadNetworkEditorState) => new RoadNetworkEditorState({
			...roadEditorState, shouldAnimate: shouldAnimate
		})
	}

	@ActionReducer()
	setCarPose(pose:Models.PoseMessage) {
		// log.info("Setting car pose", pose)
		return (roadEditorState: RoadNetworkEditorState) => new RoadNetworkEditorState({
			...roadEditorState, carPose: pose
		})
	}

	@ActionReducer()
	setSceneInitialized(isInitialized:boolean) {
		log.info("Setting sceneInitialized", isInitialized)
		return (roadEditorState: RoadNetworkEditorState) => new RoadNetworkEditorState({
			...roadEditorState, sceneInitialized: isInitialized
		})
	}

	@ActionReducer()
	setIsAnnotationsVisible(isVisible:boolean) {
	  log.info("Setting isAnnotationsVisible", isVisible)
    return (roadEditorState: RoadNetworkEditorState) => new RoadNetworkEditorState({
      ...roadEditorState, isAnnotationsVisible: isVisible
    })
  }

  @ActionReducer()
  setIsImageScreensVisible(isVisible:boolean) {
    log.info("Setting isImageScreensVisible", isVisible)
    return (roadEditorState: RoadNetworkEditorState) => new RoadNetworkEditorState({
      ...roadEditorState, isImageScreensVisible: isVisible
    })
  }

  @ActionReducer()
  setIsPointCloudVisible(isVisible:boolean) {
    log.info("Setting isPointCloudVisible", isVisible)
    return (roadEditorState: RoadNetworkEditorState) => new RoadNetworkEditorState({
      ...roadEditorState, isPointCloudVisible: isVisible
    })
  }

  @ActionReducer()
  setIsDecorationsVisible(isVisible:boolean) {
    log.info("Setting isDecorationsVisible", isVisible)
    return (roadEditorState: RoadNetworkEditorState) => new RoadNetworkEditorState({
      ...roadEditorState, isDecorationsVisible: isVisible
    })
  }

  @ActionReducer()
  setCarInitialized(isSetup:boolean) {
    log.info("Setting isCarInitialized", isSetup)
    return (roadEditorState: RoadNetworkEditorState) => new RoadNetworkEditorState({
      ...roadEditorState, isCarInitialized: isSetup
    })
	}

  @ActionReducer()
	setCameraPreference(preference:CameraType) {
    log.info("Setting camera preference", preference)
    return (roadEditorState: RoadNetworkEditorState) => new RoadNetworkEditorState({
      ...roadEditorState, cameraPreference: preference
    })
	}

  @ActionReducer()
	setCompassRosePosition(position:THREE.Vector3) {
    log.info("Setting compass rose position", position)
    return (roadEditorState: RoadNetworkEditorState) => new RoadNetworkEditorState({
      ...roadEditorState, compassRosePosition: position
    })
	}
}
