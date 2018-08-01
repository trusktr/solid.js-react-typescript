/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as TypeLogger from 'typelogger'

// tslint:disable-next-line:no-any
TypeLogger.setLoggerOutput(console as any)

export default
function Logger(path: string): TypeLogger.ILogger {
	return TypeLogger.getLogger(path)
}
