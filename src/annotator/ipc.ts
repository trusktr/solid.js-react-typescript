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

export async function begin() {
  return rpc<void>('begin')
}

export async function getAccount() {
  return rpc<IAccount>('getAccount')
}

export async function getOrganizationId() {
  return rpc<string>('getOrganizationId')
}

export async function getAppAWSCredentials() {
  return rpc<IAppAWSCredentials>('getAppAWSCredentials')
}

export async function getEnv() {
  return rpc<string>('getEnv')
}

export async function getPusherConnectionParams() {
  return rpc<IPusherConnectionParams>('getPusherConnectionParams')
}

export async function getPusherAuthorization(channelName: string, socketId: string) {
  return rpc<IPusherConnectionParams>('getPusherAuthorization', channelName, socketId)
}

export async function getPusherAuthEndpoint() {
  return rpc<string>('getPusherAuthEndpoint')
}

export async function log(fileName: string, level: LogLevel, ...args: any[]) {
  return rpc<void>('log', fileName, level, ...args)
}

// TODO add timeout to cancel promises that don't receive a response in time.
function rpc<T>(channel: string, ...args: any[]): Promise<T> {
  // get the parent (if this context is loaded as an iframe) or the opener (if
  // this context is loaded as a new OS window)
  try {
    ;(window.parent || window.opener).postMessage(
      {
        channel,
        args,
      },
      '*'
    )
  } catch (err) {
    console.error(`window.postMessage failed on args: ${args}`)
    throw err
  }

  return new Promise<T>(resolve =>
    window.addEventListener('message', function messageHandler(event) {
      // skip other channel's messages
      if (event.data.channel !== channel) return

      const result = event.data.args[0]
      resolve(result)
      window.removeEventListener('message', messageHandler)
    })
  )
}

/* eslint-enable typescript/explicit-function-return-type */
