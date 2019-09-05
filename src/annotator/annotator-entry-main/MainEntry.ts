/**
 *  Copyright 2018 Mapper Inc. Part of the mapper-annotator project.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as Electron from 'electron'
import * as http from 'http'
import * as path from 'path'
import serveStatic = require('serve-handler')
import restoreWindowState from './restoreWindowState'

let port = 23456

const app = Electron.app

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let win: Electron.BrowserWindow | null

const isFirstInstance = app.requestSingleInstanceLock()

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})

if (!isFirstInstance) app.quit()

function createWindow(): void {
  const windowName = 'Annotator'

  win = new Electron.BrowserWindow({
    show: false,
    webPreferences: {
      // allow code inside this window to use use native window.open()
      nativeWindowOpen: true,
      nodeIntegrationInWorker: true,
    },
  })

  restoreWindowState(win, windowName)

  win.webContents.once('did-finish-load', () => {
    win!.show()
  })

  // and load the index.html of the app.
  win.loadURL('http://localhost:' + port)

  // Emitted when the window is closed.
  win.on('closed', () => {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    win = null
  })
}

function createServer() {
  const server = http.createServer((request, response) => {
    // regarding serveStatic, see: https://github.com/zeit/serve-handler#options
    return serveStatic(request, response, {
      public: path.resolve(__dirname, '../../../dist/package'.replace('/', path.sep)),
      symlinks: true,
    })
  })

  listen(server)
}

function listen(server: http.Server) {
  server.on('error', (e: NodeJS.ErrnoException) => {
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

function onListen(e: NodeJS.ErrnoException | undefined) {
  if (e) throw e
  console.log(' ---- UI server running on http://localhost:' + port + ' ----')
  createWindow()
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createServer)

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  app.quit()
})

app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (win === null) createWindow()
})
