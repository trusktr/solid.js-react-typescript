import {ipcRenderer} from 'electron'
type IAppAWSCredentials = import('@mapperai/mapper-saffron-sdk').AWSManager.IAppAWSCredentials
type IAccount = import('@mapperai/mapper-saffron-sdk/models/User').IAccount
type IPusherConnectionParams = import('@mapperai/mapper-saffron-sdk').IPusherConnectionParams
type LogLevel = import('../util/Logger').LogLevel

/* eslint-disable typescript/explicit-function-return-type */

const sleep = time => new Promise(resolve => setTimeout(resolve, time))

export async function goAhead() {
  let goAhead = false

  while (!goAhead) {
    // NOTE, repeated calls to `begin()` cause the IPC EventEmitter to log a
    // harmless warning to the console once the event listener count exceeds 10
    // eslint-disable-next-line promise/catch-or-return
    begin().then(() => (goAhead = true))
    await sleep(300)
  }
}

export function begin() {
  return rpc<void>('begin')
}

export function getAccount() {
  return rpc<IAccount>('getAccount')
}

export function getOrganizationId() {
  return rpc<string>('getOrganizationId')
}

export function getAppAWSCredentials() {
  return rpc<IAppAWSCredentials>('getAppAWSCredentials')
}

export function getEnv() {
  return rpc<string>('getEnv')
}

export function getPusherConnectionParams() {
  return rpc<IPusherConnectionParams>('getPusherConnectionParams')
}

export function getPusherAuthorization(channelName: string, socketId: string) {
  return rpc<IPusherConnectionParams>('getPusherAuthorization', channelName, socketId)
}

export function getPusherAuthEndpoint() {
  return rpc<string>('getPusherAuthEndpoint')
}

export function log(fileName: string, level: LogLevel, ...args: any[]) {
  return rpc<void>('log', fileName, level, ...args)
}

// TODO add timeout to cancel promises that don't receive a response in time.
function rpc<T>(channel: string, ...args: any[]) {
  ipcRenderer.sendToHost(channel, ...args)
  return new Promise<T>(resolve => ipcRenderer.once(channel, (_sender, result) => resolve(result)))
}

/* eslint-enable typescript/explicit-function-return-type */
