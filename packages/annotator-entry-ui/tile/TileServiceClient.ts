/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as grpc from 'grpc'
import * as TypeLogger from 'typelogger'
import {TileServiceClient as GrpcClient} from '../../grpc-compiled-protos/TileService_grpc_pb'
import {RangeSearchMessage, SearchTilesRequest, SearchTilesResponse} from "../../grpc-compiled-protos/TileService_pb"
import {
	GeographicPoint3DMessage, SpatialReferenceSystemIdentifier, SpatialTileIndexMessage,
	SpatialTileScale
} from "../../grpc-compiled-protos/CoordinateReferenceSystem_pb"
import {TileRangeSearch} from "../model/TileRangeSearch"
import {RangeSearch} from "../model/RangeSearch"
import {TileIndex} from "../model/TileIndex"
import {Scale3D} from "../geometry/Scale3D"
import {FileSystemTileMetadata} from "./FileSystemTileMetadata"

// tslint:disable-next-line:no-any
TypeLogger.setLoggerOutput(console as any)
const log = TypeLogger.getLogger(__filename)

// tslint:disable-next-line:variable-name
const scale_010_010_010 = new Scale3D([10, 10, 10])

function spatialTileScaleToScale3D(msg: SpatialTileScale): Scale3D | null {
	switch (msg) {
		case SpatialTileScale._010_010_010:
			return scale_010_010_010
		default:
			return null
	}
}

function spatialTileIndexMessageToTileIndex(msg: SpatialTileIndexMessage | undefined): TileIndex | null {
	if (!msg) return null
	// log.info('ti', msg.getSrid()) // todo validate
	const scale = spatialTileScaleToScale3D(msg.getScale())
	if (!scale) return null
	return new TileIndex(
		scale,
		msg.getXIndex(),
		msg.getYIndex(),
		msg.getZIndex()
	)
}

export class TileServiceClient {
	private srid: SpatialReferenceSystemIdentifier
	private scale: SpatialTileScale
	private baseTileLayerId: LayerId
	private layerIdsQuery: LayerId[]
	private client: GrpcClient

	constructor() {
		this.srid = SpatialReferenceSystemIdentifier.ECEF // TODO config: UTM_10N
		this.scale = SpatialTileScale._010_010_010 // TODO config
		this.baseTileLayerId = 'base1' // TODO config
		this.layerIdsQuery = [this.baseTileLayerId]
		const tileServiceAddress = 'localhost:50051' // TODO config
		this.client = new GrpcClient(tileServiceAddress, grpc.credentials.createInsecure())
	}

	// Get all available tiles within a rectangular region specified by minimum and maximum points.
	getTilesByCoordinateRange(search: RangeSearch): Promise<FileSystemTileMetadata[]> {
		const corner1 = new GeographicPoint3DMessage()
		corner1.setSrid(this.srid)
		corner1.setX(search.minPoint.x)
		corner1.setY(search.minPoint.y)
		corner1.setZ(search.minPoint.z)
		const corner2 = new GeographicPoint3DMessage()
		corner2.setSrid(this.srid)
		// todo fix off by one at max edge
		corner2.setX(search.maxPoint.x - 0.001)
		corner2.setY(search.maxPoint.y - 0.001)
		corner2.setZ(search.maxPoint.z - 0.001)
		return this.getTiles(corner1, corner2)
	}

	// Get all available tiles within a rectangular region specified by minimum and maximum corner tiles.
	getTilesByTileRange(search: TileRangeSearch): Promise<FileSystemTileMetadata[]> {
		const corner1 = new GeographicPoint3DMessage()
		corner1.setSrid(this.srid)
		corner1.setX(search.minTileIndex.origin.x)
		corner1.setY(search.minTileIndex.origin.y)
		corner1.setZ(search.minTileIndex.origin.z)
		const corner2 = new GeographicPoint3DMessage()
		corner2.setSrid(this.srid)
		// todo fix off by one at max edge
		corner2.setX(search.maxTileIndex.origin.x + search.maxTileIndex.scale.xSize - 0.001)
		corner2.setY(search.maxTileIndex.origin.y + search.maxTileIndex.scale.ySize - 0.001)
		corner2.setZ(search.maxTileIndex.origin.z + search.maxTileIndex.scale.zSize - 0.001)
		return this.getTiles(corner1, corner2)
	}

	private getTiles(corner1: GeographicPoint3DMessage, corner2: GeographicPoint3DMessage): Promise<FileSystemTileMetadata[]> {
		const rangeSearch = new RangeSearchMessage()
		rangeSearch.setCorner1(corner1)
		rangeSearch.setCorner2(corner2)
		rangeSearch.setScale(this.scale)
		const request = new SearchTilesRequest()
		request.setRangeSearch(rangeSearch)
		request.setLayerIdsList(this.layerIdsQuery)

		return new Promise((resolve: (tile: FileSystemTileMetadata[]) => void, reject: (reason?: Error) => void): void => {
			this.client.searchTiles(request, (err: Error, response: SearchTilesResponse): void => {
				if (err) {
					reject(Error(`TileServiceClient search failed: ${err.message}`))
				} else {
					const tiles: FileSystemTileMetadata[] = []
					response.getTileInstancesList().forEach(instance => {
						const tileIndex = spatialTileIndexMessageToTileIndex(instance.getId())
						if (tileIndex) {
							instance.getLayersMap().forEach((layerUrl, layerId) => {
								if (layerId === this.baseTileLayerId) { // should be always true
									// For now we are assuming a tile service running on localhost.
									if (layerUrl.indexOf('file://') === 0)
										layerUrl = layerUrl.substring(7)
									else
										log.warn(`found a tile with unknown url type: ${layerUrl}`)
									tiles.push({
										tileIndex: tileIndex,
										path: layerUrl,
									})
								}
							})
						} else {
							log.warn('found tile with bad SpatialTileIndexMessage')
						}
					})
					resolve(tiles)
				}
			})
		})
	}
}
