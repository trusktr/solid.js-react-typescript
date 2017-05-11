/**
 *  Copyright 2017 Mapper Inc. Part of the mapper-annotator project.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

export interface CoordinateReferenceSystem {
    coordinateSystem: string
    datum: string
}

export interface UtmCrsParameters {
    utmZoneNumber: number
    utmZoneLetter: string
}

export interface UtmCrs extends CoordinateReferenceSystem {
    parameters: UtmCrsParameters
}

export interface LlaCrs extends CoordinateReferenceSystem {
}
