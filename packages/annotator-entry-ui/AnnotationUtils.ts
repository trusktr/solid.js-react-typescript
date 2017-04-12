/**
 * Created by alonso on 4/11/17.
 */

import * as THREE from 'three'

const controlPointGeometry = new THREE.BoxGeometry( 1, 1, 1 );


export class Annotation {
	
	waypoints : Array<THREE.Mesh> = []
	
	addPoint(x:number, y:number, z:number) : THREE.Mesh {
		let marker = new THREE.Mesh( controlPointGeometry, new THREE.MeshLambertMaterial({
			color: Math.random() * 0xffffff
		}));
		
		// let y = 0
		// if (this.waypoints.length > 0) {
		// 	y = this.waypoints[this.waypoints.length-1].position.y;
		// }
		marker.position.x = x
		marker.position.y = y
		marker.position.z = z
		this.waypoints.push(marker)
		
		return marker
	}
	
	removeLastPoint() : THREE.Mesh {
		return this.waypoints.pop()
	}
	
}
