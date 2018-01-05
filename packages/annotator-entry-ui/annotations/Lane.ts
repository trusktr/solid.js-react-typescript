/**
 *  Copyright 2017 Mapper Inc. Part of the mapper-annotator project.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as THREE from 'three'
import * as TypeLogger from 'typelogger'
import * as $ from 'jquery'
import {
	AnnotationUuid, Annotation, AnnotationRenderingProperties,
	AnnotationJsonOutputInterface, AnnotationJsonInputInterface
} from 'annotator-entry-ui/annotations/AnnotationBase'
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
	right: AnnotationUuid | null
	left: AnnotationUuid | null
	front: Array<AnnotationUuid>
	back: Array<AnnotationUuid>

	constructor() {
		this.right = null
		this.left = null
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
		this.markerMaterial = new THREE.MeshLambertMaterial({color: this.color, side: THREE.DoubleSide})
		this.activeMaterial = new THREE.MeshBasicMaterial({color: "orange", wireframe: true})
		this.inactiveMaterial = new THREE.MeshLambertMaterial({color: this.color, side: THREE.DoubleSide})
		this.trajectoryMaterial = new THREE.MeshLambertMaterial({color: 0x000000, side: THREE.DoubleSide})
		this.centerLineMaterial = new THREE.LineDashedMaterial({color: 0xffaa00, dashSize: 3, gapSize: 1, linewidth: 2})
		this.liveModeMaterial = new THREE.MeshLambertMaterial({color: 0x443333, transparent: true, opacity: 0.4, side: THREE.DoubleSide})
	}
}

// support for legacy data files
export interface LaneJsonInputInterfaceV1 {
	uuid: AnnotationUuid
	type: number
	color: number
	markerPositions: Array<THREE.Vector3>
	waypoints: Array<THREE.Vector3>
	neighborsIds: LaneNeighborsIds
	leftSideType: LaneLineType
	rightSideType: LaneLineType
	entryType: LaneEntryExitType
	exitType: LaneEntryExitType
}

export interface LaneJsonInputInterfaceV3 extends AnnotationJsonInputInterface {
	laneType: string
	color: number
	waypoints: Array<THREE.Vector3>
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
	color: number
	waypoints: Array<Object>
	neighborsIds: LaneNeighborsIds
	leftLineType: string
	leftLineColor: string
	rightLineType: string
	rightLineColor: string
	entryType: string
	exitType: string
}

/**
 * LaneAnnotation class.
 */
export class Lane extends Annotation {
	// Lane markers are stored in an array as [right, left, right, left, ...]
	type: LaneType
	renderingProperties: LaneRenderingProperties
	waypoints: Array<THREE.Vector3>
	laneCenterLine: THREE.Line
	laneDirectionMarkers: Array<THREE.Mesh>
	laneMesh: THREE.Mesh
	neighborsIds: LaneNeighborsIds
	leftLineType: LaneLineType
	leftLineColor: LaneLineColor
	rightLineType: LaneLineType
	rightLineColor: LaneLineColor
	entryType: LaneEntryExitType
	exitType: LaneEntryExitType
	inTrajectory: boolean

	constructor(obj?: LaneJsonInputInterfaceV3) {
		// Call the base constructor
		super(obj)
		let color: number
		if (obj) {
			this.type = isNullOrUndefined(LaneType[obj.laneType]) ? LaneType.UNKNOWN : LaneType[obj.laneType]
			color = obj.color
			this.neighborsIds = obj.neighborsIds
			this.leftLineType = isNullOrUndefined(LaneLineType[obj.leftLineType]) ? LaneLineType.UNKNOWN : LaneLineType[obj.leftLineType]
			this.rightLineType = isNullOrUndefined(LaneLineType[obj.rightLineType]) ? LaneLineType.UNKNOWN : LaneLineType[obj.rightLineType]
			this.leftLineColor = isNullOrUndefined(LaneLineColor[obj.leftLineColor]) ? LaneLineColor.UNKNOWN : LaneLineColor[obj.leftLineColor]
			this.rightLineColor = isNullOrUndefined(LaneLineColor[obj.rightLineColor]) ? LaneLineColor.UNKNOWN : LaneLineColor[obj.rightLineColor]
			this.entryType = isNullOrUndefined(LaneEntryExitType[obj.entryType]) ? LaneEntryExitType.UNKNOWN : LaneEntryExitType[obj.entryType]
			this.exitType = isNullOrUndefined(LaneEntryExitType[obj.exitType]) ? LaneEntryExitType.UNKNOWN : LaneEntryExitType[obj.exitType]
		} else {
			this.type = LaneType.UNKNOWN
			color = Math.random() * 0xffffff
			this.neighborsIds = new LaneNeighborsIds()
			this.leftLineType = LaneLineType.UNKNOWN
			this.rightLineType = LaneLineType.UNKNOWN
			this.leftLineColor = LaneLineColor.UNKNOWN
			this.rightLineColor = LaneLineColor.UNKNOWN
			this.entryType = LaneEntryExitType.UNKNOWN
			this.exitType = LaneEntryExitType.UNKNOWN
		}

		this.renderingProperties = new LaneRenderingProperties(color)
		this.laneMesh = new THREE.Mesh(new THREE.Geometry(), this.renderingProperties.activeMaterial)
		this.laneCenterLine = new THREE.Line(new THREE.Geometry(), this.renderingProperties.centerLineMaterial)
		this.laneDirectionMarkers = []
		this.waypoints = []
		this.inTrajectory = false

		if (obj && obj.markers.length > 0) {
			obj.markers.forEach((position) => {
				this.addRawMarker(new THREE.Vector3(position.x, position.y, position.z))
			})
			this.updateVisualization()
			this.makeInactive()
		}

		// Group display objects so we can easily add them to the screen
		this.renderingObject.add(this.laneMesh)
		this.renderingObject.add(this.laneCenterLine)
	}

	setType(type: LaneType): void {
		this.type = type
	}

	/**
	 * Add a single marker to the annotation and the scene.
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
	addMarker(position: THREE.Vector3): boolean {

		if (this.markers.length < 2) {
			this.addRawMarker(position)
		} else {
			// From the third marker onwards, add markers in pairs by estimating the position
			// of the left marker.
			const leftMarker = this.computeLeftMarkerEstimatedPosition(position)
			this.addRawMarker(leftMarker)
			this.addRawMarker(position)
		}

		this.updateVisualization()
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

	/**
	 * Make this annotation active. This changes the displayed material.
	 */
	makeActive(): void {
		this.laneMesh.material = this.renderingProperties.activeMaterial
		this.laneCenterLine.visible = false
	}

	/**
	 * Make this annotation inactive. This changes the displayed material.
	 */
	makeInactive(): void {
		if (this.inTrajectory) {
			this.laneMesh.material = this.renderingProperties.trajectoryMaterial
		} else {
			this.laneMesh.material = this.renderingProperties.inactiveMaterial
		}
		this.laneCenterLine.visible = true
		this.unhighlightMarkers()
	}

	setLiveMode(): void {
		switch (this.type) {
			case LaneType.BIKE_ONLY:
				// green
				this.renderingProperties.liveModeMaterial.color.setHex(0x3cb371)
				break
			case LaneType.CROSSWALK:
				// yellow
				this.renderingProperties.liveModeMaterial.color.setHex(0xffffe0)
				break
			case LaneType.PARKING:
				// blue
				this.renderingProperties.liveModeMaterial.color.setHex(0x87ceeb)
				break
			default:
				this.laneCenterLine.visible = true
				this.renderingProperties.liveModeMaterial.color.setHex(0x443333)
		}

		this.markers.forEach((marker) => {
			marker.visible = false
		})

		this.laneMesh.material = this.renderingProperties.liveModeMaterial
	}

	unsetLiveMode(): void {
		this.markers.forEach((marker) => {
			marker.visible = true
		})
		this.makeInactive()
	}

	/**
	 * Recompute mesh from markers.
	 */
	updateVisualization(): void {

		// First thing first, update lane width
		this.updateLaneWidth()

		if (this.markers.length === 0) {
			return
		}

		const newGeometry = new THREE.Geometry()

		// We need at least 3 vertices to generate a mesh
		if (this.markers.length > 2) {
			// Add all vertices
			this.markers.forEach((marker) => {
				newGeometry.vertices.push(marker.position)
			})

			// Add faces
			for (let i = 0; i < this.markers.length - 2; i++) {
				if (i % 2 === 0) {
					newGeometry.faces.push(new THREE.Face3(i + 2, i + 1, i))
				} else {
					newGeometry.faces.push(new THREE.Face3(i, i + 1, i + 2))
				}

			}
		}
		newGeometry.computeFaceNormals()
		this.laneMesh.geometry = newGeometry
		this.laneMesh.geometry.verticesNeedUpdate = true

		// Generate center lane indication and direction markers
		this.computeWaypoints()
	}

	/**
	 * Add neighbor to our list of neighbors
	 */
	addNeighbor(neighborId: AnnotationUuid, neighborLocation: NeighborLocation): void {
		switch (neighborLocation) {
			case NeighborLocation.FRONT:
				this.neighborsIds.front.push(neighborId)
				break
			case NeighborLocation.BACK:
				this.neighborsIds.back.push(neighborId)
				break
			case NeighborLocation.LEFT:
				this.neighborsIds.left = neighborId
				break
			case NeighborLocation.RIGHT:
				this.neighborsIds.right = neighborId
				break
			default:
				log.warn('Neighbor location not recognized')
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
			this.laneMesh.material = this.renderingProperties.trajectoryMaterial
		} else {
			this.laneMesh.material = this.renderingProperties.inactiveMaterial
		}
	}

	toJSON(pointConverter?: (p: THREE.Vector3) => Object): LaneJsonOutputInterfaceV3 {
		// Create data structure to export (this is the min amount of data
		// needed to reconstruct this object from scratch)
		const data: LaneJsonOutputInterfaceV3 = {
			annotationType: AnnotationType[AnnotationType.LANE],
			uuid: this.uuid,
			laneType: LaneType[this.type],
			color: this.renderingProperties.color,
			leftLineType: LaneLineType[this.leftLineType],
			leftLineColor: LaneLineColor[this.leftLineColor],
			rightLineType: LaneLineType[this.rightLineType],
			rightLineColor: LaneLineColor[this.rightLineColor],
			entryType: LaneEntryExitType[this.entryType],
			exitType: LaneEntryExitType[this.exitType],
			neighborsIds: this.neighborsIds,
			markers: [],
			waypoints: []
		}

		if (this.waypoints) {
			if (pointConverter) {
				this.waypoints.forEach((p) => {
					data.waypoints.push(pointConverter(p))
				})
			} else {
				data.waypoints = this.waypoints
			}
		}

		if (this.markers) {
			this.markers.forEach((marker) => {
				if (pointConverter) {
					data.markers.push(pointConverter(marker.position))
				} else {
					data.markers.push(marker.position)
				}
			})
		}

		return data
	}

	/**
	 * Find neighboring points on the same edge as the origin. Given how addMarker() works with pairs,
	 * assume that all odd-indexed points are on one edge and all even-indexed points are on the other.
	 */
	neighboringLaneMarkers(origin: THREE.Mesh, distance: number): Array<THREE.Mesh> {
		if (distance < 1) return []

		const neighbors: Array<THREE.Mesh> = []
		let originIndex = -1
		// Find the origin.
		for (let i = 0; i < this.markers.length; i++) {
			if (this.markers[i].id === origin.id) {
				originIndex = i
				break
			}
		}
		// Find the neighbors.
		if (originIndex > -1)
			for (let i = originIndex % 2; i < this.markers.length; i += 2) {
				if (i !== originIndex && Math.abs(i - originIndex) <= distance * 2)
					neighbors.push(this.markers[i])
			}

		return neighbors
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

	/**
	 *  Use the last two points to create a guess of the
	 * location of the left marker
	 */
	private computeLeftMarkerEstimatedPosition(newRightMarker: THREE.Vector3): THREE.Vector3 {
		const lastIndex = this.markers.length
		const lastRightMarker = this.markers[lastIndex - 1].position
		const lastLeftMarker = this.markers[lastIndex - 2].position
		const vectorRightToLeft = new THREE.Vector3()
		vectorRightToLeft.subVectors(lastLeftMarker, lastRightMarker)
		const vectorLastRightNewRight = new THREE.Vector3()
		vectorLastRightNewRight.subVectors(newRightMarker, lastRightMarker)

		const newLeftMarker = new THREE.Vector3()
		newLeftMarker.add(lastRightMarker)
		newLeftMarker.add(vectorLastRightNewRight)
		newLeftMarker.add(vectorRightToLeft)

		return newLeftMarker
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

		const distanceBetweenMarkers = 5.0 // in meters
		const spline = new THREE.CatmullRomCurve3(points)
		const numPoints = spline.getLength() / distanceBetweenMarkers
		this.waypoints = spline.getSpacedPoints(numPoints)

		this.updateLaneDirectionMarkers()

		// Change the line geometry
		const lineGeometry = new THREE.Geometry()
		const centerPoints = spline.getPoints(100)
		for (let i = 0; i < centerPoints.length; i++) {
			lineGeometry.vertices[i] = centerPoints[i]
			lineGeometry.vertices[i].y += 0.05
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

	updateLaneWidth(): void {
		const laneWidth = $('#lp_width_value')
		laneWidth.text(this.getLaneWidth().toFixed(3) + " m")
	}
}