/**
 *  Copyright 2017 Mapper Inc. Part of the mapper-annotator project.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as THREE from 'three'
import {
	Annotation, AnnotationUuid, AnnotationRenderingProperties,
	AnnotationJsonOutputInterface, AnnotationJsonInputInterface,
} from './AnnotationBase'
import {AnnotationType} from "./AnnotationType"
import {isNullOrUndefined} from "util"
import {AnnotationGeometryType} from "./AnnotationBase"

// Some types
export enum ConnectionType {
	UNKNOWN = 0,
	YIELD,
	ALTERNATE,
	RYG_LIGHT,
	RYG_LEFT_ARROW_LIGTH,
	OTHER
}

namespace ConnectionRenderingProperties {
	export const directionGeometry = new THREE.Geometry()
	directionGeometry.vertices.push(new THREE.Vector3(-0.25, 0.25,  0.5))
	directionGeometry.vertices.push(new THREE.Vector3( 0.25, 0.25,  0))
	directionGeometry.vertices.push(new THREE.Vector3(-0.25, 0.25, -0.5))
	directionGeometry.faces.push(new THREE.Face3(0, 1, 2))
	directionGeometry.computeFaceNormals()

	export const directionGeometryMaterial = new THREE.MeshLambertMaterial({color: 0xff0000, side: THREE.DoubleSide})
	export const markerMaterial = new THREE.MeshLambertMaterial({color: 0xffffff, side: THREE.DoubleSide})
	export const activeMaterial = new THREE.MeshBasicMaterial({color: "orange", wireframe: true})
	export const inactiveMaterial = new THREE.MeshLambertMaterial({color: 0x00ff00, side: THREE.DoubleSide})
	export const conflictMaterial = new THREE.MeshLambertMaterial({color: 0xff0000, transparent: true, opacity: 0.4, side: THREE.DoubleSide})
	export const trajectoryMaterial = new THREE.MeshLambertMaterial({color: 0x000000, side: THREE.DoubleSide})
	export const liveModeMaterial = new THREE.MeshLambertMaterial({color: 0x443333, transparent: true, opacity: 0.4, side: THREE.DoubleSide})
}

export interface ConnectionJsonInputInterface extends AnnotationJsonInputInterface {
	connectionType: string
	startLaneUuid: AnnotationUuid
	endLaneUuid: AnnotationUuid
	conflictingConnections: Array<AnnotationUuid>
}

export interface ConnectionJsonOutputInterface extends AnnotationJsonOutputInterface {
	connectionType: string
	startLaneUuid: AnnotationUuid
	endLaneUuid: AnnotationUuid
	conflictingConnections: Array<AnnotationUuid>
	// Waypoints are generated from markers. They are included in output for downstream
	// convenience, but we don't read them back in.
	waypoints: Array<Object>
}

export class Connection extends Annotation {
	annotationType: AnnotationType
	geometryType: AnnotationGeometryType
	type: ConnectionType
	minimumMarkerCount: number
	allowNewMarkers: boolean
	snapToGround: boolean
	startLaneUuid: AnnotationUuid
	endLaneUuid: AnnotationUuid
	conflictingConnections: Array<AnnotationUuid>
	directionMarkers: Array<THREE.Mesh>
	waypoints: Array<THREE.Vector3>
	mesh: THREE.Mesh

	constructor(obj?: ConnectionJsonInputInterface) {
		super(obj)
		this.annotationType = AnnotationType.CONNECTION
		this.geometryType = AnnotationGeometryType.PAIRED_LINEAR
		if (obj) {
			this.type = isNullOrUndefined(ConnectionType[obj.connectionType]) ? ConnectionType.UNKNOWN : ConnectionType[obj.connectionType]
			this.startLaneUuid = obj.startLaneUuid
			this.endLaneUuid = obj.endLaneUuid
			this.conflictingConnections = isNullOrUndefined(obj.conflictingConnections) ? [] : obj.conflictingConnections
		} else {
			this.type = ConnectionType.UNKNOWN
			this.startLaneUuid = ""
			this.endLaneUuid = ""
			this.conflictingConnections = []
		}

		this.minimumMarkerCount = 4
		this.allowNewMarkers = false
		this.snapToGround = true
		this.directionMarkers = []
		this.waypoints = []
		this.mesh = new THREE.Mesh(new THREE.Geometry(), ConnectionRenderingProperties.activeMaterial)
		this.renderingObject.add(this.mesh)

		if (obj) {
			if (obj.markers.length >= this.minimumMarkerCount) {
				obj.markers.forEach(marker => this.addMarker(marker, false))
				if (!this.isValid())
					throw Error(`can't load invalid boundary with id ${obj.uuid}`)
				this.updateVisualization()
				this.makeInactive()
			}
		}
	}

	setConnectionEndPoints(startLaneUuid: AnnotationUuid, endLaneUuid: AnnotationUuid): void {
		this.startLaneUuid = startLaneUuid
		this.endLaneUuid = endLaneUuid
	}

	isValid(): boolean {
		return this.markers.length >= this.minimumMarkerCount
	}

	addMarker(position: THREE.Vector3, updateVisualization: boolean): boolean {
		const marker = new THREE.Mesh(AnnotationRenderingProperties.markerPointGeometry,
			                          ConnectionRenderingProperties.markerMaterial)
		marker.position.set(position.x, position.y, position.z)
		this.markers.push(marker)
		this.renderingObject.add(marker)

		if (updateVisualization) this.updateVisualization()
		return true
	}

	/**
	 * This functions checks if the given connection is in the conflicting connection set. If so, it deletes it, if not
	 * it adds it. It returns true if the connection was added.
	 */
	toggleConflictingConnection(connectionId: AnnotationUuid): boolean {
		// Only add the connection if is not in the conflicting list already
		const index = this.conflictingConnections.indexOf(connectionId, 0)
		if (index < 0) {
			this.conflictingConnections.push(connectionId)
			return true
		}
		// We do have this connection, remove it
		this.conflictingConnections.splice(index, 1)
		return false
	}

	deleteLastMarker(): boolean  { return false}

	complete(): boolean {
		return true
	}

	makeActive(): void {
		this.mesh.material = ConnectionRenderingProperties.activeMaterial
	}

	makeInactive(): void {
		this.mesh.material = ConnectionRenderingProperties.inactiveMaterial
		this.unhighlightMarkers()
	}

	setLiveMode(): void {
		this.markers.forEach((marker) => {
			marker.visible = false
		})
		this.mesh.material = ConnectionRenderingProperties.liveModeMaterial
	}

	unsetLiveMode(): void {
		this.markers.forEach((marker) => {
			marker.visible = true
		})
		this.makeInactive()
	}

	setConflictMode(): void {
		this.mesh.material = ConnectionRenderingProperties.conflictMaterial
	}

	updateVisualization(): void {
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
		this.mesh.geometry = newGeometry
		this.mesh.geometry.verticesNeedUpdate = true

		this.computeWaypoints()
	}

	setType(type: ConnectionType): void {
		this.type = type
	}

	toJSON(pointConverter?: (p: THREE.Vector3) => Object): ConnectionJsonOutputInterface {
		// Create data structure to export (this is the min amount of data
		// needed to reconstruct this object from scratch)
		const data: ConnectionJsonOutputInterface = {
			annotationType: AnnotationType[AnnotationType.CONNECTION],
			uuid: this.uuid,
			connectionType: ConnectionType[this.type],
			startLaneUuid: this.startLaneUuid,
			endLaneUuid: this.endLaneUuid,
			conflictingConnections: this.conflictingConnections,
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

		this.updateLaneDirectionMarkers()
	}

	private updateLaneDirectionMarkers(): void {
		// Remove points from rendering object
		this.directionMarkers.forEach((marker) => {
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

			const marker = new THREE.Mesh(ConnectionRenderingProperties.directionGeometry,
				                          ConnectionRenderingProperties.directionGeometryMaterial)
			marker.position.set(this.waypoints[i].x, this.waypoints[i].y, this.waypoints[i].z)
			marker.rotateY(-angle)
			this.renderingObject.add(marker)
			this.directionMarkers.push(marker)
		}
	}
}
