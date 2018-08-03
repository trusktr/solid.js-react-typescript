/**
 *  Copyright 2017 Mapper Inc. Part of the mapper-annotator project.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as THREE from 'three'
import * as utmConverter from 'utm'
import AnnotatedSceneActions from './src/store/actions/AnnotatedSceneActions'

/**
 * UtmCoordinateSystem has two states: it has a zone or not. Zone can be set one time.
 * The 3D origin of the zone is defined by the UTM standard. We apply a local
 * offset to that origin to all point data, for the benefit of three.js.
 */
export class UtmCoordinateSystem {
	private readonly defaultUtmZoneNumber: number = 18 // Washington, DC
	private readonly defaultUtmZoneNorthernHemisphere: boolean = true // Washington, DC
	private zoneAsString: string
	readonly datum: string = 'WGS84'
	utmZoneNumber: number
	utmZoneNorthernHemisphere: boolean
	// this is an offset from UTM origin for display purposes:
	// three.js rendering breaks down on coordinates with high absolute value
	offset: THREE.Vector3
	// private onSetOrigin: (() => void) | null

	constructor() {
		this.zoneAsString = ''
		this.utmZoneNumber = 0
		this.utmZoneNorthernHemisphere = false
		this.offset = new THREE.Vector3(0, 0, 0)

		// TODO JOE replace with event
		// this.onSetOrigin = onSetOrigin
	}

	static isValidUtmZone(num: number, northernHemisphere: boolean): boolean {
		return num >= 1 && num <= 60 && northernHemisphere !== null
	}

	toString(): string {
		let offsetStr: string

		if (!this.offset)
			offsetStr = 'null'
		else
			offsetStr = this.offset.x + ',' + this.offset.y + ',' + this.offset.z

		return 'UtmCoordinateSystem(UTM Zone: ' + this.utmZoneNumber + this.utmZoneNorthernHemisphere + ', offset: [' + offsetStr + '])'
	}

	utmZoneString(): string {
		if (this.zoneAsString) {
			return this.zoneAsString
		} else if (this.hasOrigin) {
			this.zoneAsString = this.utmZoneNumber.toString() + (this.utmZoneNorthernHemisphere ? 'N' : 'S')
			return this.zoneAsString
		} else {
			return ''
		}
	}

	// Decide whether UTM values have been initialized.
	get hasOrigin(): boolean {
		return this.offset !== null && UtmCoordinateSystem.isValidUtmZone(this.utmZoneNumber, this.utmZoneNorthernHemisphere)
	}

	// Test whether the given zone parameters match the current coordinate system.
	zoneMatch(num: number, northernHemisphere: boolean): boolean {
		return this.utmZoneNumber === num && this.utmZoneNorthernHemisphere === northernHemisphere
	}

	// UTM origin can be set one time; subsequent attempts to set must match the first one.
	// Assume that the origin does not change for the lifetime of the application.
	setOrigin(num: number, northernHemisphere: boolean, offset: THREE.Vector3): boolean {
		if (!offset) {
			return false
		} else if (this.hasOrigin) {
			return this.offset.x === offset.x && this.offset.y === offset.y && this.offset.z === offset.z &&
				this.zoneMatch(num, northernHemisphere)
		} else {
			this.offset = offset.clone()

			if (UtmCoordinateSystem.isValidUtmZone(num, northernHemisphere)) {
				this.utmZoneNumber = num
				this.utmZoneNorthernHemisphere = northernHemisphere
			} else {
				// TODO CLYDE This legacy behavior should be an error (return false) once we ensure that upstream data sources generate UTM data correctly.
				this.utmZoneNumber = this.defaultUtmZoneNumber
				this.utmZoneNorthernHemisphere = this.defaultUtmZoneNorthernHemisphere
			}

			// NOTE JOE this is only triggered once, but in the future the origin will be able to be changed or reset
			new AnnotatedSceneActions().setInitialOriginSet(true)

			return true
		}
	}

	threeJsToUtm(p: THREE.Vector3): THREE.Vector3 {
		// Convert ThreeJS point to (easting, northing, altitude)
		const utmPoint = new THREE.Vector3(p.x, -p.z, p.y)

		utmPoint.add(this.offset)
		return utmPoint
	}

	utmVectorToThreeJs(utm: THREE.Vector3): THREE.Vector3 {
		return this.utmToThreeJs(utm.x, utm.y, utm.z)
	}

	utmToThreeJs(easting: number, northing: number, altitude: number): THREE.Vector3 {
		const tmp = new THREE.Vector3(easting, northing, altitude)

		tmp.sub(this.offset)
		// In ThreeJS x=easting, y=altitude, z=-northing
		return new THREE.Vector3(tmp.x, tmp.z, -tmp.y)
	}

	threeJsToLngLatAlt(p: THREE.Vector3): THREE.Vector3 {
		// First change coordinate frame from THREE js to UTM
		const utm = this.threeJsToUtm(p)
		const lngLat = utmConverter.toLatLon(utm.x, utm.y, this.utmZoneNumber, undefined, this.utmZoneNorthernHemisphere, true)

		return new THREE.Vector3(lngLat.longitude, lngLat.latitude, utm.z)
	}

	lngLatAltToThreeJs(lngLatAlt: THREE.Vector3): THREE.Vector3 {
		const utm = utmConverter.fromLatLon(lngLatAlt.y, lngLatAlt.x, this.utmZoneNumber)

		return this.utmToThreeJs(utm.easting, utm.northing, lngLatAlt.z)
	}

	utmVectorToLngLatAlt(utm: THREE.Vector3): THREE.Vector3 {
		const lngLat = utmConverter.toLatLon(utm.x, utm.y, this.utmZoneNumber, undefined, this.utmZoneNorthernHemisphere, true)

		return new THREE.Vector3(lngLat.longitude, lngLat.latitude, utm.z)
	}
}
