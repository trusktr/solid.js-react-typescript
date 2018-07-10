// import {getLogger} from 'typelogger'

const typelogger = require('typelogger') as any

typelogger.getLogger = function() {
	return {
		debug() {},
		info() {},
		warn() {},
		error() {},
	}
}
