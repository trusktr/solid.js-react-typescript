/**
 * Created by alonso on 4/11/17.
 */

import * as THREE from 'three'

const controlPointGeometry = new THREE.BoxGeometry( 1, 1, 1 );
const markerMaterial = new THREE.MeshLambertMaterial({color : 'red'})

export class LaneAnnotation {
	
	leftMarkers : Array<THREE.Mesh>
	rightMarkers : Array<THREE.Mesh>
	
	constructor() {
		this.leftMarkers = []
		this.rightMarkers = []
	}
	
	addMarker(x:number, y:number, z:number) : Array<THREE.Mesh> {
		let addedMarkers = []
		
		let marker = new THREE.Mesh( controlPointGeometry, markerMaterial)
		marker.position.x = x
		marker.position.y = y
		marker.position.z = z
		addedMarkers.push(marker)
		
		if (this.isFirstPoint()) {
			this.rightMarkers.push(marker)
		} else if (this.isSecondPoint()) {
			this.leftMarkers.push(marker)
		} else  {
			let marker2Position = this.computeLeftMarkerEstimatedPosition(marker.position)
			let marker2 = new THREE.Mesh( controlPointGeometry, markerMaterial)
			marker2.position.x = marker2Position.x
			marker2.position.y = marker2Position.y
			marker2.position.z = marker2Position.z
			this.rightMarkers.push(marker)
			this.leftMarkers.push(marker2)
			addedMarkers.push(marker2)
		}
		
		return addedMarkers
	}
	
	private isFirstPoint() : boolean {
		return this.leftMarkers.length == 0 && this.rightMarkers.length == 0;
	}
	
	private isSecondPoint() : boolean {
		return this.leftMarkers.length == 0 && this.rightMarkers.length > 0
	}
	
	/**
	 *  Use the last two points to create a guess of the
	 * location of the left marker
	 * @param newRightMarker
	 * @returns {THREE.Vector3}
	 */
	private computeLeftMarkerEstimatedPosition(newRightMarker : THREE.Vector3) : THREE.Vector3 {
		//
		let lastIndex = this.rightMarkers.length
		let lastRightMarker = this.rightMarkers[lastIndex-1].position
		let lastLeftMarker = this.leftMarkers[lastIndex-1].position
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
