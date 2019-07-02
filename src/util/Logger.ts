/* eslint-disable typescript/no-explicit-any */
import {log} from '../annotator/ipc'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

/* eslint-disable typescript/no-explicit-any */
export function getLogger(name: string): any {
  return {
    debug: (...args: any[]) => log(name, 'debug', ...args),
    info: (...args: any[]) => log(name, 'info', ...args),
    warn: (...args: any[]) => log(name, 'warn', ...args),
    error: (...args: any[]) => log(name, 'error', ...args),
  }
}

export default getLogger
