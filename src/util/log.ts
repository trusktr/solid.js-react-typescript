import * as TypeLogger from 'typelogger'
import {ILogger} from "typelogger"

// tslint:disable-next-line:no-any
TypeLogger.setLoggerOutput(console as any)

export default
function Logger(path: string): ILogger {
	return TypeLogger.getLogger(path)
}
