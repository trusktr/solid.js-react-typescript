/**
 *  Copyright 2017 Mapper Inc. Part of the mapper-annotator project.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as THREE from 'three'
import * as TypeLogger from 'typelogger'
import * as $ from 'jquery'
import * as UUID from 'uuid'
import {AnnotationUuid, Annotation} from 'annotator-entry-ui/annotations/AnnotationBase'

// tslint:disable-next-line:no-any
TypeLogger.setLoggerOutput(console as any)
const log = TypeLogger.getLogger(__filename)

// Some constants for rendering
const controlPointGeometry = new THREE.BoxGeometry(0.1, 0.1, 0.1)
const highlightControlPointGeometry = new THREE.BoxGeometry(0.3, 0.3, 0.3)

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
	connectionMaterial: THREE.MeshLambertMaterial
	liveModeMaterial: THREE.MeshLambertMaterial

	constructor(color: number) {
		this.color = color
		this.markerMaterial = new THREE.MeshLambertMaterial({color: this.color, side: THREE.DoubleSide})
		this.activeMaterial = new THREE.MeshBasicMaterial({color: "orange", wireframe: true})
		this.inactiveMaterial = new THREE.MeshLambertMaterial({color: this.color, side: THREE.DoubleSide})
		this.trajectoryMaterial = new THREE.MeshLambertMaterial({color: 0x000000, side: THREE.DoubleSide})
		this.centerLineMaterial = new THREE.LineDashedMaterial({color: 0xffaa00, dashSize: 3, gapSize: 1, linewidth: 2})
		this.connectionMaterial = new THREE.MeshLambertMaterial({color: 0x00ff00, side: THREE.DoubleSide})
		this.liveModeMaterial = new THREE.MeshLambertMaterial({color: 0x443333, transparent: true, opacity: 0.4, side: THREE.DoubleSide})
	}
}

export interface LaneAnnotationInterface {
	uuid: AnnotationUuid
	type: LaneType
	color: number
	markerPositions: Array<THREE.Vector3>
	waypoints: Array<THREE.Vector3>
	neighborsIds: LaneNeighborsIds
	leftLineType: LaneLineType
	leftLineColor: LaneLineColor
	rightLineType: LaneLineType
	rightLineColor: LaneLineColor
	entryType: LaneEntryExitType
	exitType: LaneEntryExitType
}

export interface LaneAnnotationJsonInterface {
	uuid: AnnotationUuid
	type: LaneType
	color: number
	markerPositions: Array<Object>
	waypoints: Array<Object>
	neighborsIds: LaneNeighborsIds
	leftLineType: LaneLineType
	leftLineColor: LaneLineColor
	rightLineType: LaneLineType
	rightLineColor: LaneLineColor
	entryType: LaneEntryExitType
	exitType: LaneEntryExitType
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

	constructor(obj?: LaneAnnotationInterface) {
		// Call the base constructor
		super()
		this.uuid = obj ? obj.uuid : UUID.v1()
		this.type = obj ? obj.type : LaneType.UNKNOWN
		const color = obj ? obj.color : Math.random() * 0xffffff
		this.neighborsIds = obj ? obj.neighborsIds : new LaneNeighborsIds()
		this.leftLineType = obj ? obj.leftLineType : LaneLineType.UNKNOWN
		this.rightLineType = obj ? obj.rightLineType : LaneLineType.UNKNOWN
		this.leftLineColor = obj ? obj.leftLineColor : LaneLineColor.UNKNOWN
		this.rightLineColor = obj ? obj.rightLineColor : LaneLineColor.UNKNOWN
		this.entryType = obj ? obj.entryType : LaneEntryExitType.UNKNOWN
		this.exitType = obj ? obj.exitType : LaneEntryExitType.UNKNOWN
		this.renderingProperties = new LaneRenderingProperties(color)
		this.laneMesh = new THREE.Mesh(new THREE.Geometry(), this.renderingProperties.activeMaterial)
		this.laneCenterLine = new THREE.Line(new THREE.Geometry(), this.renderingProperties.centerLineMaterial)
		this.laneDirectionMarkers = []
		this.inTrajectory = false

		if (obj && obj.markerPositions.length > 0) {
			obj.markerPositions.forEach((position) => {
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
		const marker = new THREE.Mesh(controlPointGeometry, this.renderingProperties.markerMaterial)
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
	addMarker(position: THREE.Vector3, isLastMarker: boolean = false): void {

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
	}

	/**
	 * Delete last marker(s).
	 */
	deleteLastMarker(): void {
		if (this.markers.length === 0) {
			return
		}

		this.renderingObject.remove(this.markers.pop()!)

		if (this.markers.length > 2) {
			this.renderingObject.remove(this.markers.pop()!)
		}

		this.updateVisualization()
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
		if (parseInt(this.exitType as {}, 10) === LaneEntryExitType.STOP) {
			if (parseInt(this.entryType as {}, 10) === LaneEntryExitType.STOP) {
				this.renderingProperties.liveModeMaterial.color.setHex(0xff0000)
			} else {
				this.renderingProperties.liveModeMaterial.color.setHex(0x00ff00)
			}
		}
		this.markers.forEach((marker) => {
			marker.visible = false
		})
		this.laneCenterLine.visible = true
		this.laneMesh.material = this.renderingProperties.liveModeMaterial
	}

	unsetLiveMode(): void {
		this.markers.forEach((marker) => {
			marker.visible = true
		})
		this.makeInactive()
	}

	/**
	 * Intersect requested markers with active markers.
	 * Draw the markers a little larger.
	 */
	highlightMarkers(markers: Array<THREE.Mesh>): void {
		const ids: Array<number> = markers.map(m => m.id)
		this.markers.forEach(marker => {
			ids.filter(id => id === marker.id).forEach(() => {
				marker.geometry = highlightControlPointGeometry
			})
		})
	}

	/**
	 * Draw all markers at normal size.
	 */
	unhighlightMarkers(): void {
		this.markers.forEach(marker => {
			marker.geometry = controlPointGeometry
		})
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

	toJSON(pointConverter?: (p: THREE.Vector3) => Object): LaneAnnotationJsonInterface {
		// Create data structure to export (this is the min amount of data
		// needed to reconstruct this object from scratch)
		const data: LaneAnnotationJsonInterface = {
			uuid: this.uuid,
			type: this.type,
			color: this.renderingProperties.color,
			leftLineType: this.leftLineType,
			leftLineColor: this.leftLineColor,
			rightLineType: this.rightLineType,
			rightLineColor: this.rightLineColor,
			entryType: this.entryType,
			exitType: this.exitType,
			neighborsIds: this.neighborsIds,
			markerPositions: [],
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
					data.markerPositions.push(pointConverter(marker.position))
				} else {
					data.markerPositions.push(marker.position)
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

	private updateLaneWidth(): void {
		const laneWidth = $('#lp_width_value')
		laneWidth.text(this.getLaneWidth().toFixed(3) + " m")
	}
}
