/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

// modified from https://github.com/trusktr/infamous/blob/master/src/core/Observable.js
export default class WindowCommunicator {
  private _eventMap: Map<string, Array<[Function, Object | undefined]>> | null
  private window: Window

  constructor(win?: Window) {
    this.window = win || window.opener

    addEventListener(
      'message',
      (event): void => {
        this.receive(event.data.channel, event.data.msg)
      }
    )
  }

  // eslint-disable-next-line typescript/no-explicit-any
  receive(channel: string, msg: any): void {
    // eslint-disable-line typescript/no-explicit-any
    if (!this._eventMap || !this._eventMap.has(channel)) return

    const callbacks = this._eventMap.get(channel)

    if (!callbacks) return

    let tuple
    let callback
    let context

    for (let i = 0, len = callbacks.length; i < len; i += 1) {
      tuple = callbacks[i]
      callback = tuple[0]
      context = tuple[1]
      callback.call(context, msg)
    }
  }

  // eslint-disable-next-line typescript/no-explicit-any
  send(channel: string, msg: any): void {
    // eslint-disable-line typescript/no-explicit-any
    this.window.postMessage({ channel, msg }, '*')
  }

  on(eventName: string, callback: Function, context?: Object): void {
    if (!this._eventMap) this._eventMap = new Map()

    let callbacks = this._eventMap.get(eventName)

    if (!callbacks) this._eventMap.set(eventName, (callbacks = []))

    if (typeof callback === 'function') {
      // save callback associated with context
      callbacks.push([callback, context])
    } else {
      throw new Error(
        'Expected a function in callback argument of MessageEmitter#on.'
      )
    }
  }

  off(eventName: string, callback: Function): void {
    if (!this._eventMap || !this._eventMap.has(eventName)) return

    const callbacks = this._eventMap.get(eventName)

    if (!callbacks) return

    const index = callbacks.findIndex((tuple): boolean => tuple[0] === callback)

    if (index === -1) return
    callbacks.splice(index, 1)
    if (callbacks.length === 0) this._eventMap.delete(eventName)
    if (this._eventMap.size === 0) this._eventMap = null
  }
}
