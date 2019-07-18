import Url = require('url')
import Path = require('path')
import * as React from 'react'
import {withStyles, createStyles, Theme, WithStyles} from '@material-ui/core'

function getFileUrl(pathRelativeToSrc): string {
  return Url.format({
    pathname: Path.resolve(__dirname, `src/${pathRelativeToSrc}`),
    protocol: 'file:',
    slashes: true,
  })
}

interface Props extends WithStyles<typeof styles> {}

/**
 * Annotator root component mounted in Saffron
 */
class AnnotatorSaffronEntry extends React.Component<Props> {
  webviewRef = React.createRef<Electron.WebviewTag>()

  onIpcMessage = async event => {
    const {args, channel} = event

    // const contents = this.webviewRef.current!.getWebContents()
    const contents = this.webviewRef.current!

    if (channel === 'begin') {
      contents.send('begin')
    } else if (channel === 'getAppAWSCredentials') {
      const result = SaffronSDK.AWSManager.getAppAWSCredentials('Annotator')
      contents.send('getAppAWSCredentials', result)
    } else if (channel === 'getAccount') {
      const result = SaffronSDK.getAccount()
      contents.send('getAccount', result)
    } else if (channel === 'getOrganizationId') {
      const result = SaffronSDK.getOrganizationId()
      contents.send('getOrganizationId', result)
    } else if (channel === 'getEnv') {
      const result = SaffronSDK.getEnv()
      contents.send('getEnv', result)
    } else if (channel === 'getPusherConnectionParams') {
      const result = SaffronSDK.getPusherConnectionParams()
      contents.send('getPusherConnectionParams', result)
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
      contents.send('getPusherAuthorization', result)
    } else if (channel === 'getPusherAuthEndpoint') {
      const {CloudService, CloudConstants} = SaffronSDK
      const {API} = CloudConstants
      const result = CloudService.makeAPIURL(API.Identity, 'identity/1/pusher/auth')
      contents.send('getPusherAuthEndpoint', result)
    } else if (channel === 'log') {
      const fileName = args.shift()
      const level = args.shift()
      const log = SaffronSDK.LogManager.log(fileName, 'annotator')
      log[level](...args)
      contents.send('log')
    }
  }

  componentDidMount() {
    const contents = this.webviewRef.current!
    contents.addEventListener('ipc-message' as any, this.onIpcMessage)
  }

  componentWillUnmount() {
    const contents = this.webviewRef.current!
    contents.removeEventListener('ipc-message' as any, this.onIpcMessage)
  }

  render() {
    const {classes: c} = this.props

    return React.createElement('webview', {
      ref: this.webviewRef,
      className: c.webview,
      src: getFileUrl('annotator/StandaloneEntry.html'),
      nodeintegration: 'true',
      nodeintegrationinsubframes: 'true',
      webpreferences: 'nodeIntegrationInWorker',
      disablewebsecurity: 'true', // does 'false' stille work?
      allowpopups: 'true',
    })
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
    webview: {
      width: '100%',
      height: '100%',
    },
  })
}
