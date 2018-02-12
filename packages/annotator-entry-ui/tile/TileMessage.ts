/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as MapperProtos from '@mapperai/mapper-models'
import Models = MapperProtos.mapper.models
import * as THREE from 'three'
import {isNullOrUndefined} from "util"

export enum TileMessageFormat {
	PointCloudTileMessage = 1,
	BaseGeometryTileMessage = 2,
}

export interface TileMessage {
	origin: THREE.Vector3
	utmZoneNumber: number
	utmZoneNorthernHemisphere: boolean
	points: number[]
	colors: number[]
	intensities: number[]
}

export function pointCloudTileMessageToTileMessage(msg: Models.PointCloudTileMessage): TileMessage {
	if (msg.sizeX) { // Messages created before ~2018-02-01 don't have spatialIndex.
		return {
			origin: new THREE.Vector3(msg.originX, msg.originY, msg.originZ),
			utmZoneNumber: msg.utmZoneNumber,
			utmZoneNorthernHemisphere: msg.utmZoneNorthernHemisphere,
			points: msg.points,
			colors: msg.colors,
			intensities: msg.intensities,
		} as TileMessage
	} else {
		const spatialIndex = msg.spatialIndex
		if (
			!spatialIndex
			|| isNullOrUndefined(spatialIndex.srid)
			|| isNullOrUndefined(spatialIndex.scale)
			|| isNullOrUndefined(spatialIndex.xIndex) || isNullOrUndefined(spatialIndex.yIndex) || isNullOrUndefined(spatialIndex.zIndex)
		)
			throw Error('found a bad tile with no spatial index')

		const scale = spatialTileScaleEnumToScaleVector(spatialIndex.scale)
		if (!scale)
			throw Error(`found a tile with unknown scale (${spatialIndex.scale})`)

		const utmZone = sridEnumToUtmZone(spatialIndex.srid)
		if (!utmZone)
			throw Error(`found a tile with invalid SRID (${spatialIndex.srid}): only UTM SRIDs are supported`)

		const origin = new THREE.Vector3(
			spatialIndex.xIndex * scale.x,
			spatialIndex.yIndex * scale.y,
			spatialIndex.zIndex * scale.z,
		)

		return {
			origin: origin,
			utmZoneNumber: utmZone[0],
			utmZoneNorthernHemisphere: utmZone[1],
			points: msg.points,
			colors: msg.colors,
			intensities: msg.intensities,
		} as TileMessage
	}
}

export function baseGeometryTileMessageToTileMessage(msg: Models.BaseGeometryTileMessage): TileMessage {
	const spatialIndex = msg.spatialIndex
	if (
		!spatialIndex
		|| isNullOrUndefined(spatialIndex.srid)
		|| isNullOrUndefined(spatialIndex.scale)
		|| isNullOrUndefined(spatialIndex.xIndex) || isNullOrUndefined(spatialIndex.yIndex) || isNullOrUndefined(spatialIndex.zIndex)
	)
		throw Error('found a bad tile with no spatial index')

	const scale = spatialTileScaleEnumToScaleVector(spatialIndex.scale)
	if (!scale)
		throw Error(`found a tile with unknown scale (${spatialIndex.scale})`)

	const utmZone = sridEnumToUtmZone(spatialIndex.srid)
	if (!utmZone)
		throw Error(`found a tile with invalid SRID (${spatialIndex.srid}): only UTM SRIDs are supported`)

	const origin = new THREE.Vector3(
		spatialIndex.xIndex * scale.x,
		spatialIndex.yIndex * scale.y,
		spatialIndex.zIndex * scale.z,
	)

	// See https://github.com/Signafy/Perception/blob/master/lib/MapTiles/src/PointCloudTile.cpp for the other side of these conversions.
	const points: Array<number> = []
	for (let i = 0; i < msg.points.length; i += 3) {
		points.push(msg.points[i    ] * 0.001 + origin.x)
		points.push(msg.points[i + 1] * 0.001 + origin.y)
		points.push(msg.points[i + 2] * 0.001 + origin.z)
	}

	return {
		origin: origin,
		utmZoneNumber: utmZone[0],
		utmZoneNorthernHemisphere: utmZone[1],
		points: points,
		colors: msg.colors.map(c => c * 0.003921568627450980),
		intensities: msg.intensities.map(i => i * 0.003921568627450980),
	} as TileMessage
}

function spatialTileScaleEnumToScaleVector(scale: Models.SpatialTileScale): THREE.Vector3 | null {
	switch (scale) {
		case Models.SpatialTileScale._010_010_010:
			return new THREE.Vector3(10, 10, 10)
		default:
			return null
	}
}

const firstUtmZone = 6
const utmZoneCount = 60

function sridEnumToUtmZone(srid: Models.SpatialReferenceSystemIdentifier): [number, boolean] | null {
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
