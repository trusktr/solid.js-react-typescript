/**
 * Created by alonso on 4/11/17.
 */

import * as THREE from 'three'

const controlPointGeometry = new THREE.BoxGeometry( 1, 1, 1 );
const markerMaterial = new THREE.MeshLambertMaterial({color : 'red'})
//const laneMaterial = new THREE.MeshLambertMaterial({color : 'red'})
const laneMaterial = new THREE.MeshBasicMaterial({color : 'red', wireframe : true})


export class LaneAnnotation {
	// Lane markers are stored in an array as [right, left, right, left, ...]
	laneMarkers : Array<THREE.Mesh>
	laneMesh : THREE.Mesh
	
	constructor() {
		this.laneMarkers = []
		this.laneMesh = new THREE.Mesh(new THREE.Geometry(), laneMaterial)
	}
	
	addMarker(x:number, y:number, z:number) : Array<THREE.Mesh> {
		let addedMarkers = []
		
		let marker = new THREE.Mesh( controlPointGeometry, markerMaterial)
		marker.position.x = x
		marker.position.y = y
		marker.position.z = z
		
		this.laneMarkers.push(marker)
		addedMarkers.push(marker)
		
		// From the third marker onwards, add markers in pairs by estimating the position
		// of the left marker.
		if (this.laneMarkers.length >= 3) {
			let marker2Position = this.computeLeftMarkerEstimatedPosition()
			let marker2 = new THREE.Mesh( controlPointGeometry, markerMaterial)
			marker2.position.x = marker2Position.x
			marker2.position.y = marker2Position.y
			marker2.position.z = marker2Position.z
			this.laneMarkers.push(marker2)
			addedMarkers.push(marker2)
		}
		
		this.generateMeshFromMarkers()
		
		return addedMarkers
	}
	
	generateMeshFromMarkers = () => {
		// We need at least 3 vertices to generate a mesh
		if (this.laneMarkers.length < 3) {
			return
		}
		
		let newGeometry = new THREE.Geometry()
		
		// Add all vertices
		this.laneMarkers.forEach( (marker) => {
			newGeometry.vertices.push(marker.position)
		})
		
		// Add faces
		for (let i=0; i < this.laneMarkers.length-2; i++) {
			newGeometry.faces.push( new THREE.Face3(i, i+1, i+2))
		}
		
		this.laneMesh.geometry = newGeometry
		this.laneMesh.geometry.verticesNeedUpdate = true
	}
	
	/**
	 *  Use the last two points to create a guess of the
	 * location of the left marker
	 * @param newRightMarker
	 * @returns {THREE.Vector3}
	 */
	private computeLeftMarkerEstimatedPosition() : THREE.Vector3 {
		//
		let lastIndex = this.laneMarkers.length
		let newRightMarker = this.laneMarkers[lastIndex-1].position
		let lastRightMarker = this.laneMarkers[lastIndex-3].position
		let lastLeftMarker = this.laneMarkers[lastIndex-2].position
		let vectorRightToLeft = new THREE.Vector3()
		vectorRightToLeft.subVectors(lastLeftMarker, lastRightMarker)
		let vectorLastRightNewRight = new THREE.Vector3()
		vectorLastRightNewRight.subVectors(newRightMarker, lastRightMarker)
		
		let newLeftMarker = new THREE.Vector3()
		newLeftMarker.add(lastRightMarker)
		newLeftMarker.add(vectorLastRightNewRight)
		newLeftMarker.add(vectorRightToLeft)
		
		return newLeftMarker
	}
	
}

// export class LaneAnnotation {
//
// 	leftMarkers : Array<THREE.Mesh>
// 	rightMarkers : Array<THREE.Mesh>
// 	laneGeometry : THREE.Geometry
// 	laneMesh : THREE.Mesh
//
// 	constructor() {
// 		this.leftMarkers = []
// 		this.rightMarkers = []
// 		this.laneGeometry = new THREE.Geometry()
// 		this.laneMesh = new THREE.Mesh(this.laneGeometry, laneMaterial)
// 	}
//
// 	addMarker(x:number, y:number, z:number) : Array<THREE.Mesh> {
// 		let addedMarkers = []
//
// 		let marker = new THREE.Mesh( controlPointGeometry, markerMaterial)
// 		marker.position.x = x
// 		marker.position.y = y
// 		marker.position.z = z
//
// 		addedMarkers.push(marker)
//
// 		if (this.isFirstPoint()) {
// 			this.rightMarkers.push(marker)
// 		} else if (this.isSecondPoint()) {
// 			this.leftMarkers.push(marker)
// 		} else  {
// 			let marker2Position = this.computeLeftMarkerEstimatedPosition(marker.position)
// 			let marker2 = new THREE.Mesh( controlPointGeometry, markerMaterial)
// 			marker2.position.x = marker2Position.x
// 			marker2.position.y = marker2Position.y
// 			marker2.position.z = marker2Position.z
// 			this.rightMarkers.push(marker)
// 			this.leftMarkers.push(marker2)
//
// 			addedMarkers.push(marker2)
//
// 		}
//
// 		return addedMarkers
// 	}
//
// 	generateMeshFromMarkers = () => {
// 		// We need at least 3 vertices to generate a mesh
// 		if (this.rightMarkers.length < 1) {
// 			return
// 		}
//
// 		// After the first two markers are added there is always an even set of markers
// 		for (let i=0; i)
// 		this.laneGeometry.vertices.push(marker.position)
// 	}
//
// 	private isFirstPoint() : boolean {
// 		return this.leftMarkers.length == 0 && this.rightMarkers.length == 0;
// 	}
//
// 	private isSecondPoint() : boolean {
// 		return this.leftMarkers.length == 0 && this.rightMarkers.length > 0
// 	}
//
// 	/**
// 	 *  Use the last two points to create a guess of the
// 	 * location of the left marker
// 	 * @param newRightMarker
// 	 * @returns {THREE.Vector3}
// 	 */
// 	private computeLeftMarkerEstimatedPosition(newRightMarker : THREE.Vector3) : THREE.Vector3 {
// 		//
// 		let lastIndex = this.rightMarkers.length
// 		let lastRightMarker = this.rightMarkers[lastIndex-1].position
// 		let lastLeftMarker = this.leftMarkers[lastIndex-1].position
// 		let vectorRightToLeft = new THREE.Vector3()
// 		vectorRightToLeft.subVectors(lastLeftMarker, lastRightMarker)
// 		let vectorLastRightNewRight = new THREE.Vector3()
// 		vectorLastRightNewRight.subVectors(newRightMarker, lastRightMarker)
//
// 		let newLeftMarker = new THREE.Vector3()
// 		newLeftMarker.add(lastRightMarker)
// 		newLeftMarker.add(vectorLastRightNewRight)
// 		newLeftMarker.add(vectorRightToLeft)
//
// 		return newLeftMarker
// 	}
//
// }
