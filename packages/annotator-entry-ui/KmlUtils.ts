/**
 *  Copyright 2017 Mapper Inc. Part of the mapper-annotator project.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */
import * as THREE from 'three'
import * as AsyncFile from 'async-file'

/**
 * This class is used to facilitate the creation KML files. At the moment just Paths
 * can be added but other elements will be enabled as needed.
 * Example:
 *  let kml = new SimpleKML()
 *  let points = []
 *  points.push(new THREE.Vector3(0, 0, 0))
 *  points.push(new THREE.Vector3(1, 1, 1))
 *  points.push(new THREE.Vector3(2, 2, 2))
 *  kml.addPath(points)
 *  kml.saveToFile("MyOutputFilename.kml")
 */
export class SimpleKML {
	header : string
	content : string
	tail : string
	
	constructor() {
		this.header = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n" +
			          "<kml xmlns=\"http://www.opengis.net/kml/2.2\">\n" +
					  "  <Document>\n"
		this.tail = "  </Document>\n</kml>\n"
		this.content = ""
	}
	
	addPath(points : Array<THREE.Vector3>) {
		let path = "    <Placemark>\n " +
			       "      <LineString>\n" +
				   "        <altitudeMode>clampToGround</altitudeMode>\n" +
			       "        <coordinates>\n"
		points.forEach( (point) => {
			let strPoint =  "          " + point.x.toString() + "," + point.y.toString() + "," + point.z.toString() + "\n"
			path += strPoint
		})
		path += "        </coordinates>\n" + "" +
			    "      </LineString>\n" +
			    "    </Placemark>\n"
		this.content += path
	}
	
	async saveToFile(fileName) {
		AsyncFile.writeTextFile(fileName, this.header + this.content + this.tail)
	}
}

