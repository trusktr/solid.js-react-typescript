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
import {FlyThroughState} from "@/mapper-annotated-scene/src/models/FlyThroughState";

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
        console.log("Loading app state data from local storage")

        const defaultState = {
            messages: Array<UIMessage>(),

            liveModeEnabled: true,
            playModeEnabled: true,


            flyThroughState: new FlyThroughState({} as FlyThroughState),

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
            areaOfInterest: [{
                minPoint: new THREE.Vector3(0, 0, 0),
                maxPoint: new THREE.Vector3(1, 1, 1)
            }, {minPoint: new THREE.Vector3(0, 0, 0), maxPoint: new THREE.Vector3(1, 1, 1)}],
            rendererSize: {width: 1, height: 1},

            sceneInitialized: false,

            compassRosePosition: new THREE.Vector3(0, 0, 0),

            isDecorationsVisible: false,
            isPointCloudVisible: true,
            isAnnotationsVisible: true,

            orbitControlsTargetPoint: new THREE.Vector3(0, 0, 0),
            annotationSuperTiles: OrderedMap<string, SuperTile>(),
            pointCloudSuperTiles: OrderedMap<string, SuperTile>(),

            sceneObjects: Set<THREE.Object3D>(),
            visibleLayers: [],
            isAnnotationTileManagerEnabled: false, // by default, do not include the AnnotationTileManager -- it's only needed for the Kiosk app

            isMouseDragging: false,
            isRotationModeActive: false,
            isConnectLeftNeighborMode: false,
            isConnectRightNeighborMode: false,
            isConnectFrontNeighborMode: false,
            isAddMarkerMode: false,
            isLiveMode: false,
            isAddConnectionMode: false,
            isJoinAnnotationMode: false,
            isControlKeyPressed: false,
            isShiftKeyPressed: false,
            isAddConflictOrDeviceMode: false,
            isMouseButtonPressed: false,

            cameraIsOrbiting: false,
            camera: null,
            isOrbiting: false,
            loadingTileManagers: Set<TileManager>(),
        }

        return (__annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState(defaultState)
    }

    @ActionReducer()
    setControlKeyPressed(isControlKeyPressed: boolean) {
        return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
            ...annotatedSceneState, isControlKeyPressed
        })
    }

    @ActionReducer()
    setShiftKeyPressed(isShiftKeyPressed: boolean) {
        return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
            ...annotatedSceneState, isShiftKeyPressed
        })
    }

    @ActionReducer()
    setAddMarkerMode(isAddMarkerMode: boolean) {
        return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
            ...annotatedSceneState, isAddMarkerMode
        })
    }

    @ActionReducer()
    setAddConnectionMode(isAddConnectionMode: boolean) {
        return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
            ...annotatedSceneState, isAddConnectionMode
        })
    }

    @ActionReducer()
    setConnectFrontNeighborMode(isConnectFrontNeighborMode: boolean) {
        return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
            ...annotatedSceneState, isConnectFrontNeighborMode
        })
    }

    @ActionReducer()
    setJoinAnnotationMode(isJoinAnnotationMode: boolean) {
        return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
            ...annotatedSceneState, isJoinAnnotationMode
        })
    }

    @ActionReducer()
    setConnectLeftNeighborMode(isConnectLeftNeighborMode: boolean) {
        return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
            ...annotatedSceneState, isConnectLeftNeighborMode
        })
    }

    @ActionReducer()
    setAddConflictOrDeviceMode(isAddConflictOrDeviceMode: boolean) {
        return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
            ...annotatedSceneState, isAddConflictOrDeviceMode
        })
    }

    @ActionReducer()
    setConnectRightNeighborMode(isConnectRightNeighborMode: boolean) {
        return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
            ...annotatedSceneState, isConnectRightNeighborMode
        })
    }

    // @ActionReducer()
    // updateFlyThroughState(flyThroughState: FlyThroughState) {
    // 	console.log("IN updateFlyThroughState")
    // 	return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
    // 		...annotatedSceneState, flyThroughState: new FlyThroughState(flyThroughState)
    // 	})
    // }

    @ActionReducer()
    addMessage(message: UIMessage) {
        console.log("Adding UI Message", message.id)
        return (annotatedSceneState: AnnotatedSceneState) => {
            let messages = [...annotatedSceneState.messages, message]
            return new AnnotatedSceneState({...annotatedSceneState, messages: messages})
        }
    }

    @ActionReducer()
    removeMessage(messageId: string) {
        console.log("Removing UI Message", messageId)
        return (annotatedSceneState: AnnotatedSceneState) => {
            let messages = [...annotatedSceneState.messages]
            messages = messages.filter(it => it.id !== messageId)

            return new AnnotatedSceneState({...annotatedSceneState, messages: messages})
        }
    }

    @ActionReducer()
    toggleLiveMode() {
        console.log("Toggling live mode")
        return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
            ...annotatedSceneState, liveModeEnabled: !annotatedSceneState.liveModeEnabled
        })
    }

    @ActionReducer()
    togglePlayMode() {
        console.log("Toggling play mode")
        return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
            ...annotatedSceneState, playModeEnabled: !annotatedSceneState.playModeEnabled
        })
    }

    @ActionReducer()
    toggleUIMenuVisible() {
        console.log("Toggling UI Menu Visibility")
        return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
            ...annotatedSceneState, uiMenuVisible: !annotatedSceneState.uiMenuVisible
        })
    }

    @ActionReducer()
    setUIMenuVisibility(visible: boolean) {
        console.log("Setting UI Menu Visibility", visible)
        return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
            ...annotatedSceneState, uiMenuVisible: visible
        })
    }

    @ActionReducer()
    setShouldAnimate(shouldAnimate: boolean) {
        console.log("Setting should animate", shouldAnimate)
        return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
            ...annotatedSceneState, shouldAnimate: shouldAnimate
        })
    }

    @ActionReducer()
    setCarPose(pose: Models.PoseMessage) {
        // console.log("Setting car pose", pose)
        console.log("Toggling UI Menu Visibility")
        return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
            ...annotatedSceneState, carPose: pose
        })
    }

    @ActionReducer()
    setSceneInitialized(isInitialized: boolean) {
        console.log("Setting sceneInitialized", isInitialized)
        return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
            ...annotatedSceneState, sceneInitialized: isInitialized
        })
    }

    @ActionReducer()
    setIsAnnotationsVisible(isVisible: boolean) {
        console.log("Setting isAnnotationsVisible", isVisible)
        return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
            ...annotatedSceneState, isAnnotationsVisible: isVisible
        })
    }

    @ActionReducer()
    setIsPointCloudVisible(isVisible: boolean) {
        console.log("Setting isPointCloudVisible", isVisible)
        return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
            ...annotatedSceneState, isPointCloudVisible: isVisible
        })
    }

    @ActionReducer()
    setIsDecorationsVisible(isVisible: boolean) {
        console.log("Setting isDecorationsVisible", isVisible)
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
    setIsKioskUserDataLoaded(isLoaded: boolean) {
        console.log("Setting isKioskUserDataLoaded", isLoaded)
        return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
            ...annotatedSceneState, isKioskUserDataLoaded: isLoaded
        })
    }

    @ActionReducer()
    setCameraPreference(cameraPreference: CameraType) {
        console.log("Setting camera preference", cameraPreference)
        return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
            ...annotatedSceneState, cameraPreference
        })
    }

    @ActionReducer()
    setCamera(camera: THREE.Camera) {
        console.log("Setting camera")
        return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
            ...annotatedSceneState, camera
        })
    }

    @ActionReducer()
    setPointOfInterest(pointOfInterest: THREE.Vector3 | null) {
        console.log("IN setPointOfInterest")
        return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
            ...annotatedSceneState, pointOfInterest
        })
    }

    @ActionReducer()
    setAreaOfInterest(areaOfInterest: RangeSearch[]) {
        console.log("IN setAreaOfInterest")
        return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
            ...annotatedSceneState, areaOfInterest
        })
    }

    @ActionReducer()
    setRendererSize(rendererSize: { width: number, height: number }) {
        console.log("IN setRendererSize")
        return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
            ...annotatedSceneState, rendererSize
        })
    }

    @ActionReducer()
    cameraIsOrbiting(isOrbiting: boolean) {
        console.log("IN cameraIsOrbiting")
        return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
            ...annotatedSceneState, isOrbiting
        })
    }

    @ActionReducer()
    addLoadingTileManager(tileManager: TileManager) {
        console.log("IN addLoadingTileManager")
        return (annotatedSceneState: AnnotatedSceneState) => {
            const loadingTileManagers = annotatedSceneState.loadingTileManagers
            return new AnnotatedSceneState({
                ...annotatedSceneState, loadingTileManagers: loadingTileManagers.add(tileManager)
            })
        }
    }

    @ActionReducer()
    removeLoadingTileManager(tileManager: TileManager) {
        console.log("IN removeLoadingTileManager")
        return (annotatedSceneState: AnnotatedSceneState) => {
            const loadingTileManagers = annotatedSceneState.loadingTileManagers
            return new AnnotatedSceneState({
                ...annotatedSceneState, loadingTileManagers: loadingTileManagers.delete(tileManager)
            })
        }
    }

    @ActionReducer()
    setMousePosition(mousePosition: { x: number, y: number }) {
        console.log("IN setMousePosition")
        return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
            ...annotatedSceneState, mousePosition
        })
    }

    @ActionReducer()
    setCompassRosePosition(position: THREE.Vector3) {
        console.log("Setting compass rose position", position)
        return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
            ...annotatedSceneState, compassRosePosition: position
        })
    }

    @ActionReducer()
    setOrbitControlsTargetPoint(targetPoint: THREE.Vector3) {
        console.log("Setting orbit controls target point", targetPoint)
        return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
            ...annotatedSceneState, orbitControlsTargetPoint: targetPoint
        })
    }

    @ActionReducer()
    setPointCloudSuperTiles(superTiles: OrderedMap<string, SuperTile>) {
        // console.log("Setting point cloud super tiles.  Number of tiles", superTiles.size)
        console.log("IN setPointCloudSuperTiles")
        let points = 0
        superTiles.forEach(st => points += st!.objectCount)


        const message = `Loaded ${superTiles.size} point tiles; ${points} points`
        // new StatusWindowActions().setMessage(StatusKey.TILE_MANAGER_POINT_STATS, message)

        return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
            ...annotatedSceneState, pointCloudSuperTiles: superTiles
        })
    }

    @ActionReducer()
    setAnnotationSuperTiles(superTiles: OrderedMap<string, SuperTile>) {
        // console.log("Setting annotation super tiles.  Number of tiles", superTiles.size)
        console.log("IN setAnnotationSuperTiles")
        let annotations = 0
        superTiles.forEach(st => annotations += st!.objectCount)

        const message = `Loaded ${superTiles.size} annotation tiles; ${annotations} annotations`
        // new StatusWindowActions().setMessage(StatusKey.TILE_MANAGER_ANNOTATION_STATS, message)

        return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
            ...annotatedSceneState, annotationSuperTiles: superTiles
        })
    }

    @ActionReducer()
    addObjectToScene(object: THREE.Object3D) {
        console.log("Adding object to scene", object)
        return (annotatedSceneState: AnnotatedSceneState) => {
            const sceneObjects = annotatedSceneState.sceneObjects
            return new AnnotatedSceneState({
                ...annotatedSceneState, sceneObjects: sceneObjects.add(object)
            })
        }
    }

    @ActionReducer()
    removeObjectFromScene(object: THREE.Object3D) {
        console.log("Removing object from scene")
        return (annotatedSceneState: AnnotatedSceneState) => {
            const sceneObjects = annotatedSceneState.sceneObjects
            return new AnnotatedSceneState({
                ...annotatedSceneState, sceneObjects: sceneObjects.delete(object)
            })
        }
    }

    @ActionReducer()
    setVisibleLayers(visibleLayers: string[]) {
        console.log("Setting visible layers", visibleLayers)
        return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
            ...annotatedSceneState, visibleLayers: visibleLayers
        })
    }

    @ActionReducer()
    setIsAnnotationTileManagerEnabled(isEnabled: boolean) {
        console.log("Setting isAnnotationTileManagerEnabled", isEnabled)
        return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
            ...annotatedSceneState, isAnnotationTileManagerEnabled: isEnabled
        })

    }

}
