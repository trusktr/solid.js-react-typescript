/**
 *  Copyright 2017 Mapper Inc. Part of the mapper-annotator project.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as THREE from 'three'
import * as TypeLogger from 'typelogger'

TypeLogger.setLoggerOutput(console as any)
const log = TypeLogger.getLogger(__filename)
const utmObj = new (require('utm-latlng'))()

export interface UtmLocalOrigin {
    utmZoneNumber: number
    utmZoneLetter: string
    offset: THREE.Vector3
}

/**
 * UtmInterface has two states: it has a zone or not. Zone can be set one time.
 * The 3D origin of the zone is defined by the UTM standard. We apply a local
 * offset to that origin to all point data, for the benefit of three.js.
 */
export class UtmInterface implements UtmLocalOrigin {
    private readonly defaultUtmZoneNumber: number = 18 // Washington, DC
    private readonly defaultUtmZoneLetter: string = 'S' // Washington, DC

    utmZoneNumber: number
    utmZoneLetter: string
    // this is an offset from UTM origin for display purposes:
    // three.js rendering breaks down on coordinates with high absolute value
    offset: THREE.Vector3 = new THREE.Vector3(0, 0, 0)

    static isValidUtmZone(number: number, letter: string): boolean {
        return number >= 1 && number <= 60 &&
            letter.length == 1 &&
            letter >= "C" && letter <= "X" &&
            letter != "I" && letter != "O"
    }

    // Decide whether UTM values have been initialized.
    hasOrigin(): boolean {
        return this.offset !== null && UtmInterface.isValidUtmZone(this.utmZoneNumber, this.utmZoneLetter)
    }

    getOrigin(): UtmLocalOrigin {
        return this
    }

    setOriginWithInterface(utm: UtmInterface): boolean {
        if (utm.hasOrigin()) {
            return this.setOrigin(utm.utmZoneNumber, utm.utmZoneLetter, utm.offset)
        } else {
            return true
        }
    }

    // UTM origin can be set one time; subsequent attempts to set must match the first one.
    // Assume that the origin does not change for the lifetime of the application.
    setOrigin(number: number, letter: string, offset: THREE.Vector3): boolean {
        if (this.hasOrigin()) {
            return this.offset.x === offset.x && this.offset.y === offset.y && this.offset.z === offset.z &&
                this.utmZoneNumber === number && this.utmZoneLetter === letter
        } else {
            this.offset = offset
            if (UtmInterface.isValidUtmZone(number, letter)) {
                this.utmZoneNumber = number
                this.utmZoneLetter = letter
            } else {
                this.utmZoneNumber = this.defaultUtmZoneNumber
                this.utmZoneLetter = this.defaultUtmZoneLetter
            }
            log.info('setting UTM zone: ' + this.utmZoneNumber + this.utmZoneLetter)
            log.info('setting UTM origin offset: ' + this.offset.x + ', ' + this.offset.y + ', ' + this.offset.z)
            return true
        }
    }

    threeJsToUtm(p: THREE.Vector3): THREE.Vector3 {
        let utmPoint = new THREE.Vector3(p.x, -p.y, -p.z)
        utmPoint.add(this.offset)
        return utmPoint
    }

    utmToThreeJs(x: number, y: number, z: number): THREE.Vector3 {
        let tmp = new THREE.Vector3(x, y, z)
        tmp.sub(this.offset)
        return new THREE.Vector3(tmp.x, -tmp.y, -tmp.z)
    }

    threeJsToLatLng(p: THREE.Vector3) {
        // First change coordinate frame from THREE js to UTM
        let utm = this.threeJsToUtm(p)
        // Get latitude longitude
        return utmObj.convertUtmToLatLng(utm.x, utm.y, this.utmZoneNumber, this.utmZoneLetter)
    }

    threeJsToLla(p: THREE.Vector3): THREE.Vector3 {
        // First change coordinate frame from THREE js to UTM
        let utm = this.threeJsToUtm(p)
        // Get latitude longitude
        let latLon = utmObj.convertUtmToLatLng(utm.x, utm.y, this.utmZoneNumber, this.utmZoneLetter)
        return new THREE.Vector3(latLon.lng, latLon.lat, utm.z)
    }
}
