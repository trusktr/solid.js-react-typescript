/* eslint-disable typescript/no-explicit-any */
import {isString} from 'typeguard'
import * as TypeLogger from 'typelogger'
//import * as AWS from "aws-sdk"
// import IUser, {IAWSTemporaryCredentials, IOrganization} from "models/User"
// import {getAWSCredentials, SecurityEvent, SecurityEvents} from "util/SecurityHelper"
// import {getHot, setDataOnHotDispose} from "common/HotUtil"
//import AWSErrors from "util/AWSErrors"

TypeLogger.setLogThreshold(TypeLogger.LogLevel.INFO)

//const LogQueueMaxRecords = 1000

enum LogLevel {
  debug = 1,
  info,
  warn,
  error,
}

const LogLevelNames = Object.keys(LogLevel).filter(isString)

// const EnvLogThreshold = {
// 	'dev': LogLevel.info,
// 	'stage': LogLevel.info,
// 	'production': LogLevel.warn
// } as any

//console.log(`Configuring logger for: ${MAPPER_ENV}`)

//let Threshold = (EnvLogThreshold[MAPPER_ENV] || LogLevel.debug) as LogLevel
let Threshold = LogLevel.info

// interface LogRecord {
// 	level: LogLevel
// 	tag: string
// 	url: string
// 	isDebug?: boolean
// 	env: string
// 	userId: string
// 	userEmail: string
// 	organizationId: string
// 	organizationName: string
// 	event?: string
// 	timestamp: number
// 	message: string
// 	errorMessage: string
// 	errorStack: string
// }
//
// class LogFirehose {
//   private static firehose:AWS.Firehose = null
//   private static pendingRecords = Array<LogRecord>()
//   private static user:IUser = null
//   private static org:IOrganization = null
//   private static credSubscription = null
//   private static userSubscription = null
//   private static orgSubscription = null
//   private static flushing = false
//
//   /**
//    * Create the firehose client and return
//    *
//    * @param {IAWSTemporaryCredentials} credentials
//    * @param {boolean} flush
//    * @returns {Firehose}
//    */
//   private static getFirehose(credentials: IAWSTemporaryCredentials = getAWSCredentials(), flush:boolean = false):AWS.Firehose {
//     if (!credentials) return null
//
//     if (!this.firehose) {
//       this.firehose = new AWS.Firehose({
//         credentials: new AWS.Credentials(
//           credentials.accessKeyId,
//           credentials.secretAccessKey,
//           credentials.sessionToken
//         ),
//         region: 'us-east-1'
//       })
//     }
//
//     if (flush) {
//       this.flush()
//     }
//
//     return this.firehose
//   }
//
//   /**
//    * Setup/Configure credential subscription & firehose init
//    *
//    * @returns {boolean}
//    */
//   static setup():boolean {
//     if (this.credSubscription || !getStore) {
//       guard(() => !this.firehose && this.getFirehose())
//       return !!this.credSubscription
//     }
//
//     this.credSubscription = getHot(module,"credSubscription",() => getStore().observe(["AppState","awsCredentials"], (newCredentials:IAWSTemporaryCredentials) => {
//       if (!newCredentials) {
//         console.warn("Disabling firehose, no credentials")
//         this.firehose = null
//         return
//       }
//
//       this.getFirehose(newCredentials,true)
//     }))
//
//     this.orgSubscription = getHot(module,"orgSubscription",() => getStore().observe(["AppState","activeOrganization"], (org:IOrganization) => {
//       this.org = org
//     }))
//
//     this.userSubscription = getHot(module,"userSubscription",() => getStore().observe(["AppState","user"], (user:IUser) => {
//       this.user = user
//     }))
//
//     setDataOnHotDispose(module,() => ({
//       "credSubscription": this.credSubscription,
//       "orgSubscription": this.orgSubscription,
//       "userSubscription": this.userSubscription
//     }))
//
//     return true
//   }
//
//   /**
//    * Flush pending records
//    *
//    * @returns {Promise<void>}
//    */
//   private static async flush() {
//     if (!this.setup() || !this.firehose || this.flushing) {
//       // if (!this.flushing)
//       //   console.debug("Firehose is not ready")
//       return
//     }
//
//     try {
//       this.flushing = true
//       while (this.firehose && this.pendingRecords.length) {
//         const
//           chunkSize = Math.min(this.pendingRecords.length, 10),
//           records = this.pendingRecords.splice(0,chunkSize)
//
//         //console.info(`Pushing ${records.length} records to firehose`)
//
//
//         await this.firehose.putRecordBatch({
//           DeliveryStreamName: "mapper-meridian",
//           Records: records.map(record => ({Data: JSON.stringify(record)}))
//         }).promise()
//       }
//     } catch (err) {
//       console.error("Failed to push logs", err)
//       if (err.code === AWSErrors.ExpiredTokenException) {
//         this.firehose = null
//         SecurityEvents.emit(SecurityEvent.ExpiredToken)
//       }
//     } finally {
//       this.flushing = false
//     }
//   }
//
//   static log(level: LogLevel, tag: string, message: string, error: Error = null) {
//     const
//       pendingCount = this.pendingRecords.length + 1,
//       removeCount = LogQueueMaxRecords - pendingCount
//
//     if (removeCount < 0) {
//       this.pendingRecords.splice(0, Math.abs(removeCount))
//     }
//
//     this.pendingRecords.push({
//       timestamp: Date.now(),
//       level: LogLevel[level] as any,
//       tag,
//       env: process.env.MAPPER_ENV,
//       message,
//       url: window.location.href,
//       userId: getValue(() => this.user.id),
//       userEmail: getValue(() => this.user.email),
//       organizationId: getValue(() => this.org.id),
//       organizationName: getValue(() => this.org.name),
//       errorMessage: getValue(() => error && error.message),
//       errorStack: getValue(() => error && error.stack)
//     })
//
//     this.flush()
//   }
// }
//
// if (module.hot) {
//   guard(() => LogFirehose.setup())
// }

/**
 * Get a logger
 *
 */
/* eslint-disable typescript/no-explicit-any */
export function getLogger(name: string): any {
  name = name.split('/').pop() as string
  return LogLevelNames.reduce(
    (logger, level) => {
      logger[level as any] = (...args: any[]) => {
        /* eslint-disable typescript/no-explicit-any */
        const msgLevel = (LogLevel as any)[level as any] as LogLevel

        if (msgLevel < Threshold) return

        //if (isDefined(getStoreState) && [LogLevel.info,LogLevel.error,LogLevel.warn].includes(msgLevel)) {
        // const
        // 	error = args.filter((arg:any) => arg instanceof Error),
        // 	message = args.filter((arg:any) => !(arg instanceof Error)).join(" ")

        //LogFirehose.log(msgLevel,name,message,error.length ? error[0] : null)

        //}

        //baseLogger[level](name,...args)
        if (console[level as any]) console[level as any](name, ...args)
        else console.log(name, ...args)
      }

      return logger
    },
    /* eslint-disable typescript/no-explicit-any */
    {
      isDebugEnabled,
    } as any
  )
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
