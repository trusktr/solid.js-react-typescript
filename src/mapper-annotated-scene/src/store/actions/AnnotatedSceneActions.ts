import * as THREE from "three"
import config from '@/config'
import {ActionFactory, ActionMessage, ActionReducer} from "typedux"
import AnnotatedSceneState from "mapper-annotated-scene/src/store/state/AnnotatedSceneState"
import UIMessage from "mapper-annotated-scene/src/models/UIMessage"
import * as MapperProtos from '@mapperai/mapper-models'
import Models = MapperProtos.mapper.models
import Logger from "@/util/log";
import {CameraType} from "@/mapper-annotated-scene/src/models/CameraType";
import {OrderedMap} from "immutable";
import {SuperTile} from "@/mapper-annotated-scene/tile/SuperTile";
import StatusWindowActions from "@/mapper-annotated-scene/StatusWindowActions";
import {StatusKey} from "@/mapper-annotated-scene/src/models/StatusKey";
import {RangeSearch} from "../../../tile-model/RangeSearch";
import {TileManager} from '../../../tile/TileManager'
import {getAnnotatedSceneStoreState} from '@/mapper-annotated-scene/src/store/AppStore'
import {Set} from "immutable";

const log = Logger(__filename)

export default class AnnotatedSceneActions extends ActionFactory<AnnotatedSceneState, ActionMessage<AnnotatedSceneState>> {

	constructor() {
		super(AnnotatedSceneState)
	}

	/**
	 * Leaf name
	 * @returns {string}
	 */
	leaf(): string {
		return AnnotatedSceneState.Key
	}

	/**
	 * Load the state from local storage
	 * @returns {(annotatedSceneState: AnnotatedSceneState) => void}
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
				enabled: !!config['startup.show_status_panel'],
				messages: new Map<string, string>()
			},

			uiMenuVisible: config['startup.show_menu'],
			shouldAnimate: false,
			carPose: null,
			isCarInitialized: false,
			isKioskUserDataLoaded: false,

			cameraPreference: CameraType.PERSPECTIVE,

			pointOfInterest: new THREE.Vector3(0, 0, 0),
			areaOfInterest: [{minPoint: new THREE.Vector3(0, 0, 0), maxPoint: new THREE.Vector3(1 ,1 ,1)}, {minPoint: new THREE.Vector3(0, 0, 0), maxPoint: new THREE.Vector3(1 ,1 ,1)}],
			rendererSize: { width: 1, height: 1 },

			sceneInitialized: false,

			compassRosePosition: new THREE.Vector3(0, 0, 0),

			isDecorationsVisible: false,
			isPointCloudVisible: true,
			isImageScreensVisible: true,
			isAnnotationsVisible: true,

			orbitControlsTargetPoint: new THREE.Vector3(0, 0, 0),
			annotationSuperTiles: OrderedMap<string, SuperTile>(),
			pointCloudSuperTiles: OrderedMap<string, SuperTile>(),

			sceneObjects: Set<THREE.Object3D>(),
			visibleLayers: [],
			isAnnotationTileManagerEnabled: false, // by default, do not include the AnnotationTileManager -- it's only needed for the Kiosk app

			isMouseDragging: false,
			isRotationModeActive: false,
			isConnectLeftNeighborKeyPressed: false,
			isConnectRightNeighborKeyPressed: false,
			isConnectFrontNeighborKeyPressed: false,
			isAddMarkerKeyPressed: false,
			isLiveMode: false,
			isAddConnectionKeyPressed: false,
			isJoinAnnotationKeyPressed: false,
			isControlKeyPressed: false,
			isAddConflictOrDeviceKeyPressed: false,
			isMouseButtonPressed: false,

			cameraIsOrbiting: false,
			camera: null,
			isOrbiting: false,
			loadingTileManagers: Set<TileManager>(),
		}

		return (__annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState(defaultState)
	}

	@ActionReducer()
	addMessage(message: UIMessage) {
		log.info("Adding UI Message", message.id)
		return (annotatedSceneState: AnnotatedSceneState) => {
			let messages = [...annotatedSceneState.messages, message]
			return new AnnotatedSceneState({...annotatedSceneState, messages: messages})
		}
	}

	@ActionReducer()
	removeMessage(messageId: string) {
		log.info("Removing UI Message", messageId)
		return (annotatedSceneState: AnnotatedSceneState) => {
			let messages = [...annotatedSceneState.messages]
			messages = messages.filter(it => it.id !== messageId)

			return new AnnotatedSceneState({...annotatedSceneState, messages: messages})
		}
	}

	@ActionReducer()
	toggleLiveMode() {
		log.info("Toggling live mode")
		return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
			...annotatedSceneState, liveModeEnabled: !annotatedSceneState.liveModeEnabled
		})
	}

	@ActionReducer()
	togglePlayMode() {
		log.info("Toggling play mode")
		return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
			...annotatedSceneState, playModeEnabled: !annotatedSceneState.playModeEnabled
		})
	}

	@ActionReducer()
	toggleUIMenuVisible() {
		log.info("Toggling UI Menu Visibility")
		return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
			...annotatedSceneState, uiMenuVisible: !annotatedSceneState.uiMenuVisible
		})
	}

	@ActionReducer()
	setUIMenuVisibility(visible:boolean) {
		log.info("Setting UI Menu Visibility", visible)
		return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
			...annotatedSceneState, uiMenuVisible: visible
		})
	}

	@ActionReducer()
	setShouldAnimate(shouldAnimate:boolean) {
		log.info("Setting should animate", shouldAnimate)
		return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
			...annotatedSceneState, shouldAnimate: shouldAnimate
		})
	}

	@ActionReducer()
	setCarPose(pose:Models.PoseMessage) {
		// log.info("Setting car pose", pose)
		return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
			...annotatedSceneState, carPose: pose
		})
	}

	@ActionReducer()
	setSceneInitialized(isInitialized:boolean) {
		log.info("Setting sceneInitialized", isInitialized)
		return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
			...annotatedSceneState, sceneInitialized: isInitialized
		})
	}

	@ActionReducer()
	setIsAnnotationsVisible(isVisible:boolean) {
	  log.info("Setting isAnnotationsVisible", isVisible)
    return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
      ...annotatedSceneState, isAnnotationsVisible: isVisible
    })
  }

  @ActionReducer()
  setIsImageScreensVisible(isVisible:boolean) {
    log.info("Setting isImageScreensVisible", isVisible)
    return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
      ...annotatedSceneState, isImageScreensVisible: isVisible
    })
  }

  @ActionReducer()
  setIsPointCloudVisible(isVisible:boolean) {
    log.info("Setting isPointCloudVisible", isVisible)
    return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
      ...annotatedSceneState, isPointCloudVisible: isVisible
    })
  }

  @ActionReducer()
  setIsDecorationsVisible(isVisible:boolean) {
    log.info("Setting isDecorationsVisible", isVisible)
    return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
      ...annotatedSceneState, isDecorationsVisible: isVisible
    })
  }

	@ActionReducer()
	setCarInitialized(isCarInitialized: boolean) {
		return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
			...annotatedSceneState, isCarInitialized
		})
	}

	@ActionReducer()
	setIsKioskUserDataLoaded(isLoaded:boolean) {
		log.info("Setting isKioskUserDataLoaded", isLoaded)
		return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
			...annotatedSceneState, isKioskUserDataLoaded: isLoaded
		})
	}

  @ActionReducer()
	setCameraPreference(cameraPreference:CameraType) {
    log.info("Setting camera preference", cameraPreference)
    return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
      ...annotatedSceneState, cameraPreference
    })
	}

	@ActionReducer()
	setCamera( camera: THREE.Camera ) {
		log.info("Setting camera")
		return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
			...annotatedSceneState, camera
		})
	}

	@ActionReducer()
	setPointOfInterest( pointOfInterest: THREE.Vector3 | null ) {
		return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
			...annotatedSceneState, pointOfInterest
		})
	}

	@ActionReducer()
	setAreaOfInterest( areaOfInterest: RangeSearch[] ) {
		return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
			...annotatedSceneState, areaOfInterest
		})
	}

	@ActionReducer()
	setRendererSize( rendererSize: { width: number, height: number } ) {
		return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
			...annotatedSceneState, rendererSize
		})
	}

	@ActionReducer()
	cameraIsOrbiting( isOrbiting: boolean ) {
		return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
			...annotatedSceneState, isOrbiting
		})
	}

	@ActionReducer()
	addLoadingTileManager( tileManager: TileManager ) {
		return (annotatedSceneState: AnnotatedSceneState) => {
			const loadingTileManagers = annotatedSceneState.loadingTileManagers
			return new AnnotatedSceneState({
				...annotatedSceneState, loadingTileManagers: loadingTileManagers.add(tileManager)
			})
		}
	}

	@ActionReducer()
	removeLoadingTileManager( tileManager: TileManager ) {
		return (annotatedSceneState: AnnotatedSceneState) => {
			const loadingTileManagers = annotatedSceneState.loadingTileManagers
			return new AnnotatedSceneState({
				...annotatedSceneState, loadingTileManagers: loadingTileManagers.delete(tileManager)
			})
		}
	}

	@ActionReducer()
	setMousePosition( mousePosition: { x: number, y: number } ) {
		return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
			...annotatedSceneState, mousePosition
		})
	}

  @ActionReducer()
	setCompassRosePosition(position:THREE.Vector3) {
    log.info("Setting compass rose position", position)
    return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
      ...annotatedSceneState, compassRosePosition: position
    })
	}

	@ActionReducer()
  setOrbitControlsTargetPoint(targetPoint:THREE.Vector3) {
    log.info("Setting orbit controls target point", targetPoint)
    return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
      ...annotatedSceneState, orbitControlsTargetPoint: targetPoint
    })
	}

	@ActionReducer()
	setPointCloudSuperTiles(superTiles:OrderedMap<string, SuperTile>) {
    // log.info("Setting point cloud super tiles.  Number of tiles", superTiles.size)

    let points = 0
    superTiles.forEach(st => points += st!.objectCount)

    const message = `Loaded ${superTiles.size} point tiles; ${points} points`
    // new StatusWindowActions().setMessage(StatusKey.TILE_MANAGER_POINT_STATS, message)

		return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
      ...annotatedSceneState, pointCloudSuperTiles: superTiles
    })
	}

  @ActionReducer()
  setAnnotationSuperTiles(superTiles:OrderedMap<string, SuperTile>) {
    // log.info("Setting annotation super tiles.  Number of tiles", superTiles.size)

    let annotations = 0
    superTiles.forEach(st => annotations += st!.objectCount)

    const message = `Loaded ${superTiles.size} annotation tiles; ${annotations} annotations`
    // new StatusWindowActions().setMessage(StatusKey.TILE_MANAGER_ANNOTATION_STATS, message)

    return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
      ...annotatedSceneState, annotationSuperTiles: superTiles
    })
  }

	@ActionReducer()
	addObjectToScene(object:THREE.Object3D) {
		log.info("Adding object to scene", object)
		return (annotatedSceneState: AnnotatedSceneState) => {
			const sceneObjects = annotatedSceneState.sceneObjects
			return new AnnotatedSceneState({
				...annotatedSceneState, sceneObjects: sceneObjects.add(object)
			})
		}
	}

	@ActionReducer()
	removeObjectFromScene(object:THREE.Object3D) {
		log.info("Removing object from scene")
		return (annotatedSceneState: AnnotatedSceneState) => {
			const sceneObjects = annotatedSceneState.sceneObjects
			return new AnnotatedSceneState({
				...annotatedSceneState, sceneObjects: sceneObjects.delete(object)
			})
		}
	}

  @ActionReducer()
	setVisibleLayers(visibleLayers:string[]) {
    log.info("Setting visible layers", visibleLayers)
    return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
      ...annotatedSceneState, visibleLayers: visibleLayers
    })
	}

	@ActionReducer()
  setIsAnnotationTileManagerEnabled(isEnabled:boolean) {
    log.info("Setting isAnnotationTileManagerEnabled", isEnabled)
    return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
      ...annotatedSceneState, isAnnotationTileManagerEnabled: isEnabled
    })
	}

}
