/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as MapperProtos from '@mapperai/mapper-models'
import {Scale3D} from '../geometry/Scale3D'
import {SpatialTileScale} from '../grpc-compiled-protos/CoordinateReferenceSystem_pb'
import * as THREE from 'three'

// tslint:disable:variable-name
/* eslint-disable camelcase */
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

export function spatialTileScaleToString(scale: SpatialTileScale): string | null {
	switch (scale) {
		case SpatialTileScale._008_008_008:
			return '_008_008_008'
		case SpatialTileScale._010_010_010:
			return '_010_010_010'
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

export function spatialTileScaleEnumToScaleVector(scale: MapperProtos.mapper.models.SpatialTileScale): THREE.Vector3 | null {
	switch (scale) {
		case MapperProtos.mapper.models.SpatialTileScale._008_008_008:
			return scaleVector_008_008_008
		case MapperProtos.mapper.models.SpatialTileScale._010_010_010:
			return scaleVector_010_010_010
		default:
			return null
	}
}
/* eslint-enable camelcase */
