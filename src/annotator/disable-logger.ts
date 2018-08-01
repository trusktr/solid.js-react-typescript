// import {getLogger} from 'typelogger'

const disableLogger = false

if (disableLogger) {
	const typelogger = require('typelogger') as any

	typelogger.getLogger = function() {
		return {
			debug() {},
			info() {},
			warn() {},
			error() {},
		}
	}
}
