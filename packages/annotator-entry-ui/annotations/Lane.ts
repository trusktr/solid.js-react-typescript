/**
 *  Copyright 2017 Mapper Inc. Part of the mapper-annotator project.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as THREE from 'three'
import * as TypeLogger from 'typelogger'
import * as $ from 'jquery'
import * as lodash from 'lodash'
import {
	AnnotationUuid, Annotation, AnnotationRenderingProperties,
	AnnotationJsonOutputInterface, AnnotationJsonInputInterface,
	AnnotationGeometryType
} from './AnnotationBase'
import {AnnotationType} from "./AnnotationType"
import {isNullOrUndefined} from "util"

// tslint:disable-next-line:no-any
TypeLogger.setLoggerOutput(console as any)
const log = TypeLogger.getLogger(__filename)

const directionGeometry = new THREE.Geometry()
directionGeometry.vertices.push(new THREE.Vector3(-0.25, 0.25,  0.5))
directionGeometry.vertices.push(new THREE.Vector3( 0.25, 0.25,  0))
directionGeometry.vertices.push(new THREE.Vector3(-0.25, 0.25, -0.5))
directionGeometry.faces.push(new THREE.Face3(0, 1, 2))
directionGeometry.computeFaceNormals()

const directionGeometryMaterial = new THREE.MeshLambertMaterial({color: 0xff0000, side: THREE.DoubleSide})

export enum LaneType {
	UNKNOWN = 0,
	ALL_VEHICLES,
	MOTOR_VEHICLES,
	CAR_ONLY,
	TRUCK_ONLY,
	BUS_ONLY,
	BIKE_ONLY,
	PEDESTRIAN_ONLY,
	PARKING,
	CROSSWALK,
	OTHER
}

export enum NeighborDirection {
	SAME = 1,
	REVERSE
}

export enum NeighborLocation {
	FRONT = 1,
	BACK,
	LEFT,
	RIGHT
}

export enum LaneLineType {
	UNKNOWN = 0,
	SOLID,
	DASHED,
	OTHER
}

export enum LaneLineColor {
	UNKNOWN = 0,
	WHITE,
	YELLOW,
	RED,
	BLUE,
	OTHER
}

export enum LaneEntryExitType {
	UNKNOWN = 0,
	CONTINUE,
	STOP
}

export class LaneNeighborsIds {
	right: Array<AnnotationUuid>
	left: Array<AnnotationUuid>
	front: Array<AnnotationUuid>
	back: Array<AnnotationUuid>

	constructor() {
		this.right = []
		this.left = []
		this.front = []
		this.back = []
	}
}

class LaneRenderingProperties {
	color: number
	markerMaterial: THREE.MeshLambertMaterial
	activeMaterial: THREE.MeshBasicMaterial
	inactiveMaterial: THREE.MeshLambertMaterial
	centerLineMaterial: THREE.LineDashedMaterial
	trajectoryMaterial: THREE.MeshLambertMaterial
	liveModeMaterial: THREE.MeshLambertMaterial

	constructor(color: number) {
		this.color = color
		this.markerMaterial = new THREE.MeshLambertMaterial({color: 0xffffff, side: THREE.DoubleSide})
		this.activeMaterial = new THREE.MeshBasicMaterial({color: "orange", wireframe: true})
		this.inactiveMaterial = new THREE.MeshLambertMaterial({color: this.color, side: THREE.DoubleSide})
		this.trajectoryMaterial = new THREE.MeshLambertMaterial({color: 0x000000, side: THREE.DoubleSide})
		this.centerLineMaterial = new THREE.LineDashedMaterial({color: 0xffaa00, dashSize: 3, gapSize: 1, linewidth: 2})
		this.liveModeMaterial = new THREE.MeshLambertMaterial({color: 0x443333, transparent: true, opacity: 0.3, side: THREE.DoubleSide})
	}
}

// support for legacy data files
export interface LaneJsonInputInterfaceV1 {
	uuid: AnnotationUuid
	type: number
	markerPositions: Array<THREE.Vector3>
	neighborsIds: LaneNeighborsIds
	leftSideType: LaneLineType
	rightSideType: LaneLineType
	entryType: LaneEntryExitType
	exitType: LaneEntryExitType
}

export interface LaneJsonInputInterfaceV3 extends AnnotationJsonInputInterface {
	laneType: string
	neighborsIds: LaneNeighborsIds
	leftLineType: string
	leftLineColor: string
	rightLineType: string
	rightLineColor: string
	entryType: string
	exitType: string
}

export interface LaneJsonOutputInterfaceV3 extends AnnotationJsonOutputInterface {
	laneType: string
	neighborsIds: LaneNeighborsIds
	leftLineType: string
	leftLineColor: string
	rightLineType: string
	rightLineColor: string
	entryType: string
	exitType: string
	// Waypoints are generated from markers. They are included in output for downstream
	// convenience, but we don't read them back in.
	waypoints: Array<Object>
}

/**
 * LaneAnnotation class.
 */
export class Lane extends Annotation {
	// Lane markers are stored in an array as [right, left, right, left, ...]
	annotationType: AnnotationType
	geometryType: AnnotationGeometryType
	type: LaneType
	minimumMarkerCount: number
	allowNewMarkers: boolean
	snapToGround: boolean
	private renderingProperties: LaneRenderingProperties
	waypoints: Array<THREE.Vector3>
	denseWaypoints: Array<THREE.Vector3>
	laneCenterLine: THREE.Line
	laneLeftLine: THREE.Line
	laneRightLine: THREE.Line
	laneDirectionMarkers: Array<THREE.Mesh>
	mesh: THREE.Mesh
	neighborsIds: LaneNeighborsIds
	leftLineType: LaneLineType
	leftLineColor: LaneLineColor
	rightLineType: LaneLineType
	rightLineColor: LaneLineColor
	entryType: LaneEntryExitType
	exitType: LaneEntryExitType
	inTrajectory: boolean

	constructor(obj?: LaneJsonInputInterfaceV3) {
		super(obj)
		this.annotationType = AnnotationType.LANE
		this.geometryType = AnnotationGeometryType.PAIRED_LINEAR
		if (obj) {
			this.type = isNullOrUndefined(LaneType[obj.laneType]) ? LaneType.UNKNOWN : LaneType[obj.laneType]
			this.neighborsIds = obj.neighborsIds
			if (this.neighborsIds.right === null) this.neighborsIds.right = []
			if (this.neighborsIds.left === null) this.neighborsIds.left = []
			if (this.neighborsIds.front === null) this.neighborsIds.front = []
			if (this.neighborsIds.back === null) this.neighborsIds.back = []
			this.leftLineType = isNullOrUndefined(LaneLineType[obj.leftLineType]) ? LaneLineType.UNKNOWN : LaneLineType[obj.leftLineType]
			this.rightLineType = isNullOrUndefined(LaneLineType[obj.rightLineType]) ? LaneLineType.UNKNOWN : LaneLineType[obj.rightLineType]
			this.leftLineColor = isNullOrUndefined(LaneLineColor[obj.leftLineColor]) ? LaneLineColor.UNKNOWN : LaneLineColor[obj.leftLineColor]
			this.rightLineColor = isNullOrUndefined(LaneLineColor[obj.rightLineColor]) ? LaneLineColor.UNKNOWN : LaneLineColor[obj.rightLineColor]
			this.entryType = isNullOrUndefined(LaneEntryExitType[obj.entryType]) ? LaneEntryExitType.UNKNOWN : LaneEntryExitType[obj.entryType]
			this.exitType = isNullOrUndefined(LaneEntryExitType[obj.exitType]) ? LaneEntryExitType.UNKNOWN : LaneEntryExitType[obj.exitType]
		} else {
			this.type = LaneType.UNKNOWN
			this.neighborsIds = new LaneNeighborsIds()
			this.leftLineType = LaneLineType.UNKNOWN
			this.rightLineType = LaneLineType.UNKNOWN
			this.leftLineColor = LaneLineColor.UNKNOWN
			this.rightLineColor = LaneLineColor.UNKNOWN
			this.entryType = LaneEntryExitType.UNKNOWN
			this.exitType = LaneEntryExitType.UNKNOWN
		}

		this.minimumMarkerCount = 4
		this.allowNewMarkers = true
		this.snapToGround = true
		const color = Math.random() * 0xffffff
		this.renderingProperties = new LaneRenderingProperties(color)
		this.mesh = new THREE.Mesh(new THREE.Geometry(), this.renderingProperties.activeMaterial)
		this.laneCenterLine = new THREE.Line(new THREE.Geometry(), this.renderingProperties.centerLineMaterial)
		this.laneLeftLine = new THREE.Line(new THREE.Geometry(), this.renderingProperties.centerLineMaterial)
		this.laneRightLine = new THREE.Line(new THREE.Geometry(), this.renderingProperties.centerLineMaterial)
		this.laneDirectionMarkers = []
		this.waypoints = []
		this.denseWaypoints = []
		this.inTrajectory = false

		if (obj) {
			if (obj.markers.length >= this.minimumMarkerCount) {
				obj.markers.forEach(position => this.addRawMarker(new THREE.Vector3(position.x, position.y, position.z)))
				if (!this.isValid())
					throw Error(`can't load invalid boundary with id ${obj.uuid}`)
				this.updateVisualization()
				this.makeInactive()
			}
		}

		// Group display objects so we can easily add them to the screen
		this.renderingObject.add(this.mesh)
		this.renderingObject.add(this.laneCenterLine)
		this.renderingObject.add(this.laneLeftLine)
		this.renderingObject.add(this.laneRightLine)
	}

	isValid(): boolean {
		return this.markers.length >= this.minimumMarkerCount
	}

	/**
	 * Add a single marker to the annotation and the scene.
	 * Assume that the caller will execute this.updateVisualization() as appropriate after this method returns.
	 */
	addRawMarker(position: THREE.Vector3): void {
		const marker = new THREE.Mesh(AnnotationRenderingProperties.markerPointGeometry, this.renderingProperties.markerMaterial)
		marker.position.set(position.x, position.y, position.z)
		this.markers.push(marker)
		this.renderingObject.add(marker)
	}

	/**
	 * Add marker. The behavior of this functions changes depending if this is the
	 * first, second, or higher indexed marker.
	 *      - First marker: is equivalent as calling addRawMarker
	 *      - Second marker: has it's height modified to match the height of the first marker
	 *      - Third and onwards: Two markers are added using the passed position and the
	 *                           position of the last two markers.
	 */
	addMarker(position: THREE.Vector3, updateVisualization: boolean): boolean {

		if (this.markers.length < 2) {
			// Add first 2 points in any order
			this.addRawMarker(position)
		} else {
			// From the third marker onwards, add markers in pairs by estimating the position
			// of the paired marker.
			const nextMarker = this.computeNextMarkerEstimatedPosition(position)
			this.addRawMarker(nextMarker)
			this.addRawMarker(position)
		}

		if (updateVisualization) this.updateVisualization()
		return true
	}

	/**
	 * Delete last marker(s).
	 */
	deleteLastMarker(): boolean {
		if (this.markers.length === 0) {
			return false
		}

		this.renderingObject.remove(this.markers.pop()!)

		if (this.markers.length > 2) {
			this.renderingObject.remove(this.markers.pop()!)
		}

		this.updateVisualization()

		return true
	}

	complete(): boolean {
		return true
	}

	/**
	 * Revers markers (=change lane direction)
	 */
	reverseMarkers(): boolean {
		// if less than 2 markers --> nothing to reverse
		if (this.markers.length < 2) {
			return false
		}

		// block reverse if lane connected with a front neighbour
		if (this.neighborsIds.front.length > 0) {
			log.error('Unable to reverse lane with connected front neighbour.')
			return false
		}

		// in place markers reverse
		this.markers.reverse()

		// flip left-right neighbours
		let aux = this.neighborsIds.left
		this.neighborsIds.left = this.neighborsIds.right
		this.neighborsIds.right = aux

		// update rendering
		this.updateVisualization()

		return true
	}

	/**
	 * Join this lane with given lane by copying it's content
	 */
	join(lane: Lane): boolean {

		if (!lane) {
			log.error('Can not join an empty lane.')
			return false
		}

		if (lane.uuid === this.uuid) {
			log.error('Lane can not join with itself.')
			return false
		}

		// add markers
		this.markers = this.markers.concat(lane.markers)
		lane.markers.forEach(marker => this.renderingObject.add(marker))

		// add neighbors:
		// - merge left-right neighbours
		// - replace front neighbours
		// - no modifications to back neighbours
		this.neighborsIds.front = lane.neighborsIds.front
		this.neighborsIds.left = lodash.uniq(this.neighborsIds.left.concat(lane.neighborsIds.left))
		this.neighborsIds.right = lodash.uniq(this.neighborsIds.right.concat(lane.neighborsIds.right))

		// solve properties conflicts
		// - replace exit type
		// - replace left/right line properties if not already set
		this.exitType = lane.exitType
		if (!this.leftLineType) this.leftLineType = lane.leftLineType
		if (!this.leftLineColor) this.leftLineColor = lane.leftLineColor
		if (!this.rightLineType) this.rightLineType = lane.rightLineType
		if (!this.rightLineColor) this.rightLineColor = lane.rightLineColor

		// update rendering
		this.updateVisualization()

		return true
	}

	/**
	 * Make this annotation active. This changes the displayed material.
	 */
	makeActive(): void {
		this.mesh.material = this.renderingProperties.activeMaterial
		this.laneCenterLine.visible = false
	}

	/**
	 * Make this annotation inactive. This changes the displayed material.
	 */
	makeInactive(): void {
		if (this.inTrajectory) {
			this.mesh.material = this.renderingProperties.trajectoryMaterial
		} else {
			this.mesh.material = this.renderingProperties.inactiveMaterial
		}
		this.laneCenterLine.visible = true
		this.unhighlightMarkers()
	}

	setLiveMode(): void {
		switch (this.type) {
			case LaneType.BIKE_ONLY:
				this.setBikeLaneLiveModeRendering()
				break
			case LaneType.CROSSWALK:
				this.setCrosswalkLiveModeRendering()
				break
			case LaneType.PARKING:
				this.setParkingLiveModeRendering()
				break
			default:
				this.setAllVehiclesLiveModeRendering()
		}

		this.markers.forEach((marker) => {
			marker.visible = false
		})

		this.mesh.material = this.renderingProperties.liveModeMaterial
	}

	unsetLiveMode(): void {
		this.markers.forEach((marker) => {
			marker.visible = true
		})
		if (this.type !== LaneType.CROSSWALK) {
			this.showDirectionMarkers()
		}
		this.makeInactive()
	}

	/**
	 * Recompute lane rendering components from marker positions and current lane properties.
	 */
	updateVisualization(): void {

		// First thing first, update lane width
		this.updateLaneWidth()

		// There is no mesh or side lines to compute if we don't have enough markers
		if (!this.isValid()) {
			return
		}

		// Update side lines first
		this.updateLaneSideLinesMaterial()
		this.updateLaneSideLinesGeometry()

		// Update lane mesh
		const newGeometry = new THREE.Geometry()

		// Add all vertices
		this.markers.forEach((marker) => {
			newGeometry.vertices.push(marker.position.clone())
		})

		// Add faces
		for (let i = 0; i < this.markers.length - 2; i++) {
			if (i % 2 === 0) {
				newGeometry.faces.push(new THREE.Face3(i + 2, i + 1, i))
			} else {
				newGeometry.faces.push(new THREE.Face3(i, i + 1, i + 2))
			}
		}

		newGeometry.computeFaceNormals()
		this.mesh.geometry = newGeometry
		this.mesh.geometry.verticesNeedUpdate = true

		// Generate center lane indication and direction markers
		this.computeWaypoints()

		if (this.type === LaneType.CROSSWALK) {
			this.hideDirectionMarkers()
			this.laneCenterLine.visible = false
		}
	}

	/**
	 * Add neighbor to our list of neighbors
	 */
	addNeighbor(neighborId: AnnotationUuid, neighborLocation: NeighborLocation): void {
		switch (neighborLocation) {
			case NeighborLocation.FRONT:
				this.neighborsIds.front.push(neighborId)
				this.neighborsIds.front = lodash.uniq(this.neighborsIds.front)
				break
			case NeighborLocation.BACK:
				this.neighborsIds.back.push(neighborId)
				this.neighborsIds.back = lodash.uniq(this.neighborsIds.back)
				break
			case NeighborLocation.LEFT:
				this.neighborsIds.left.push(neighborId)
				this.neighborsIds.left = lodash.uniq(this.neighborsIds.left)
				break
			case NeighborLocation.RIGHT:
				this.neighborsIds.right.push(neighborId)
				this.neighborsIds.right = lodash.uniq(this.neighborsIds.right)
				break
			default:
				log.warn('Neighbor location not recognized')
		}
	}

	/*
	 * Delete the neighbor if it exists on either side.
	 */
	deleteLeftOrRightNeighbor(neighborId: AnnotationUuid): boolean {

		let index = this.neighborsIds.right.indexOf(neighborId, 0)
		if (index > -1) {
			this.neighborsIds.right.splice(index, 1)
			return true
		}

		index = this.neighborsIds.left.indexOf(neighborId, 0)
		if (index > -1) {
			this.neighborsIds.left.splice(index, 1)
			return true
		}

		log.error("Non-reciprocal neighbor relation detected. This should never happen.")
		return false
	}

	deleteFrontNeighbor(neighborId: AnnotationUuid): boolean {
		const index = this.neighborsIds.front.findIndex((uuid) => {
			return uuid === neighborId
		})
		if (index >= 0) {
			this.neighborsIds.front.splice(index, 1)
			return true
		} else {
			log.error("Couldn't find connection to front neighbor. This should never happen.")
			return false
		}
	}

	deleteBackNeighbor(neighborId: AnnotationUuid): boolean {
		const index = this.neighborsIds.back.findIndex((uuid) => {
			return uuid === neighborId
		})
		if (index >= 0) {
			this.neighborsIds.back.splice(index, 1)
			return true
		} else {
			log.error("Couldn't find connection to back neighbor. This should never happen.")
			return false
		}
	}

	/**
	 * Make this annotation part of the car path
	 */
	setTrajectory(isTrajectoryActive: boolean): void {
		this.inTrajectory = isTrajectoryActive

		// Do not change the active lane
		if (!this.laneCenterLine.visible) {
			return
		}

		if (this.inTrajectory) {
			this.mesh.material = this.renderingProperties.trajectoryMaterial
		} else {
			this.mesh.material = this.renderingProperties.inactiveMaterial
		}
	}

	toJSON(pointConverter?: (p: THREE.Vector3) => Object): LaneJsonOutputInterfaceV3 {
		// Create data structure to export (this is the min amount of data
		// needed to reconstruct this object from scratch)
		const data: LaneJsonOutputInterfaceV3 = {
			annotationType: AnnotationType[AnnotationType.LANE],
			uuid: this.uuid,
			laneType: LaneType[this.type],
			leftLineType: LaneLineType[this.leftLineType],
			leftLineColor: LaneLineColor[this.leftLineColor],
			rightLineType: LaneLineType[this.rightLineType],
			rightLineColor: LaneLineColor[this.rightLineColor],
			entryType: LaneEntryExitType[this.entryType],
			exitType: LaneEntryExitType[this.exitType],
			neighborsIds: this.neighborsIds,
			markers: [],
			waypoints: [],
		}

		this.markers.forEach((marker) => {
			if (pointConverter) {
				data.markers.push(pointConverter(marker.position))
			} else {
				data.markers.push(marker.position)
			}
		})

		this.waypoints.forEach((waypoint) => {
			if (pointConverter) {
				data.waypoints.push(pointConverter(waypoint))
			} else {
				data.waypoints.push(waypoint)
			}
		})

		return data
	}

	tryTrajectory(trajectory: Array<THREE.Vector3>): void {
		// Remove points from lineDirection object
		this.laneDirectionMarkers.forEach((marker) => {
			this.renderingObject.remove(marker)
		})

		if (trajectory.length < 3) {
			return
		}

		for (let i = 1; i < trajectory.length - 1; i++) {
			const angle = Math.atan2(trajectory[i + 1].z - trajectory[i].z,
				trajectory[i + 1].x - trajectory[i].x)

			const marker = new THREE.Mesh(directionGeometry, directionGeometryMaterial)
			marker.position.set(trajectory[i].x, trajectory[i].y, trajectory[i].z)
			marker.rotateY(-angle)
			this.renderingObject.add(marker)
			this.laneDirectionMarkers.push(marker)
		}
	}

	getLaneWidth(): number {
		// If just one point or non --> lane width is 0
		if (this.markers.length < 2) {
			return 0.0
		}

		let sum: number = 0.0
		const markers = this.markers
		for (let i = 0; i < markers.length - 1; i += 2) {
			sum += markers[i].position.distanceTo(markers[i + 1].position)
		}
		return sum / (markers.length / 2)
	}

	// todo Annotator should ask for getLaneWidth() and update #lp_width_value for itself
	updateLaneWidth(): void {
		const laneWidth = $('#lp_width_value')
		laneWidth.text(this.getLaneWidth().toFixed(3) + " m")
	}

	/**
	 *  Use the last two points and a new "clicked" one to create a guess of
	 *  the location of the next marker
	 */
	private computeNextMarkerEstimatedPosition(P3: THREE.Vector3): THREE.Vector3 {
		// P3     ?     ?    P3
		// P1 -> P2 or P2 <- P1
		const lastIndex = this.markers.length
		const P1 = this.markers[lastIndex - 2].position
		const P2 = this.markers[lastIndex - 1].position
		const vectorP1ToP2 = new THREE.Vector3()
		vectorP1ToP2.subVectors(P1, P2)

		// P4 = P3 + V(P1,P2)
		const P4 = P3.clone()
		P4.add(vectorP1ToP2)

		return P4
	}

	private computeWaypoints(): void {
		// There must be at least 4 markers to compute waypoints
		if (this.markers.length < 4) {
			return
		}

		const points: Array<THREE.Vector3> = []
		for (let i = 0; i < this.markers.length - 1; i += 2) {
			const waypoint = this.markers[i].position.clone()
			waypoint.add(this.markers[i + 1].position).divideScalar(2)
			points.push(waypoint)
		}

		const distanceBetweenMarkers = 3.0 // in meters
		const spline = new THREE.CatmullRomCurve3(points)
		const numPoints = spline.getLength() / distanceBetweenMarkers
		this.waypoints = spline.getSpacedPoints(numPoints)

		const numPointsDense = spline.getLength() // sample every meter
		this.denseWaypoints = spline.getSpacedPoints(numPointsDense)

		this.updateLaneDirectionMarkers()

		// Change the line geometry
		const lineGeometry = new THREE.Geometry()
		const centerPoints = spline.getPoints(100)
		for (let i = 0; i < centerPoints.length; i++) {
			lineGeometry.vertices[i] = centerPoints[i]
			lineGeometry.vertices[i].y += 0.02
		}
		lineGeometry.computeLineDistances()
		this.laneCenterLine.geometry = lineGeometry
		this.laneCenterLine.geometry.verticesNeedUpdate = true

	}

	private updateLaneDirectionMarkers(): void {
		// Remove points from lineDirection object
		this.laneDirectionMarkers.forEach((marker) => {
			this.renderingObject.remove(marker)
		})

		if (this.waypoints.length < 3) {
			return
		}

		for (let i = 1; i < this.waypoints.length - 1; i++) {
			const angle = Math.atan2(
				this.waypoints[i + 1].z - this.waypoints[i].z,
				this.waypoints[i + 1].x - this.waypoints[i].x
			)

			const marker = new THREE.Mesh(directionGeometry, directionGeometryMaterial)
			marker.position.set(this.waypoints[i].x, this.waypoints[i].y, this.waypoints[i].z)
			marker.rotateY(-angle)
			this.renderingObject.add(marker)
			this.laneDirectionMarkers.push(marker)
		}
	}

	private hideDirectionMarkers(): void {
		this.laneDirectionMarkers.forEach( (m) => {
			m.visible = false;
		})
	}

	private showDirectionMarkers(): void {
		this.laneDirectionMarkers.forEach( (m) => {
			m.visible = true;
		})
	}

	private setCrosswalkLiveModeRendering(): void {
		// No direction markers, no center line, no side lines and yellow color
		this.hideDirectionMarkers()
		this.laneCenterLine.visible = false
		this.laneRightLine.visible = false
		this.laneLeftLine.visible = false
		this.renderingProperties.liveModeMaterial.color.setHex(0xaa6600)
	}

	private setParkingLiveModeRendering(): void {
		// No direction markers, no center line, no side lines and blue color
		this.hideDirectionMarkers()
		this.laneCenterLine.visible = false
		this.laneRightLine.visible = false
		this.laneLeftLine.visible = false
		this.renderingProperties.liveModeMaterial.color.setHex(0x3cb371)
	}

	private setBikeLaneLiveModeRendering(): void {
		// No direction markers, no center line, no side lines and green color
		this.hideDirectionMarkers()
		this.laneCenterLine.visible = false
		this.laneRightLine.visible = false
		this.laneLeftLine.visible = false
		this.renderingProperties.liveModeMaterial.color.setHex(0x33d720)
	}

	private setAllVehiclesLiveModeRendering(): void {
		this.laneCenterLine.visible = false
		this.laneRightLine.visible = true
		this.laneLeftLine.visible = true
		this.renderingProperties.liveModeMaterial.color.setHex(0x443333)
	}

	private updateLaneSideLinesGeometry(): void {
		const leftLineGeometry = new THREE.Geometry()
		const rightLineGeometry = new THREE.Geometry()

		for (let i = 0; i < this.markers.length; i += 2) {
			rightLineGeometry.vertices.push(this.markers[i].position.clone())
			rightLineGeometry.vertices[rightLineGeometry.vertices.length - 1].y += 0.02
			leftLineGeometry.vertices.push(this.markers[i + 1].position.clone())
			leftLineGeometry.vertices[leftLineGeometry.vertices.length - 1].y += 0.02
		}

		leftLineGeometry.computeLineDistances()
		rightLineGeometry.computeLineDistances()
		this.laneLeftLine.geometry = leftLineGeometry
		this.laneRightLine.geometry = rightLineGeometry
		this.laneLeftLine.geometry.verticesNeedUpdate = true
		this.laneRightLine.geometry.verticesNeedUpdate = true
	}

	private updateLaneSideLinesMaterial(): void {
		const leftColor = this.lineColorToHex(this.leftLineColor)
		const rightColor = this.lineColorToHex(this.rightLineColor)

		if (this.leftLineType === LaneLineType.DASHED) {
			this.laneLeftLine.material = new THREE.LineDashedMaterial({color: leftColor, dashSize: 1, gapSize: 5, linewidth: 2})
		} else {
			this.laneLeftLine.material = new THREE.LineBasicMaterial({color: leftColor})
		}
		if (this.rightLineType === LaneLineType.DASHED) {
			this.laneRightLine.material = new THREE.LineDashedMaterial({color: rightColor, dashSize: 1, gapSize: 5, linewidth: 2})
		} else {
			this.laneRightLine.material = new THREE.LineBasicMaterial({color: rightColor})
		}

		this.laneLeftLine.material.needsUpdate = true
		this.laneRightLine.material.needsUpdate = true
	}

	private lineColorToHex(color: LaneLineColor): number {
		switch (color) {
			case LaneLineColor.WHITE:
				return 0xffffff
			case LaneLineColor.YELLOW:
				return 0xffaa00
			case LaneLineColor.BLUE:
				return 0x4682b4
			case LaneLineColor.RED:
				return 0xdc143c
			default:
				return 0x333333
		}
	}

}
