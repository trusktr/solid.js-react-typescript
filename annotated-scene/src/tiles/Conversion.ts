/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as MapperProtos from '@mapperai/mapper-models'
import * as THREE from 'three'
import {isNullOrUndefined} from 'util' // eslint-disable-line node/no-deprecated-api
import {spatialTileScaleEnumToScaleVector} from './ScaleUtil'
import {PointCloudTileContents} from '../tiles/tile-model/TileContents'
import {TileMessage} from '../tiles/tile-model/TileMessage'

export function baseGeometryTileMessageToTileMessage(msg: MapperProtos.mapper.models.BaseGeometryTileMessage): TileMessage {
	const spatialIndex = msg.spatialIndex

	if (
		!spatialIndex ||
		isNullOrUndefined(spatialIndex.srid) ||
		isNullOrUndefined(spatialIndex.scale) ||
		isNullOrUndefined(spatialIndex.xIndex) || isNullOrUndefined(spatialIndex.yIndex) || isNullOrUndefined(spatialIndex.zIndex)
	) throw Error('found a bad tile with no spatial index')

	const scale = spatialTileScaleEnumToScaleVector(spatialIndex.scale)

	if (!scale) throw Error(`found a tile with unknown scale (${spatialIndex.scale})`)

	const utmZone = sridEnumToUtmZone(spatialIndex.srid)

	if (!utmZone) throw Error(`found a tile with invalid SRID (${spatialIndex.srid}): only UTM SRIDs are supported`)

	const origin = new THREE.Vector3(
		spatialIndex.xIndex * scale.x,
		spatialIndex.yIndex * scale.y,
		spatialIndex.zIndex * scale.z,
	)
	// See https://github.com/Signafy/Perception/blob/master/lib/MapTiles/src/PointCloudTile.cpp for the other side of these conversions.
	const points: Array<number> = []

	for (let i = 0; i < msg.points.length; i += 3) {
		points.push(msg.points[i] * 0.001 + origin.x)
		points.push(msg.points[i + 1] * 0.001 + origin.y)
		points.push(msg.points[i + 2] * 0.001 + origin.z)
	}

	const contents = new PointCloudTileContents(
		points,
		msg.colors.map(c => c * 0.003921568627450980),
	)

	return new TileMessage(
		origin,
		utmZone[0],
		utmZone[1],
		contents
	)
}

const firstUtmZone = 6
const utmZoneCount = 60

function sridEnumToUtmZone(srid: MapperProtos.mapper.models.SpatialReferenceSystemIdentifier): [number, boolean] | null {
	if (srid < firstUtmZone || srid >= firstUtmZone + utmZoneCount * 2) {
		return null
	} else {
		const northernHemisphere = srid < firstUtmZone + utmZoneCount
		const zoneNumber = northernHemisphere
			? srid - firstUtmZone + 1
			: srid - firstUtmZone + 1 - utmZoneCount

		return [zoneNumber, northernHemisphere]
	}
}
