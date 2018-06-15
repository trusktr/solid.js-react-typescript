import config from '@/config'
import {ActionFactory, ActionMessage, ActionReducer} from "typedux"
import RoadNetworkEditorState from "annotator-z-hydra-shared/src/store/state/RoadNetworkEditorState"
import LineSegment from "annotator-z-hydra-shared/src/models/LineSegment"
import UIMessage from "annotator-z-hydra-shared/src/models/UIMessage"
import {getRoadSegments, getVertices} from "annotator-z-hydra-shared/src/services/RoadNetworkService"
import RoadnetworkVertex from "annotator-z-hydra-shared/src/models/RoadnetworkVertex"
import Logger from "@/util/log";

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
		log.info("Loading roadEditorState data from local storage")

		const defaultState = {
			messages: Array<UIMessage>(),
			lineSegments: new Map<string, LineSegment>(),
			vertices: new Map<string, RoadnetworkVertex>(),
			unpublishedLineSegments: new Map<string, LineSegment>(),
			creationModeEnabled: false,
			segmentSelectionModeEnabled: false,
			selectedLineSegment: null,
			selectedVertex: null,
			startingPoint: null,
			previousPoint: null,
			mapStyle: 'streets',

			liveModeEnabled: true,
			playModeEnabled: true,


			flyThroughState: {
				enabled: false,
				trajectories: [],
				currentTrajectoryIndex: 0,
				currentPoseIndex: 0,
				endPoseIndex: 0,
			},

			statusWindowState: {
				enabled: !!config.get('startup.show_status_panel'),
				messages: new Map<string, string>()
			},

			uiMenuVisible: config.get('startup.show_menu')


		}

		return (roadEditorState: RoadNetworkEditorState) => new RoadNetworkEditorState(defaultState)
	}

	@ActionReducer()
	queueSegmentToCreate(segment: LineSegment) {
		log.info("Queueing segment to create", segment.id)
		return (roadEditorState: RoadNetworkEditorState) => {
			let unpublishedLineSegments = new Map([...roadEditorState.unpublishedLineSegments]) as Map<string, LineSegment>
			unpublishedLineSegments.set(segment.id, segment)

			return new RoadNetworkEditorState({...roadEditorState, unpublishedLineSegments: unpublishedLineSegments})
		}
	}

	@ActionReducer()
	removeUnpublishedSegments(segmentsToRemove: Map<string, LineSegment>) {
		log.info("Removing segments from unpublished map")
		return (roadEditorState: RoadNetworkEditorState) => {
			const existingUnpublishedSegments = new Map([...roadEditorState.unpublishedLineSegments]) as Map<string, LineSegment>
			segmentsToRemove.forEach(segment => existingUnpublishedSegments.delete(segment.id))

			return new RoadNetworkEditorState({
				...roadEditorState,
				unpublishedLineSegments: existingUnpublishedSegments
			})
		}
	}

	@ActionReducer()
	removePublishedSegment(segmentId: string) {
		log.info("Removing published segment id", segmentId)
		return (roadEditorState: RoadNetworkEditorState) => {
			const publishedSegments = new Map([...roadEditorState.lineSegments])
			publishedSegments.delete(segmentId)
			return new RoadNetworkEditorState({...roadEditorState, lineSegments: publishedSegments})
		}
	}

	/**
	 * Retrieve line segments inside the given coordinates
	 * @param {number} longitudeA
	 * @param {number} latitudeA
	 * @param {number} longitudeB
	 * @param {number} latitudeB
	 * @returns {Promise<Map<number, LineSegment>>}
	 */
	async retrieveLineSegments(longitudeA: number, latitudeA: number, longitudeB: number, latitudeB: number) {
		log.info("Retrieving line segments")
		const lineSegments = await getRoadSegments(longitudeA, latitudeA, longitudeB, latitudeB)

		new RoadNetworkEditorActions().setLineSegments(lineSegments)
		return lineSegments
	}

	/**
	 * This method does NOT MERGE, it overwrites the existing line segments
	 * @param {Map<string, LineSegment>} lineSegments
	 * @returns {(roadEditorState: RoadNetworkEditorState) => RoadNetworkEditorState}
	 */
	@ActionReducer()
	setLineSegments(lineSegments: Map<string, LineSegment>) {
		log.info("Setting line segments", lineSegments.size)
		return (roadEditorState: RoadNetworkEditorState) => new RoadNetworkEditorState({
			...roadEditorState,
			lineSegments: lineSegments
		})
	}

	@ActionReducer()
	addLineSegments(lineSegments: Map<string, LineSegment>) {
		log.debug("Adding line segments", lineSegments.size)
		return (roadEditorState: RoadNetworkEditorState) => {
			let existingLineSegments = new Map([...roadEditorState.lineSegments])

			lineSegments.forEach((value, key) => {
				existingLineSegments.set(key, value)
			})

			return new RoadNetworkEditorState({...roadEditorState, lineSegments: existingLineSegments})
		}
	}


	/**
	 * Retrieve vertices inside the given coordinates
	 * @param {number} longitudeA
	 * @param {number} latitudeA
	 * @param {number} longitudeB
	 * @param {number} latitudeB
	 * @returns {Promise<Map<number, RoadNetworkVertex>>}
	 */
	async retrieveVertices(longitudeA: number, latitudeA: number, longitudeB: number, latitudeB: number) {
		log.info("Retrieving vertices")
		const vertices = await getVertices(longitudeA, latitudeA, longitudeB, latitudeB)

		new RoadNetworkEditorActions().setVertices(vertices)
		return vertices
	}

	/**
	 * This method does NOT MERGE, it overwrites the existing vertices
	 * @param {Map<string, Vertex>} vertices
	 * @returns {(roadEditorState: RoadNetworkEditorState) => RoadNetworkEditorState}
	 */
	@ActionReducer()
	setVertices(vertices: Map<string, RoadnetworkVertex>) {
		log.info("Setting vertices", vertices.size)
		return (roadEditorState: RoadNetworkEditorState) => new RoadNetworkEditorState({
			...roadEditorState,
			vertices: vertices
		})
	}

	@ActionReducer()
	setCreationMode(creationMode: boolean) {
		log.info("Setting creation mode", creationMode)
		return (roadEditorState: RoadNetworkEditorState) => new RoadNetworkEditorState({
			...roadEditorState,
			creationModeEnabled: creationMode
		})
	}

	@ActionReducer()
	setSegmentSelectionMode(selectionModeEnabled: boolean) {
		log.info("Setting selection mode", selectionModeEnabled)
		return (roadEditorState: RoadNetworkEditorState) => new RoadNetworkEditorState({
			...roadEditorState,
			segmentSelectionModeEnabled: selectionModeEnabled
		})
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
	setSelectedLineSegment(segment: LineSegment) {
		log.info("Setting selected line segment", segment.id)
		return (roadEditorState: RoadNetworkEditorState) => new RoadNetworkEditorState({
			...roadEditorState, selectedLineSegment: segment
		})
	}

	@ActionReducer()
	resetSelectedLineSegment() {
		log.info("Resetting selected line segment")
		return (roadEditorState: RoadNetworkEditorState) => new RoadNetworkEditorState({
			...roadEditorState, selectedLineSegment: null
		})
	}

	@ActionReducer()
	setSelectedVertex(vertex: RoadnetworkVertex) {
		log.info("Setting selected vertex", vertex.id)
		return (roadEditorState: RoadNetworkEditorState) => new RoadNetworkEditorState({
			...roadEditorState, selectedVertex: vertex
		})
	}

	@ActionReducer()
	resetSelectedVertex() {
		log.info("Resetting selected vertex")
		return (roadEditorState: RoadNetworkEditorState) => new RoadNetworkEditorState({
			...roadEditorState, selectedVertex: null
		})
	}

	@ActionReducer()
	setStartingPoint(vertex: RoadnetworkVertex) {
		log.info("Setting starting point", vertex.id)
		return (roadEditorState: RoadNetworkEditorState) => new RoadNetworkEditorState({
			...roadEditorState, startingPoint: vertex
		})
	}

	@ActionReducer()
	setPreviousPoint(vertex: RoadnetworkVertex) {
		log.info("Setting previous point", vertex.id)
		return (roadEditorState: RoadNetworkEditorState) => new RoadNetworkEditorState({
			...roadEditorState, previousPoint: vertex
		})
	}

	@ActionReducer()
	resetMapSelections() {
		log.info("Resetting map selections")
		return (roadEditorState: RoadNetworkEditorState) => new RoadNetworkEditorState({
			...roadEditorState,
			selectedLineSegment: null,
			selectedVertex: null,
			startingPoint: null,
			previousPoint: null,
		})
	}

	@ActionReducer()
	setMapStyle(style: string) {
		log.info("Toggling satellite map style")
		return (roadEditorState: RoadNetworkEditorState) => new RoadNetworkEditorState({
			...roadEditorState, mapStyle: style
		})
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





}
