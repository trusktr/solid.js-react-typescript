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
import {RangeSearch} from "../../../tile-model/RangeSearch";
import {TileManager} from '../../../tile/TileManager'
import {Set} from "immutable";
import MousePosition from '@/mapper-annotated-scene/src/models/MousePosition'

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

        const defaultState = {
            messages: Array<UIMessage>(),

            isLiveMode: false,
            isPlayMode: false,
            flyThroughEnabled: true,

            statusWindowState: {
                enabled: !!config['startup.show_status_panel'],
                messages: new Map<string, string>()
            },

            uiMenuVisible: config['startup.show_menu'],
            shouldAnimate: false,
            carPose: null,
            isCarInitialized: false,
            isInitialOriginSet: false,

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
			isTransformControlsAttached: false,

            orbitControlsTargetPoint: new THREE.Vector3(0, 0, 0),
            annotationSuperTiles: OrderedMap<string, SuperTile>(),
            pointCloudSuperTiles: OrderedMap<string, SuperTile>(),

            sceneObjects: Set<THREE.Object3D>(),
			sceneStage: new THREE.Vector3(0, 0, 0),
            visibleLayers: [],
            isAnnotationTileManagerEnabled: false, // by default, do not include the AnnotationTileManager -- it's only needed for the Kiosk app

            isMouseDragging: false,
			mousePosition: { x: 0, y: 0 },
            isRotationModeActive: false,
            isConnectLeftNeighborMode: false,
            isConnectRightNeighborMode: false,
            isConnectFrontNeighborMode: false,
            isAddMarkerMode: false,
            isAddConnectionMode: false,
            isJoinAnnotationMode: false,
            isControlKeyPressed: false,
            isShiftKeyPressed: false,
            isAddConflictOrDeviceMode: false,
            isMouseButtonPressed: false,
			numberKeyPressed: null,
			isHoveringOnMarker: false,

			transformedObjects: null,
			transformControlsMode: 'translate',

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

    @ActionReducer()
    toggleRotationModeActive() {
        return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
            ...annotatedSceneState, isRotationModeActive: !annotatedSceneState.isRotationModeActive
        })
    }

    @ActionReducer()
    setTransformControlsAttached(isTransformControlsAttached: boolean) {
        return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
            ...annotatedSceneState, isTransformControlsAttached
        })
    }

    @ActionReducer()
    setNumberKeyPressed(numberKeyPressed: number | null) {
        return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
            ...annotatedSceneState, numberKeyPressed
        })
    }

    @ActionReducer()
    isHoveringOnMarker(isHoveringOnMarker: boolean) {
        return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
            ...annotatedSceneState, isHoveringOnMarker
        })
    }

    @ActionReducer()
    setTransformedObjects(transformedObjects: Array<THREE.Object3D>) {
        return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
            ...annotatedSceneState, transformedObjects
        })
    }

    @ActionReducer()
    setTransformControlsMode(transformControlsMode: string) {
        return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
            ...annotatedSceneState, transformControlsMode
        })
    }

    @ActionReducer()
    setSceneStage(sceneStage: THREE.Vector3) {
        return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
            ...annotatedSceneState, sceneStage
        })
    }

    @ActionReducer()
    addMessage(message: UIMessage) {
        return (annotatedSceneState: AnnotatedSceneState) => {
            let messages = [...annotatedSceneState.messages, message]
            return new AnnotatedSceneState({...annotatedSceneState, messages: messages})
        }
    }

    @ActionReducer()
    removeMessage(messageId: string) {
        return (annotatedSceneState: AnnotatedSceneState) => {
            let messages = [...annotatedSceneState.messages]
            messages = messages.filter(it => it.id !== messageId)

            return new AnnotatedSceneState({...annotatedSceneState, messages: messages})
        }
    }

    @ActionReducer()
    toggleLiveMode() {
        return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
            ...annotatedSceneState, isLiveMode: !annotatedSceneState.isLiveMode
        })
    }

    @ActionReducer()
    togglePlayMode() {
        return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
            ...annotatedSceneState, isPlayMode: !annotatedSceneState.isPlayMode
        })
    }

    @ActionReducer()
    setPlayMode(isEnabled:boolean) {
        return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
            ...annotatedSceneState, isPlayMode: isEnabled
        })
    }

    @ActionReducer()
    toggleUIMenuVisible() {
        return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
            ...annotatedSceneState, uiMenuVisible: !annotatedSceneState.uiMenuVisible
        })
    }

    @ActionReducer()
    setUIMenuVisibility(visible: boolean) {
        return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
            ...annotatedSceneState, uiMenuVisible: visible
        })
    }

    @ActionReducer()
    setShouldAnimate(shouldAnimate: boolean) {
        return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
            ...annotatedSceneState, shouldAnimate: shouldAnimate
        })
    }

    @ActionReducer()
    setCarPose(pose: Models.PoseMessage) {
        return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
            ...annotatedSceneState, carPose: pose
        })
    }

    @ActionReducer()
    setSceneInitialized(isInitialized: boolean) {
        return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
            ...annotatedSceneState, sceneInitialized: isInitialized
        })
    }

    @ActionReducer()
    setIsAnnotationsVisible(isVisible: boolean) {
        return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
            ...annotatedSceneState, isAnnotationsVisible: isVisible
        })
    }

    @ActionReducer()
    setIsPointCloudVisible(isVisible: boolean) {
        return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
            ...annotatedSceneState, isPointCloudVisible: isVisible
        })
    }

    @ActionReducer()
    setIsDecorationsVisible(isVisible: boolean) {
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
    setInitialOriginSet(isInitialOriginSet: boolean) {
        return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
            ...annotatedSceneState, isInitialOriginSet
        })
    }

    @ActionReducer()
    setCameraPreference(cameraPreference: CameraType) {
        return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
            ...annotatedSceneState, cameraPreference
        })
    }

    @ActionReducer()
    setCamera(camera: THREE.Camera) {
        return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
            ...annotatedSceneState, camera
        })
    }

    @ActionReducer()
    setPointOfInterest(pointOfInterest: THREE.Vector3 | null) {
        return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
            ...annotatedSceneState, pointOfInterest
        })
    }

    @ActionReducer()
    setAreaOfInterest(areaOfInterest: RangeSearch[]) {
        return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
            ...annotatedSceneState, areaOfInterest
        })
    }

    @ActionReducer()
    setRendererSize(rendererSize: { width: number, height: number }) {
        return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
            ...annotatedSceneState, rendererSize
        })
    }

    @ActionReducer()
    cameraIsOrbiting(isOrbiting: boolean) {
        return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
            ...annotatedSceneState, isOrbiting
        })
    }

    @ActionReducer()
    addLoadingTileManager(tileManager: TileManager) {
        return (annotatedSceneState: AnnotatedSceneState) => {
            const loadingTileManagers = annotatedSceneState.loadingTileManagers
            return new AnnotatedSceneState({
                ...annotatedSceneState, loadingTileManagers: loadingTileManagers.add(tileManager)
            })
        }
    }

    @ActionReducer()
    removeLoadingTileManager(tileManager: TileManager) {
        return (annotatedSceneState: AnnotatedSceneState) => {
            const loadingTileManagers = annotatedSceneState.loadingTileManagers
            return new AnnotatedSceneState({
                ...annotatedSceneState, loadingTileManagers: loadingTileManagers.delete(tileManager)
            })
        }
    }

    @ActionReducer()
    setMousePosition(mousePosition: MousePosition) {
        return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
            ...annotatedSceneState, mousePosition
        })
    }

    @ActionReducer()
    setCompassRosePosition(position: THREE.Vector3) {
        return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
            ...annotatedSceneState, compassRosePosition: position
        })
    }

    @ActionReducer()
    setOrbitControlsTargetPoint(targetPoint: THREE.Vector3) {
        return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
            ...annotatedSceneState, orbitControlsTargetPoint: targetPoint
        })
    }

    @ActionReducer()
    setPointCloudSuperTiles(superTiles: OrderedMap<string, SuperTile>) {
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
        return (annotatedSceneState: AnnotatedSceneState) => {
            const sceneObjects = annotatedSceneState.sceneObjects
            return new AnnotatedSceneState({
                ...annotatedSceneState, sceneObjects: sceneObjects.add(object)
            })
        }
    }

    @ActionReducer()
    removeObjectFromScene(object: THREE.Object3D) {
        return (annotatedSceneState: AnnotatedSceneState) => {
            const sceneObjects = annotatedSceneState.sceneObjects
            return new AnnotatedSceneState({
                ...annotatedSceneState, sceneObjects: sceneObjects.delete(object)
            })
        }
    }

    @ActionReducer()
    setVisibleLayers(visibleLayers: string[]) {
        return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
            ...annotatedSceneState, visibleLayers: visibleLayers
        })
    }

    @ActionReducer()
    setIsAnnotationTileManagerEnabled(isEnabled: boolean) {
        return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
            ...annotatedSceneState, isAnnotationTileManagerEnabled: isEnabled
        })

    }

    @ActionReducer()
    setFlyThroughEnabled(isEnabled: boolean) {
        return (annotatedSceneState: AnnotatedSceneState) => new AnnotatedSceneState({
            ...annotatedSceneState, flyThroughEnabled: isEnabled
        })
    }

}
