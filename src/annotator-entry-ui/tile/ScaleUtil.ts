/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as MapperProtos from '@mapperai/mapper-models'
import Models = MapperProtos.mapper.models
import {Scale3D} from "../geometry/Scale3D"
import {SpatialTileScale} from "../../grpc-compiled-protos/CoordinateReferenceSystem_pb"
import * as THREE from "three"

// tslint:disable:variable-name
const scale3D_008_008_008 = new Scale3D([8, 8, 8])
const scale3D_010_010_010 = new Scale3D([10, 10, 10])

const scaleVector_008_008_008 = new THREE.Vector3(8, 8, 8)
const scaleVector_010_010_010 = new THREE.Vector3(10, 10, 10)

export function stringToSpatialTileScale(str: string): SpatialTileScale | null {
	switch (str) {
		case '_008_008_008':
			return SpatialTileScale._008_008_008
		case '_010_010_010':
			return SpatialTileScale._010_010_010
		default:
			return null
	}
}

export function spatialTileScaleToScale3D(msg: SpatialTileScale): Scale3D | null {
	switch (msg) {
		case SpatialTileScale._008_008_008:
			return scale3D_008_008_008
		case SpatialTileScale._010_010_010:
			return scale3D_010_010_010
		default:
			return null
	}
}

export function scale3DToSpatialTileScale(scale: Scale3D): SpatialTileScale | null {
	if (scale.equals(scale3D_008_008_008))
		return SpatialTileScale._008_008_008
	else if (scale.equals(scale3D_010_010_010))
		return SpatialTileScale._010_010_010
	else
		return null
}

export function spatialTileScaleEnumToScaleVector(scale: Models.SpatialTileScale): THREE.Vector3 | null {
	switch (scale) {
		case Models.SpatialTileScale._008_008_008:
			return scaleVector_008_008_008
		case Models.SpatialTileScale._010_010_010:
			return scaleVector_010_010_010
		default:
			return null
	}
}
