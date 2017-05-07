/**
 *  Copyright 2017 Mapper Inc. Part of the mapper-annotator project.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as THREE from 'three'
import * as TypeLogger from 'typelogger'

TypeLogger.setLoggerOutput(console as any)
const log = TypeLogger.getLogger(__filename)

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
    offset: THREE.Vector3

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
}
