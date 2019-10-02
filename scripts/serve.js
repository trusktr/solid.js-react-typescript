#!/usr/bin/env node
const http = require('http')
const path = require('path')
const {exec} = require('child_process')
const serveStatic = require('serve-handler')

let port = 23456

function createServer() {
  const server = http.createServer((request, response) => {
    // regarding serveStatic, see: https://github.com/zeit/serve-handler#options
    return serveStatic(request, response, {
      public: path.resolve(__dirname, '../dist/package'.replace('/', path.sep)),
      symlinks: true,
    })
  })

  listen(server)
}

function listen(server) {
  server.on('error', e => {
    // if the current port is taken, keep trying the next port until we get one that is free
    if (e.code && e.code === 'EADDRINUSE') {
      port++

      // this doesn't need the onListen arg, the first call already registered it.
      server.listen(port)

      return
    }

    throw e
  })

  server.listen(port, onListen)
}

function onListen(e) {
  if (e) throw e
  const URL = 'http://localhost:' + port
  console.log(' ---- UI server running on ' + URL + ' ----')
  exec('open ' + URL)
}

createServer()
