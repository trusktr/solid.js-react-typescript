/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import config from '@/config'
import * as zmq from 'zmq'
import {Socket} from 'zmq'
import * as MapperProtos from "@mapperai/mapper-models"
import Models = MapperProtos.mapper.models
import Logger from "@/util/log"

const log = Logger(__filename)

export enum LocationServerStatusLevel {
	INFO = 0,
	WARNING,
	ERROR
}

export class LocationServerStatusClient {
	private statusClient: Socket | null
	private onStatusUpdate: (level: LocationServerStatusLevel, status: string) => void
	private serverStatus: string | null // null == untested; string provides description otherwise
	private reqInFlight: boolean // semaphore for pingServer()
	private statusCheckInterval: number // configuration for pinging the server
	private locationServerStatusAddress: string
	private locationServerStatusTarget: Models.SystemModule

	constructor(onStatusUpdate: (level: LocationServerStatusLevel, status: string) => void) {
		this.serverStatus = null
		this.reqInFlight = false
		this.onStatusUpdate = onStatusUpdate
		this.statusCheckInterval = (config['location_server.status.health_check.interval.seconds'] || 5) * 1000

		const locationServerStatusHost = config['location_server.host'] || 'localhost'
		const locationServerStatusPort = config['location_server.status.port'] || '26600'
		this.locationServerStatusAddress = "tcp://" + locationServerStatusHost + ':' + locationServerStatusPort
		this.locationServerStatusTarget = Models.SystemModule.kSystemModuleMapCap
		this.statusClient = null
	}

	// Lazily create the statusClient and initiate server health checks.
	public connect(): void {
		if (this.statusClient)
			return

		console.log('Connecting to location server clients provider at', this.locationServerStatusAddress)
		log.info('Connecting to location server clients provider at', this.locationServerStatusAddress)
		const self = this
		// For anything but "connect", we aren't getting clients from the
		// location server.
		const sock = this.statusClient = zmq.socket('req')
		sock.on("connect_delay", () => {self.handleMonitorEvent()})
		sock.on("connect_retry", () => {self.handleMonitorEvent()})
		sock.on("listen", () => {self.handleMonitorEvent()})
		sock.on("bind_error", () => {self.handleMonitorEvent()})
		sock.on("accept", () => {self.handleMonitorEvent()})
		sock.on("accept_error", () => {self.handleMonitorEvent()})
		sock.on("close", () => {self.handleMonitorEvent()})
		sock.on("close_error", () => {self.handleMonitorEvent()})
		sock.on("disconnect", () => {self.handleMonitorEvent()})
		sock.on("monitor_error", () => {self.handleMonitorEvent()})
		// typedef for .monitor() is incorrect
		// tslint:disable-next-line:no-any
		{(sock as any).monitor(this.statusCheckInterval, 0)} // The second arg (zero) says to get all available events
		sock.on("message", (reply: Buffer) => {
			self.reqInFlight = false
			self.parseStatus(reply)
		})
		sock.connect(this.locationServerStatusAddress)

		this.pingServer()
		this.periodicallyCheckServerStatus()
	}

	private handleMonitorEvent(): void {
		this.setServerStatus(LocationServerStatusLevel.ERROR, "Unavailable")
	}

	private parseStatus(message: Buffer): void {
		const responseMessage = Models.StatusResponseMessage.decode(message)
		if (!responseMessage) {
			log.error("Invalid location server response")
			this.setServerStatus(LocationServerStatusLevel.ERROR, "Invalid response")
		} else {
			let level: LocationServerStatusLevel
			if (responseMessage.source !== this.locationServerStatusTarget) {
				level = LocationServerStatusLevel.ERROR
				log.error(
					"Status is from wrong source (" + responseMessage.source + "): " + responseMessage.statusString
				)
			} else {
				switch (responseMessage.status) {
					case Models.StatusType.kStatusInitializing:
						level = LocationServerStatusLevel.WARNING
						break
					case Models.StatusType.kStatusOffline:
						level = LocationServerStatusLevel.ERROR
						break
					case Models.StatusType.kStatusReady:
						level = LocationServerStatusLevel.INFO
						break
					case Models.StatusType.kStatusDataRecording:
						level = LocationServerStatusLevel.INFO
						break
					default:
						level = LocationServerStatusLevel.ERROR
				}

			}
			this.setServerStatus(level, responseMessage.statusString)
		}
	}

	private periodicallyCheckServerStatus(): void {
		if (this.statusCheckInterval) {
			const self = this
			setInterval(
				(): void => self.pingServer(),
				this.statusCheckInterval
			)
		}
	}

	// Ping checks and this.serverStatus maintain a local copy of server state, for diagnostics.
	private pingServer(): void {
		if (!this.statusClient) {
			log.error("Attempted to ping location server before initializing client")
			return
		}
		if (this.reqInFlight)
			return
		this.reqInFlight = true

		const statusRequestPayload = { "target" : this.locationServerStatusTarget }
		const errMsg = Models.StatusRequestMessage.verify(statusRequestPayload)
		if (errMsg) {
			log.error(errMsg)
			return
		}
		const request = Models.StatusRequestMessage.create(statusRequestPayload)
		const buffer = Models.StatusRequestMessage.encode(request).finish()

		// We will receive the error via the .on("message") callback
		this.statusClient.send(buffer.toString())
	}

	private setServerStatus(level: LocationServerStatusLevel, newStatus: string): void {
		if (this.serverStatus === null || this.serverStatus !== newStatus) {
			this.serverStatus = newStatus
			log.info("Location server is " + this.serverStatus)
			this.onStatusUpdate(level, newStatus)
		}
	}

}
