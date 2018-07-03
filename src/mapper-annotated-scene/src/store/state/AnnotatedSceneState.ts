import UIMessage from "annotator-z-hydra-shared/src/models/UIMessage"
import {FlyThroughState} from "@/annotator-z-hydra-shared/src/models/FlyThroughState";
import StatusWindowState from "@/annotator-z-hydra-shared/src/models/StatusWindowState";
import * as MapperProtos from '@mapperai/mapper-models'
import Models = MapperProtos.mapper.models
import {CameraType} from "@/annotator-z-hydra-shared/src/models/CameraType";
import {OrderedMap} from "immutable";
import {SuperTile} from "@/annotator-entry-ui/tile/SuperTile";

export default class AnnotatedSceneState {

	static Key = 'AnnotatedSceneState'

	/**
	 * Create state from JS (method required to comply with by IStateConstructor on the reducer)
	 * @param o
	 * @returns {AnnotatedSceneState}
	 */
	static fromJS(o: any = {}): AnnotatedSceneState {
		return new AnnotatedSceneState(o)
	}

	constructor(o: any = {}) {
		Object.assign(this, o)
	}

	messages: Array<UIMessage>

	// ANNOTATOR SPECIFIC STATE
	liveModeEnabled: boolean // toggles between live mode and recorded mode
	playModeEnabled: boolean // toggles between play and pause modes

	flyThroughState: FlyThroughState
	statusWindowState: StatusWindowState

	uiMenuVisible: boolean
	shouldAnimate: boolean

	carPose: Models.PoseMessage
  isCarInitialized: boolean
  isKioskUserDataLoaded: boolean



	// Shared State
	cameraPreference: CameraType

	sceneInitialized: boolean

	compassRosePosition: THREE.Vector3
	isDecorationsVisible: boolean
  isPointCloudVisible: boolean
  isImageScreensVisible: boolean
  isAnnotationsVisible: boolean

  orbitControlsTargetPoint: THREE.Vector3

	pointCloudSuperTiles: OrderedMap<string, SuperTile>
	annotationSuperTiles: OrderedMap<string, SuperTile>

	sceneObjects: Set<THREE.Object3D>

	visibleLayers: string[]
}
