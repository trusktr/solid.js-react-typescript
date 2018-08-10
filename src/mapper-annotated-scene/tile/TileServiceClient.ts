/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import config from '../../config'
import {isNullOrUndefined} from 'util' // eslint-disable-line node/no-deprecated-api
import * as grpc from 'grpc'
import {TileServiceClient as GrpcClient} from '../grpc-compiled-protos/TileService_grpc_pb'
import {
	GetTilesRequest, GetTilesResponse,
	PingRequest, RangeSearchMessage, SearchTilesRequest,
	SearchTilesResponse,
} from '../grpc-compiled-protos/TileService_pb'
import {
	GeographicPoint3DMessage, SpatialReferenceSystemIdentifier, SpatialTileIndexMessage,
	SpatialTileScale,
} from '../grpc-compiled-protos/CoordinateReferenceSystem_pb'
import {RangeSearch} from '../tile-model/RangeSearch'
import {TileIndex} from '../tile-model/TileIndex'
import {TileInstance} from '../tile-model/TileInstance'
import {scale3DToSpatialTileScale, spatialTileScaleToScale3D} from './ScaleUtil'
import Logger from '../../util/log'
import {ScaleProvider} from './ScaleProvider'
import {EventEmitter} from 'events'
import {Events} from '../src/models/Events'
import {LayerId} from '../../types/TypeAlias'
import {TilesRequest, TilesRequestRequestsItem} from '@mapperai/mapper-cloud-tiles-typescript-sdk/api'
import * as S3 from 'aws-sdk/clients/s3'
import {GetObjectRequest} from 'aws-sdk/clients/s3'

const log = Logger(__filename)

function spatialTileIndexMessageToTileIndex(msg: SpatialTileIndexMessage | undefined): TileIndex | null {
	if (!msg) return null

	// TODO CLYDE validate msg.getSrid()===this.srid (and fix the output on the server side)
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

// We generate tile searches using the boundaries of super tiles. Tile boundaries are inclusive on the
// lower faces and exclusive on the upper faces. Apply an offset from the upper boundaries to avoid
// retrieving a bunch of extra tiles there.
export const tileSearchOffset = -0.001
export abstract class MapperTileServiceClient {
	protected scale: SpatialTileScale
	protected eventEmitter: EventEmitter

	constructor(scaleProvider: ScaleProvider, eventEmitter: EventEmitter) {
		if (config['tile_client.tile_scale'])
			log.warn('Config option tile_client.tile_scale is deprecated. Use tile_manager.utm_tile_scale.')

		const scale = scale3DToSpatialTileScale(scaleProvider.utmTileScale)

		if (isNullOrUndefined(scale))
			throw Error(`invalid utmTileScale: ${scaleProvider.utmTileScale}`)
		this.scale = scale

		this.eventEmitter = eventEmitter
	}

	abstract getTileContents(url: string): Promise<Uint8Array>
}
export class GrpcTileServiceClient extends MapperTileServiceClient {
	private srid: SpatialReferenceSystemIdentifier
	private tileServiceAddress: string
	private client: GrpcClient | null
	private serverStatus: boolean | null // null == untested; true == available; false == unavailable
	private pingInFlight: boolean // semaphore for pingServer()
	private healthCheckInterval: number // configuration for pinging the server

	constructor(scaleProvider: ScaleProvider, eventEmitter: EventEmitter) {
		super(scaleProvider, eventEmitter)

		this.serverStatus = null
		this.pingInFlight = false
		this.healthCheckInterval = config['tile_client.service.health_check.interval.seconds'] * 1000

		this.srid = SpatialReferenceSystemIdentifier.ECEF // TODO CLYDE config: UTM_10N (and make the server aware of UTM zones)

		const tileServiceHost = config['tile_client.service.host'] || 'localhost'
		const tileServicePort = config['tile_client.service.port'] || '50051'

		this.tileServiceAddress = tileServiceHost + ':' + tileServicePort
		this.client = null
	}

	// Lazily create the gRPC client and initiate server health checks. All gRPC requests (except the ping check)
	// must call connect() first.
	private connect(): Promise<void> {
		if (this.client) return Promise.resolve()

		log.info('connecting to tile server at', this.tileServiceAddress)

		this.client = new GrpcClient(
			this.tileServiceAddress,
			grpc.credentials.createInsecure(),
			{'grpc.max_receive_message_length': 100 * 1024 * 1024} // tiles should be maximum 10s of MB
		)

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
	// TODO CLYDE The gRPC client has a default timeout of 20s when the server is unresponsive. It would be nice to reduce that for pings.
	private pingServer(): Promise<void> {
		if (!this.client) return Promise.reject(Error('attempted to pingServer() before initializing client'))

		if (this.pingInFlight) return Promise.resolve()

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
			this.eventEmitter.emit(Events.TILE_SERVICE_STATUS_UPDATE, newStatus)
		}
	}

	// Get all available tiles within a rectangular region specified by minimum and maximum points.
	getTilesByCoordinateRange(layerId: LayerId, search: RangeSearch): Promise<TileInstance[]> {
		const corner1 = new GeographicPoint3DMessage()

		corner1.setSrid(this.srid)
		corner1.setX(search.minPoint.x)
		corner1.setY(search.minPoint.y)
		corner1.setZ(search.minPoint.z)

		const corner2 = new GeographicPoint3DMessage()

		corner2.setSrid(this.srid)
		corner2.setX(search.maxPoint.x + tileSearchOffset)
		corner2.setY(search.maxPoint.y + tileSearchOffset)
		corner2.setZ(search.maxPoint.z + tileSearchOffset)

		return this.connect()
			.then(() => this.getTiles(layerId, corner1, corner2))
	}

	private getTiles(layerId: LayerId, corner1: GeographicPoint3DMessage, corner2: GeographicPoint3DMessage): Promise<TileInstance[]> {
		const rangeSearch = new RangeSearchMessage()

		rangeSearch.setCorner1(corner1)
		rangeSearch.setCorner2(corner2)
		rangeSearch.setScale(this.scale)

		const request = new SearchTilesRequest()

		request.setRangeSearch(rangeSearch)
		request.setLayerIdsList([layerId])

		return new Promise((resolve: (tile: TileInstance[]) => void, reject: (reason?: Error) => void): void => {
			this.client!.searchTiles(request, (err: Error, response: SearchTilesResponse): void => {
				if (err) {
					reject(Error(`searchTiles() failed: ${err.message}`))
				} else {
					const tiles: TileInstance[] = []

					response.getTileInstancesList().forEach(instance => {
						const tileIndex = spatialTileIndexMessageToTileIndex(instance.getId())

						if (tileIndex) {
							instance.getLayersMap()
								.forEach((responseLayerUrl, responseLayerId) => {
									if (responseLayerId === layerId) { // should be always true
										tiles.push(new TileInstance(
											tileIndex,
											responseLayerId,
											responseLayerUrl,
										))
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

						if (firstResult.getUrl() === url) // should be always true
							resolve(firstResult.getContents_asU8())
						else
							reject(Error(`getTiles() returned unknown url ${firstResult.getUrl()}`))
					}
				}
			})
		})
	}
}
export class RestTileServiceClient extends MapperTileServiceClient {
	private srid: SpatialReferenceSystemIdentifier

	constructor(scaleProvider: ScaleProvider, eventEmitter: EventEmitter) {
		super(scaleProvider, eventEmitter)
		this.srid = SpatialReferenceSystemIdentifier.UTM_10N // TODO clyde make this configurable
	}

	// Get all tiles in the list.
	getTilesByTileIds(layerId: LayerId, tileIds: TileIndex[]): Promise<TileInstance[]> {
		// TODO clyde implement
		log.info('layerId', layerId, 'tileIds', tileIds.length)

		const tableName = 'bla-bla' // Calculate table name
		const token = 'bla-bla-token'
		const apiVersion = '1'
		const requestItems = tileIds.map(id => RestTileServiceClient.convertToRequestItem(tableName, id.toString()))
		const tilesRequest: TilesRequest = {requests: requestItems}

		// return this.tilesClient.tilesVersionTilePost(apiVersion, "annotator", token, tilesRequest)

		return Promise.reject(Error('getTilesByTileIds() not implemented'))
	}

	getTileContents(url: string): Promise<Uint8Array> {
		// TODO clyde implement
		log.info('url', url)

		const r: GetObjectRequest = {} as GetObjectRequest
		const s3 = new S3()

		s3.getObject(r)

		return Promise.reject(Error('getTileContents() not implemented'))
	}

	private static convertToRequestItem(tableName: string, id: string): TilesRequestRequestsItem {
		return {
			fromEpochMillis: 0,
			toEpochMillis: Number.MAX_VALUE,
			limit: 1,
			id: id,
			tableName: tableName,
		}
	}

	// TODO clyde implement some version of setServerStatus()
}
