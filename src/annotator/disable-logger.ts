// import {getLogger} from 'typelogger'

const disableLogger = true

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
