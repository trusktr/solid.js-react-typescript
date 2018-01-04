/**
 *  Copyright 2017 Mapper Inc. Part of the mapper-annotator project.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as THREE from 'three'
import {Annotation, AnnotationUuid, AnnotationRenderingProperties} from 'annotator-entry-ui/annotations/AnnotationBase'

// Some variables used for rendering

// Some types
export enum ConnectionType {
	UNKNOWN = 0,
	STRAIGHT,
	LEFT_TURN,
	RIGHT_TURN,
	LEFT_MERGE,
	RIGHT_MERGE,
	LEFT_SPLIT,
	RIGHT_SPLIT,
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
	export const activeMaterial = new THREE.MeshLambertMaterial({color: 0x00ff00, side: THREE.DoubleSide})
	export const inactiveMaterial = new THREE.MeshLambertMaterial({color: 0x00ff00, side: THREE.DoubleSide})
	export const trajectoryMaterial = new THREE.MeshLambertMaterial({color: 0x000000, side: THREE.DoubleSide})
	export const liveModeMaterial = new THREE.MeshLambertMaterial({color: 0x443333, transparent: true, opacity: 0.4, side: THREE.DoubleSide})
}

export class Connection extends Annotation {
	type: ConnectionType
	startLaneUuid: AnnotationUuid
	endLaneUuid: AnnotationUuid
	directionMarkers: Array<THREE.Mesh>
	waypoints: Array<THREE.Vector3>
	connectionMesh: THREE.Mesh

	constructor(startLaneUuid: AnnotationUuid, endLaneUuid: AnnotationUuid) {
		super()
		this.type = ConnectionType.UNKNOWN
		this.startLaneUuid = startLaneUuid
		this.endLaneUuid = endLaneUuid
		this.directionMarkers = []
		this.waypoints = []
		this.connectionMesh = new THREE.Mesh(new THREE.Geometry(), ConnectionRenderingProperties.activeMaterial)
		this.renderingObject.add(this.connectionMesh)
	}

	addMarker(position: THREE.Vector3, isLastMarker: boolean = false): void {
		const marker = new THREE.Mesh(AnnotationRenderingProperties.markerPointGeometry,
			                          ConnectionRenderingProperties.markerMaterial)
		marker.position.set(position.x, position.y, position.z)
		this.markers.push(marker)
		this.renderingObject.add(marker)
	}

	deleteLastMarker(): void  {}

	makeActive(): void {
		this.connectionMesh.material = ConnectionRenderingProperties.activeMaterial
	}

	makeInactive(): void {
		this.connectionMesh.material = ConnectionRenderingProperties.inactiveMaterial
		this.unhighlightMarkers()
	}

	setLiveMode(): void {
		this.markers.forEach((marker) => {
			marker.visible = false
		})
		this.connectionMesh.material = ConnectionRenderingProperties.liveModeMaterial
	}

	unsetLiveMode(): void {
		this.markers.forEach((marker) => {
			marker.visible = true
		})
		this.makeInactive()
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
		this.connectionMesh.geometry = newGeometry
		this.connectionMesh.geometry.verticesNeedUpdate = true

		this.computeWaypoints()
	}

	setType(type: ConnectionType): void {
		this.type = type
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
