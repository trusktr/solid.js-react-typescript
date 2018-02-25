/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

const config = require('../../config')
import {isNullOrUndefined} from "util"
import * as grpc from 'grpc'
import * as TypeLogger from 'typelogger'
import {TileServiceClient as GrpcClient} from '../../grpc-compiled-protos/TileService_grpc_pb'
import {
	GetTilesRequest, GetTilesResponse,
	PingRequest, RangeSearchMessage, SearchTilesRequest,
	SearchTilesResponse
} from "../../grpc-compiled-protos/TileService_pb"
import {
	GeographicPoint3DMessage, SpatialReferenceSystemIdentifier, SpatialTileIndexMessage,
	SpatialTileScale
} from "../../grpc-compiled-protos/CoordinateReferenceSystem_pb"
import {TileRangeSearch} from "../model/TileRangeSearch"
import {RangeSearch} from "../model/RangeSearch"
import {TileIndex} from "../model/TileIndex"
import {Scale3D} from "../geometry/Scale3D"
import {RemoteTileInstance} from "../model/TileInstance"

// tslint:disable-next-line:no-any
TypeLogger.setLoggerOutput(console as any)
const log = TypeLogger.getLogger(__filename)

// tslint:disable:variable-name
const scale_008_008_008 = new Scale3D([8, 8, 8])
const scale_010_010_010 = new Scale3D([10, 10, 10])

function stringToSpatialTileScale(str: string): SpatialTileScale | null {
	switch (str) {
		case '_008_008_008':
			return SpatialTileScale._008_008_008
		case '_010_010_010':
			return SpatialTileScale._010_010_010
		default:
			return null
	}
}

function spatialTileScaleToScale3D(msg: SpatialTileScale): Scale3D | null {
	switch (msg) {
		case SpatialTileScale._008_008_008:
			return scale_008_008_008
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

const pingRequest = new PingRequest()

export class TileServiceClient {
	private srid: SpatialReferenceSystemIdentifier
	private scale: SpatialTileScale
	private baseTileLayerId: LayerId
	private layerIdsQuery: LayerId[]
	private tileServiceAddress: string
	private client: GrpcClient | null
	private onTileServiceStatusUpdate: (tileServiceStatus: boolean) => void
	private serverStatus: boolean | null // null == untested; true == available; false == unavailable
	private pingInFlight: boolean // semaphore for pingServer()
	private healthCheckInterval: number // configuration for pinging the server

	constructor(onTileServiceStatusUpdate: (tileServiceStatus: boolean) => void) {
		this.serverStatus = null
		this.pingInFlight = false
		this.onTileServiceStatusUpdate = onTileServiceStatusUpdate
		this.healthCheckInterval = config.get('tile_client.service.health_check.interval.seconds') * 1000

		this.srid = SpatialReferenceSystemIdentifier.ECEF // TODO config: UTM_10N
		const scale = stringToSpatialTileScale(config.get('tile_client.tile_scale') || '_010_010_010')
		if (isNullOrUndefined(scale))
			throw Error(`invalid tile_client.tile_scale config: ${config.get('tile_client.tile_scale')}`)
		this.scale = scale
		this.baseTileLayerId = 'base1' // TODO config
		this.layerIdsQuery = [this.baseTileLayerId]
		const tileServiceHost = config.get('tile_client.service.host') || 'localhost'
		const tileServicePort = config.get('tile_client.service.port') || '50051'
		this.tileServiceAddress = tileServiceHost + ':' + tileServicePort
		this.client = null
	}

	// Lazily create the gRPC client and initiate server health checks. All gRPC requests (except the ping check)
	// must call connect() first.
	private connect(): Promise<void> {
		if (this.client)
			return Promise.resolve()

		log.info('connecting to tile server at', this.tileServiceAddress)
		this.client = new GrpcClient(this.tileServiceAddress, grpc.credentials.createInsecure())

		const result = this.pingServer()
		this.periodicallyCheckServerStatus()
		return result
	}

	private periodicallyCheckServerStatus(): void {
		if (this.healthCheckInterval) {
			const self = this
			setInterval(
				(): Promise<void> => self.pingServer().then(),
				this.healthCheckInterval
			)
		}
	}

	// Ping checks and this.serverStatus maintain a local copy of server state, for diagnostics.
	// TODO The gRPC client has a default timeout of 20s when the server is unresponsive. It would be nice to reduce that for pings.
	private pingServer(): Promise<void> {
		if (!this.client)
			return Promise.reject(Error('attempted to pingServer() before initializing client'))
		if (this.pingInFlight)
			return Promise.resolve()
		this.pingInFlight = true

		return new Promise((resolve: () => void): void => {
			this.client!.ping(pingRequest, (err: Error): void => {
				this.setServerStatus(!err)
				this.pingInFlight = false
				resolve()
			})
		})
	}

	private setServerStatus(newStatus: boolean): void {
		if (this.serverStatus === null || this.serverStatus !== newStatus) {
			this.serverStatus = newStatus
			this.onTileServiceStatusUpdate(newStatus)
		}
	}

	// Get all available tiles within a rectangular region specified by minimum and maximum points.
	getTilesByCoordinateRange(search: RangeSearch): Promise<RemoteTileInstance[]> {
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

		return this.connect()
			.then(() => this.getTiles(corner1, corner2))
	}

	// Get all available tiles within a rectangular region specified by minimum and maximum corner tiles.
	getTilesByTileRange(search: TileRangeSearch): Promise<RemoteTileInstance[]> {
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

		return this.connect()
			.then(() => this.getTiles(corner1, corner2))
	}

	private getTiles(corner1: GeographicPoint3DMessage, corner2: GeographicPoint3DMessage): Promise<RemoteTileInstance[]> {
		const rangeSearch = new RangeSearchMessage()
		rangeSearch.setCorner1(corner1)
		rangeSearch.setCorner2(corner2)
		rangeSearch.setScale(this.scale)
		const request = new SearchTilesRequest()
		request.setRangeSearch(rangeSearch)
		request.setLayerIdsList(this.layerIdsQuery)

		return new Promise((resolve: (tile: RemoteTileInstance[]) => void, reject: (reason?: Error) => void): void => {
			this.client!.searchTiles(request, (err: Error, response: SearchTilesResponse): void => {
				if (err) {
					reject(Error(`searchTiles() failed: ${err.message}`))
				} else {
					const tiles: RemoteTileInstance[] = []
					response.getTileInstancesList().forEach(instance => {
						const tileIndex = spatialTileIndexMessageToTileIndex(instance.getId())
						if (tileIndex) {
							instance.getLayersMap()
								.forEach((layerUrl, layerId) => {
									if (layerId === this.baseTileLayerId) // should be always true
										tiles.push(new RemoteTileInstance(
											tileIndex,
											layerId,
											layerUrl,
										))
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

	getTileContents(url: string): Promise<Uint8Array> {
		return this.connect()
			.then(() => this.getTileContentsImpl(url))
	}

	private getTileContentsImpl(url: string): Promise<Uint8Array> {
		const request = new GetTilesRequest()
		request.addUrls(url)

		return new Promise((resolve: (tile: Uint8Array) => void, reject: (reason?: Error) => void): void => {
			this.client!.getTiles(request, (err: Error, response: GetTilesResponse): void => {
				if (err) {
					reject(Error(`getTiles() failed: ${err.message}`))
				} else {
					if (!response.getTileContentsList().length) {
						reject(Error(`getTiles() return no results`))
					} else {
						const firstResult = response.getTileContentsList()[0]
						if (firstResult.getUrl() === url)  // should be always true
							resolve(firstResult.getContents_asU8())
						else
							reject(Error(`getTiles() returned unknown url ${firstResult.getUrl()}`))
					}
				}
			})
		})
	}
}
