/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

// import {windowStateKeeperOptions} from '../../util/WindowStateKeeperOptions'
// import windowStateKeeper from 'electron-window-state'
// import config from 'annotator-config'

// // TODO devtools setting for Windowable
// this.settings = {
//   // openDevTools: !!config['startup.show_dev_tools'],
// }

// // TODO windowStateKeeper for Windowable
// const savedState = windowStateKeeper(await windowStateKeeperOptions(windowName))
// const options = `${objectToFeatureString(savedState)},_blank`
// const lightboxWindow = window.open(
//   'about:blank',
//   windowName
//   options // yeah, it's a string. Why would they make the API take a string of options???
// )!
// // A trick (hack?) for getting the BrowserWindow we just created with native
// // window.open. The new window is now the focused window.
// const win = Electron.remote.BrowserWindow.getFocusedWindow()
//
// this.window = win
//
// if ( savedState.isMaximized ) win.maximize()
// if ( savedState.isFullScreen ) win.setFullScreen(true)
//
// savedState.manage(win)

// regarding feature strings, see:
// https://developer.mozilla.org/en-US/docs/Web/API/Window/open#Window_features
function objectToFeatureString(obj: object): string {
  // never set this to show=no or new windows can never be opened. See:
  // https://github.com/electron/electron/issues/13156
  let result = 'show=yes'
  let val

  for (let key in obj) {
    if (!obj.hasOwnProperty(key)) continue

    val = obj[key]

    if (typeof val === 'function') continue

    if (key === 'x') key = 'left'
    if (key === 'y') key = 'top'

    val = typeof val === 'string' ? (val === 'yes' ? true : val === 'no' ? false : val) : val

    val = typeof val === 'boolean' ? +!!val : val

    result += `,${key}=${val}`
  }

  return result
}
