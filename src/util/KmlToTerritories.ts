/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as THREE from 'three'
import * as KML from 'gtran-kml'
import {Territory} from '../mapper-annotated-scene/annotations/Territory'
import * as lodash from 'lodash'
import {UtmCoordinateSystem} from '../mapper-annotated-scene/UtmCoordinateSystem'

// TODO CLYDE gtran-kml drops altitude data, which is totally lame. Find a library which doesn't do that, and get
// TODO CLYDE   a better number from the KML. This one just tries to place territories below everything else.
const altitude = -20.0

export function kmlToTerritories(utmCoordinateSystem: UtmCoordinateSystem, path: string): Promise<Territory[]> {
	return KML.toGeoJson(path)
		.then(geojson => {
			if (
				!(geojson.type && geojson.type === 'FeatureCollection' &&
					geojson.features && Array.isArray(geojson.features))
			) return Promise.reject(Error(`invalid KML in ${path}`))

			const territories: Territory[] = []

			geojson.features.forEach(feature => {
				if (
					feature.properties && feature.properties.name &&
					feature.geometry && feature.geometry.coordinates && Array.isArray(feature.geometry.coordinates)
				) {
					feature.geometry.coordinates.forEach(coordinateArray => {
						const t = new Territory()

						t.setLabel(feature.properties.name)

						coordinateArray
							.filter(c => Array.isArray(c) && lodash.isFinite(c[0]) && lodash.isFinite(c[1]))
							.forEach(c => {
								const lla = new THREE.Vector3(c[0], c[1], altitude)

								t.addMarker(utmCoordinateSystem.lngLatAltToThreeJs(lla), false)
							})

						t.complete()

						if (t.isValid()) territories.push(t)
					})
				}
			})

			return territories
		})
}
