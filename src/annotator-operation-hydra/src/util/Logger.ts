import {isString} from "typeguard"

enum LogLevel {
  debug = 1,
  info,
  warn,
  error
}

const LogLevelNames = Object.keys(LogLevel).filter(isString)

const Threshold = LogLevel.debug

/**
 * Get a logger
 *
 * @param name
 * @returns {string}
 */
export default function getLogger(name:string) {
  name = name.split('/').pop()
  return LogLevelNames.reduce((logger,level) => {
    logger[level] = (...args:any[]) => {
      if ((LogLevel as any)[level] < Threshold)
        return

      console.log(name,...args)
    }
    return logger
  },{} as any)
}