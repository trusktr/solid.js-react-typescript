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
  header: string
  content: string
  tail: string

  constructor() {
    this.header =
      "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n" +
      "<kml xmlns=\"http://www.opengis.net/kml/2.2\">\n" +
      "  <Document>\n" +
      "  <Style id=\"white\">\n" +
      "    <LineStyle>\n" +
      "      <color>66ffffff</color>\n" +
      "    </LineStyle>\n" +
      "    <PolyStyle>\n" +
      "      <color>66999999</color>\n" +
      "    </PolyStyle>\n" +
      "  </Style>\n" +
      "  <Style id=\"green\">\n" +
      "    <LineStyle>\n" +
      "      <color>6600ff00</color>\n" +
      "    </LineStyle>\n" +
      "    <PolyStyle>\n" +
      "      <color>66009900</color>\n" +
      "    </PolyStyle>\n" +
      "  </Style>\n"
    this.tail = "  </Document>\n</kml>\n"
    this.content = ""
  }

  addPoints(points: Array<THREE.Vector3>, style: String = "white"): void {
    points.forEach(p => this.addPoint(p, style))
  }

  addPoint(point: THREE.Vector3, style: String = "white"): void {
    let path =
      "    <Placemark>\n " +
      "      <styleUrl>#" + style + "</styleUrl>\n" +
      "      <Point>\n" +
      "        <coordinates>\n" +
      "            " + point.x.toString() + "," + point.y.toString() + "," + point.z.toString() + "\n" +
      "        </coordinates>\n" +
      "      </Point>\n" +
      "    </Placemark>\n"
    this.content += path
  }

  addPath(points: Array<THREE.Vector3>, style: String = "white"): void {
    let path =
      "    <Placemark>\n " +
      "      <styleUrl>#" + style + "</styleUrl>\n" +
      "      <LineString>\n" +
      "        <altitudeMode>clampToGround</altitudeMode>\n" +
      "        <coordinates>\n"
    points.forEach((point) => {
      path += "          " + point.x.toString() + "," + point.y.toString() + "," + point.z.toString() + "\n"
    })
    path +=
      "        </coordinates>\n" + "" +
      "      </LineString>\n" +
      "    </Placemark>\n"
    this.content += path
  }

  addPolygon(points: Array<THREE.Vector3>, style: String = "green"): void {
    let path =
      "    <Placemark>\n " +
      "      <styleUrl>#" + style + "</styleUrl>\n" +
      "      <Polygon>\n" +
      "        <tessellate>1</tessellate>\n" +
      "        <altitudeMode>clampToGround</altitudeMode>\n" +
      "        <outerBoundaryIs>\n" +
      "          <LinearRing>\n" +
      "            <coordinates>\n"
    points.concat(points[0]).forEach((point) => {
      path += "          " + point.x.toString() + "," + point.y.toString() + "," + point.z.toString() + "\n"
    })
    path +=
      "            </coordinates>\n" +
      "          </LinearRing>\n" +
      "        </outerBoundaryIs>\n" +
      "      </Polygon>\n" +
      "    </Placemark>\n"
    this.content += path
  }

  saveToFile(fileName: string): Promise<void> {
    return AsyncFile.writeTextFile(
      fileName,
      this.header + this.content + this.tail
    )
  }
}
