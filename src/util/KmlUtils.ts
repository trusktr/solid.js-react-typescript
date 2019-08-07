/**
 *  Copyright 2017 Mapper Inc. Part of the mapper-annotator project.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as THREE from 'three'

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
  template = (content: string) => `<?xml version="1.0" encoding="UTF-8"?>
    <kml xmlns="http://www.opengis.net/kml/2.2">
      <Document>
        <Style id="white">
          <LineStyle>
            <color>66ffffff</color>
          </LineStyle>
          <PolyStyle>
            <color>66999999</color>
          </PolyStyle>
        </Style>
        <Style id="green">
          <LineStyle>
            <color>6600ff00</color>
          </LineStyle>
          <PolyStyle>
            <color>66009900</color>
          </PolyStyle>
        </Style>

        ${content}

      </Document>
    </kml>
  `

  content = ''

  addPoints(points: Array<THREE.Vector3>, style: String = 'white'): void {
    points.forEach(p => this.addPoint(p, style))
  }

  addPoint(point: THREE.Vector3, style: String = 'white'): void {
    const path = `
          <Placemark>
            <styleUrl>#${style}</styleUrl>
            <Point>
              <coordinates>
                ${point.x},${point.y},${point.z}
              </coordinates>
            </Point>
          </Placemark>
    `
    this.content += path
  }

  addPath(points: Array<THREE.Vector3>, style: String = 'white'): void {
    let path = `
          <Placemark>
            <styleUrl>#${style}</styleUrl>
            <LineString>
              <altitudeMode>clampToGround</altitudeMode>
              <coordinates>\n`

    points.forEach(point => {
      path += `          ${point.x},${point.y},${point.z}\n`
    })

    path += `
              </coordinates>
            </LineString>
          </Placemark>
    `

    this.content += path
  }

  addPolygon(points: Array<THREE.Vector3>, style: String = 'green'): void {
    let path = `
          <Placemark>
            <styleUrl>#${style}</styleUrl>
            <Polygon>
              <tessellate>1</tessellate>
              <altitudeMode>clampToGround</altitudeMode>
              <outerBoundaryIs>
                <LinearRing>
                  <coordinates>\n`

    points.concat(points[0]).forEach(point => {
      path += `          ${point.x},${point.y},${point.z}\n`
    })

    path += `
                  </coordinates>
                </LinearRing>
              </outerBoundaryIs>
            </Polygon>
          </Placemark>
    `
    this.content += path
  }

  toString() {
    return this.template(this.content)
  }
}
