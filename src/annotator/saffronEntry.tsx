import path = require('path')
import * as React from 'react'
import * as http from 'http'
import serveStatic = require('serve-handler')
import {withStyles, createStyles, Theme, WithStyles} from '@material-ui/core'

interface Props extends WithStyles<typeof styles> {}

interface State {
  serverStarted: boolean
}

/**
 * Annotator root component mounted in Saffron
 */
class AnnotatorSaffronEntry extends React.Component<Props, State> {
  iframeRef = React.createRef<HTMLIFrameElement>()
  port = 23456

  state = {
    serverStarted: false,
  }

  componentDidMount() {
    this.createServer()
  }

  createServer() {
    const server = http.createServer((request, response) => {
      // regarding serveStatic, see: https://github.com/zeit/serve-handler#options
      return serveStatic(request, response, {
        public: path.resolve(__dirname),
        symlinks: true,
      })
    })

    this.listen(server)
  }

  onListen = (e: NodeJS.ErrnoException | undefined) => {
    if (e) throw e
    console.log(' ---- UI server running on http://localhost:' + this.port + ' ----')
    this.setState({serverStarted: true})
  }

  listen(server: http.Server) {
    server.on('error', (e: NodeJS.ErrnoException) => {
      // if the current port is taken, keep trying the next port until we get one that is free
      if (e.code && e.code === 'EADDRINUSE') {
        this.port++

        // this doesn't need the onListen arg, the first call already registered it.
        server.listen(this.port)

        return
      }

      throw e
    })

    server.listen(this.port, this.onListen)
  }

  render() {
    const {classes: c} = this.props

    return this.state.serverStarted ? (
      <iframe ref={this.iframeRef} className={c.iframe} src={'http://localhost:' + this.port} />
    ) : (
      <div>Loading...</div>
    )
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
      display: 'block',
      width: '100%',
      height: '100%',
      border: 'none',
    },
  })
}
