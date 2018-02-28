///<reference path="../../../node_modules/@types/zmq/index.d.ts"/>
import * as MapperProtos from "@mapperai/mapper-models";

/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

const config = require('../../config')
import * as TypeLogger from 'typelogger'
import {Socket} from 'zmq'
const zmq = require('zmq')
import Models = MapperProtos.mapper.models

// tslint:disable-next-line:no-any
TypeLogger.setLoggerOutput(console as any)
const log = TypeLogger.getLogger(__filename)

export class LocationServerStatusClient {
	private statusClient: Socket | null
	private onStatusUpdate: (status: boolean) => void
	private serverStatus: boolean | null // null == untested; true == available; false == unavailable
	private reqInFlight: boolean // semaphore for pingServer()
	private statusCheckInterval: number // configuration for pinging the server
	private locationServerStatusAddress: string

	constructor(onStatusUpdate: (status: boolean) => void) {
		this.serverStatus = null
		this.reqInFlight = false
		this.onStatusUpdate = onStatusUpdate
		this.statusCheckInterval = (config.get('location_server.status.health_check.interval.seconds') || 5) * 1000

		const locationServerStatusHost = config.get('location_server.status.host') || 'localhost'
		const locationServerStatusPort = config.get('location_server.status.port') || '26502'
		this.locationServerStatusAddress = "tcp://" + locationServerStatusHost + ':' + locationServerStatusPort
		this.statusClient = null
	}

	// Lazily create the statusClient and initiate server health checks.
	public connect(): Promise<void> {
		if (this.statusClient)
			return Promise.resolve()

		log.info('Connecting to location server status provider at', this.locationServerStatusAddress)
		var self = this
		// For anything but "connect", we aren't getting status from the
		// location server.
		this.statusClient = zmq.socket('req')
			.on("connect_delay", function() { self.handleMonitorEvent() })
			.on("connect_retry", function() { self.handleMonitorEvent() })
			.on("listen", function() { self.handleMonitorEvent() })
			.on("bind_error", function() { self.handleMonitorEvent() })
			.on("accept", function() { self.handleMonitorEvent() })
			.on("accept_error", function() { self.handleMonitorEvent() })
			.on("close", function() { self.handleMonitorEvent() })
			.on("close_error", function() { self.handleMonitorEvent() })
			.on("disconnect", function() { self.handleMonitorEvent() })
			.on("monitor_error", function() { self.handleMonitorEvent() })
			.monitor(this.statusCheckInterval, 0) // The second arg (zero) says to get all available events
			.on("message", function(reply: Buffer) {
				self.reqInFlight = false
				self.parseStatus(reply)
		}).connect(this.locationServerStatusAddress)

		const result = this.pingServer()
		this.periodicallyCheckServerStatus()
		return result
	}

	private handleMonitorEvent() : void {
		this.setServerStatus(false)
	}

	private parseStatus(message: Buffer): void {
		const status = Models.MasterControlResponseMessage.decode(message)
		if (!status) {
			log.error("Invalid location server response")
		} else {
			status.statusResponses!.responses!.forEach(
				response => {
					if (response.source
							=== Models.SystemModule.kSystemModuleMapCap) {
						this.setServerStatus(
							response.status === Models.StatusType.kStatusReady
						)
					}
				}
			)
		}
	}

	private periodicallyCheckServerStatus(): void {
		if (this.statusCheckInterval) {
			const self = this
			setInterval(
				(): Promise<void> => self.pingServer().then(),
				this.statusCheckInterval
			)
		}
	}

	// Ping checks and this.serverStatus maintain a local copy of server state, for diagnostics.
	private pingServer(): Promise<void> {
		if (!this.statusClient)
			return Promise.reject(Error('attempted to pingServer() before initializing client'))
		if (this.reqInFlight)
			return Promise.resolve()
		this.reqInFlight = true

		return new Promise((resolve: () => void): void => {
			var statusRequestPayload = { "target" : Models.SystemModule.kSystemModuleMapCap }
			var statusRequestsPayload = { "requests" : [statusRequestPayload] }
			var mcRequestsPayload = {
				"type" : Models.MasterControlMessageType.kMCMTStatus,
				"statusRequests" : statusRequestsPayload
			}
			var errMsg = Models.MasterControlRequestMessage.verify(mcRequestsPayload)
			if (errMsg) {
				log.error(errMsg)
				resolve()
			}
			var mcRequests = Models.MasterControlRequestMessage.create(mcRequestsPayload)
			var buffer = Models.MasterControlRequestMessage.encode(mcRequests).finish()

			this.statusClient!.send(buffer.toString())
		})
	}

	private setServerStatus(newStatus: boolean): void {
		if (this.serverStatus === null || this.serverStatus !== newStatus) {
			this.serverStatus = newStatus
			log.info("Location server is  " +
				(this.serverStatus ? "available" : "unavailable"))
			this.onStatusUpdate(newStatus)
		}
	}

}
