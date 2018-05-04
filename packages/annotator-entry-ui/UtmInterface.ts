/**
 *  Copyright 2017 Mapper Inc. Part of the mapper-annotator project.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as THREE from 'three'
import {isNull} from "util"
import * as utmConverter from 'utm'

export interface UtmLocalOrigin {
	utmZoneNumber: number
	utmZoneNorthernHemisphere: boolean
	offset: THREE.Vector3
}

/**
 * UtmInterface has two states: it has a zone or not. Zone can be set one time.
 * The 3D origin of the zone is defined by the UTM standard. We apply a local
 * offset to that origin to all point data, for the benefit of three.js.
 */
export class UtmInterface implements UtmLocalOrigin {
	private readonly defaultUtmZoneNumber: number = 18 // Washington, DC
	private readonly defaultUtmZoneNorthernHemisphere: boolean = true // Washington, DC
	private zoneAsString: string
	utmZoneNumber: number
	utmZoneNorthernHemisphere: boolean
	// this is an offset from UTM origin for display purposes:
	// three.js rendering breaks down on coordinates with high absolute value
	offset: THREE.Vector3
	private onSetOrigin: (() => void) | null

	constructor(onSetOrigin: (() => void) | null = null) {
		this.zoneAsString = ''
		this.utmZoneNumber = 0
		this.utmZoneNorthernHemisphere = false
		this.offset = new THREE.Vector3(0, 0, 0)
		this.onSetOrigin = onSetOrigin
	}

	static isValidUtmZone(num: number, northernHemisphere: boolean): boolean {
		return num >= 1 && num <= 60 && northernHemisphere !== null
	}

	utmZoneString(): string {
		if (this.zoneAsString) {
			return this.zoneAsString
		} else if (this.hasOrigin()) {
			this.zoneAsString = this.utmZoneNumber.toString() + (this.utmZoneNorthernHemisphere ? 'N' : 'S')
			return this.zoneAsString
		} else {
			return ''
		}
	}

	// Decide whether UTM values have been initialized.
	hasOrigin(): boolean {
		return this.offset !== null && UtmInterface.isValidUtmZone(this.utmZoneNumber, this.utmZoneNorthernHemisphere)
	}

	getOrigin(): UtmLocalOrigin {
		return this
	}

	setOriginWithInterface(utm: UtmInterface): boolean {
		if (utm.hasOrigin()) {
			return this.setOrigin(utm.utmZoneNumber, utm.utmZoneNorthernHemisphere, utm.offset)
		} else {
			return true
		}
	}

	// UTM origin can be set one time; subsequent attempts to set must match the first one.
	// Assume that the origin does not change for the lifetime of the application.
	setOrigin(num: number, northernHemisphere: boolean, offset: THREE.Vector3): boolean {
		if (this.hasOrigin()) {
			return this.offset.x === offset.x && this.offset.y === offset.y && this.offset.z === offset.z &&
				this.utmZoneNumber === num && this.utmZoneNorthernHemisphere === northernHemisphere
		} else {
			this.offset = offset
			if (UtmInterface.isValidUtmZone(num, northernHemisphere)) {
				this.utmZoneNumber = num
				this.utmZoneNorthernHemisphere = northernHemisphere
			} else {
				this.utmZoneNumber = this.defaultUtmZoneNumber
				this.utmZoneNorthernHemisphere = this.defaultUtmZoneNorthernHemisphere
			}
			if (!isNull(this.onSetOrigin))
				this.onSetOrigin()
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
