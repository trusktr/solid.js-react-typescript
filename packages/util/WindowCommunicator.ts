
// modified from https://github.com/trusktr/infamous/blob/master/src/core/Observable.js
export default
class WindowCommunicator {

    private _eventMap: Map<string, Array<[Function, any]>> | null
    private window: Window

	constructor( win?: Window ) {
		this.window = win || window.opener

		addEventListener('message', event => {
			this.receive( event.data.channel, event.data.msg )
		})
	}

    receive(channel, msg) {
        if (!this._eventMap || !this._eventMap.has(channel)) return

        const callbacks = this._eventMap.get(channel)

        if (!callbacks) return

        let tuple
        let callback
        let context

        for (let i=0, len=callbacks.length; i<len; i+=1) {
            tuple = callbacks[i]
            callback = tuple[0]
            context = tuple[1]
            callback.call(context, msg)
        }
    }

	send( channel: string, msg: any ) {
		this.window.postMessage({ channel, msg }, '*')
	}

    on(eventName, callback, context?) {
        if (!this._eventMap)
            this._eventMap = new Map

        let callbacks = this._eventMap.get(eventName)

        if (!callbacks)
            this._eventMap.set(eventName, callbacks = [])

        if (typeof callback == 'function')
            callbacks.push([callback, context]) // save callback associated with context
        else
            throw new Error('Expected a function in callback argument of MessageEmitter#on.')
    }

    off(eventName, callback) {
        if (!this._eventMap || !this._eventMap.has(eventName)) return

        const callbacks = this._eventMap.get(eventName)

        if (!callbacks) return

        const index = callbacks.findIndex(tuple => tuple[0] === callback)

        if (index == -1) return

        callbacks.splice(index, 1)

        if (callbacks.length === 0) this._eventMap.delete(eventName)

        if (this._eventMap.size === 0) this._eventMap = null
    }
}
