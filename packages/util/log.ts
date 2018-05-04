import * as TypeLogger from 'typelogger'

// tslint:disable-next-line:no-any
TypeLogger.setLoggerOutput(console as any)

export default
function Logger(path) {
	return TypeLogger.getLogger(__filename)
}
