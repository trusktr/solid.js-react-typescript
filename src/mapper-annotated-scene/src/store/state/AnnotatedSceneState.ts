/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import UIMessage from "mapper-annotated-scene/src/models/UIMessage"
import StatusWindowState from "@/mapper-annotated-scene/src/models/StatusWindowState";
import * as MapperProtos from '@mapperai/mapper-models'
import Models = MapperProtos.mapper.models
import {CameraType} from "@/mapper-annotated-scene/src/models/CameraType";
import {OrderedMap, Set} from "immutable";
import {SuperTile} from "@/mapper-annotated-scene/tile/SuperTile";
import {RangeSearch} from "@/mapper-annotated-scene/tile-model/RangeSearch";
import TileManagerBase from "@/mapper-annotated-scene/tile/TileManagerBase"
import MousePosition from '@/mapper-annotated-scene/src/models/MousePosition'

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
	isLiveMode: boolean // toggles between live mode and recorded mode
	isPlayMode: boolean // toggles between play and pause modes

    flyThroughEnabled: boolean
	statusWindowState: StatusWindowState

	uiMenuVisible: boolean
	shouldAnimate: boolean

	carPose: Models.PoseMessage
	isCarInitialized: boolean
	isInitialOriginSet: boolean

	// Shared State
	cameraPreference: CameraType

	sceneInitialized: boolean

	compassRosePosition: THREE.Vector3
	isDecorationsVisible: boolean
	isTransformControlsAttached: boolean

	orbitControlsTargetPoint: THREE.Vector3

	pointCloudSuperTiles: OrderedMap<string, SuperTile>
	annotationSuperTiles: OrderedMap<string, SuperTile>

	sceneObjects: Set<THREE.Object3D>
	sceneStage: THREE.Vector3
	isAnnotationTileManagerEnabled: boolean

	// Ported from uiState
	isMouseDragging: boolean
	mousePosition: MousePosition
	isRotationModeActive: boolean
	isConnectLeftNeighborMode: boolean
	isConnectRightNeighborMode: boolean
	isConnectFrontNeighborMode: boolean
	isAddMarkerMode: boolean
	isAddConnectionMode: boolean
	isJoinAnnotationMode: boolean
	isControlKeyPressed: boolean
	isShiftKeyPressed: boolean
	isAddConflictOrDeviceMode: boolean
	isMouseDown: boolean
	numberKeyPressed: number | null
	isHoveringOnMarker: boolean

	transformedObjects: Array<THREE.Object3D> | null
	transformControlsMode: 'translate' | 'rotate' | 'scale'

	cameraIsOrbiting: boolean
	camera: THREE.Camera
	areaOfInterest: RangeSearch[]
	rendererSize: any
	loadingTileManagers: Set<TileManagerBase>
}
