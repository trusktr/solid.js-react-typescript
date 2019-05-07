/* eslint-disable typescript/no-explicit-any */
import * as TypeLogger from 'typelogger'

TypeLogger.setLogThreshold(TypeLogger.LogLevel.INFO)

enum LogLevel {
  debug = 1,
  info,
  warn,
  error,
}

let Threshold = LogLevel.info

/* eslint-disable typescript/no-explicit-any */
export function getLogger(name: string): any {
  return SaffronSDK.LogManager.log(name, 'annotator')
}

export function setThreshold(threshold: LogLevel): void {
  Threshold = threshold
}

export function enableDebug(): void {
  setThreshold(LogLevel.debug)
}

export function isDebugEnabled(): boolean {
  return LogLevel.debug >= Threshold
}

export default getLogger
