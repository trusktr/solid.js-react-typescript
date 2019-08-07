import Url = require('url')
import Path = require('path')
import * as React from 'react'
import {withStyles, createStyles, Theme, WithStyles} from '@material-ui/core'

function getFileUrl(pathRelativeToSrc): string {
  return Url.format({
    pathname: Path.resolve(__dirname, `${pathRelativeToSrc}`),
    protocol: 'file:',
    slashes: true,
  })
}

interface Props extends WithStyles<typeof styles> {}

/**
 * Annotator root component mounted in Saffron
 */
class AnnotatorSaffronEntry extends React.Component<Props> {
  iframeRef = React.createRef<HTMLIFrameElement>()

  onMessage = async (event: MessageEvent) => {
    const channel = event.data.channel as string
    const args = event.data.args as any[]
    const iframe = this.iframeRef.current!
    const frameWindow = iframe.contentWindow

    // if the iframe's window isn't ready, return. The iframe's repeated "begin"
    // calls will continue triggering this message handler, and eventually the
    // window will be ready.
    if (!frameWindow) return

    if (channel === 'begin') {
      frameWindow.postMessage({channel: 'begin', args: []}, '*')
    } else if (channel === 'getAppAWSCredentials') {
      const result = SaffronSDK.AWSManager.getAppAWSCredentials('Annotator')
      frameWindow.postMessage({channel: 'getAppAWSCredentials', args: [result]}, '*')
    } else if (channel === 'getAccount') {
      const result = SaffronSDK.getAccount()
      frameWindow.postMessage({channel: 'getAccount', args: [result]}, '*')
    } else if (channel === 'getOrganizationId') {
      const result = SaffronSDK.getOrganizationId()
      frameWindow.postMessage({channel: 'getOrganizationId', args: [result]}, '*')
    } else if (channel === 'getEnv') {
      const result = SaffronSDK.getEnv()
      frameWindow.postMessage({channel: 'getEnv', args: [result]}, '*')
    } else if (channel === 'getPusherConnectionParams') {
      const result = SaffronSDK.getPusherConnectionParams()
      frameWindow.postMessage({channel: 'getPusherConnectionParams', args: [result]}, '*')
    } else if (channel === 'getPusherAuthorization') {
      const {CloudService, CloudConstants} = SaffronSDK
      const {API, HttpMethod} = CloudConstants
      const cloudService = new CloudService.CloudService()
      const result = (await cloudService.makeAPIRequest(
        API.Identity,
        HttpMethod.POST,
        'identity/1/pusher/auth',
        'annotator',
        {channelName: args[0], socketId: args[1]}
      )).data
      frameWindow.postMessage({channel: 'getPusherAuthorization', args: [result]}, '*')
    } else if (channel === 'getPusherAuthEndpoint') {
      const {CloudService, CloudConstants} = SaffronSDK
      const {API} = CloudConstants
      const result = CloudService.makeAPIURL(API.Identity, 'identity/1/pusher/auth')
      frameWindow.postMessage({channel: 'getPusherAuthEndpoint', args: [result]}, '*')
    } else if (channel === 'log') {
      const fileName = args.shift()
      const level = args.shift()
      const log = SaffronSDK.LogManager.log(fileName, 'annotator')
      log[level](...args)
      frameWindow.postMessage({channel: 'log', args: []}, '*')
    }
  }

  componentDidMount() {
    window.addEventListener('message', this.onMessage)
  }

  componentWillUnmount() {
    window.removeEventListener('message', this.onMessage)
  }

  render() {
    const {classes: c} = this.props

    return <iframe ref={this.iframeRef} className={c.iframe} src={getFileUrl('./StandaloneEntry.html')} />
  }
}

module.exports = {
  component: withStyles(styles)(AnnotatorSaffronEntry),
  start: async () => {},
  stop: async () => {},
  metadata: {
    awsCredentialsEndpoint: 'annotator',
  },
}

// eslint-disable-next-line typescript/explicit-function-return-type
function styles(_theme: Theme) {
  return createStyles({
    iframe: {
      width: '100%',
      height: '100%',
    },
  })
}
