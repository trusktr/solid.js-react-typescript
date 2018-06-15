
export default class StatusWindowState {

	constructor(o:any = {}) {
		Object.assign(this, o)
	}

	enabled:boolean
	messages: Map<string, string>

}
