/**
 *  Copyright 2017 Mapper Inc. Part of the mapper-annotator project.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as THREE from 'three'

export interface CoordinateReferenceSystem {
    datum: string
}

export interface UtmCrs extends CoordinateReferenceSystem {
    utmZoneNumber: number
    utmZoneLetter: string
    offset: THREE.Vector3
}

export interface LlaCrs extends CoordinateReferenceSystem {
}
