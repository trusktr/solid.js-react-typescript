import {getS3Client} from '@mapperai/mapper-annotated-scene'
import getLogger from '../util/Logger'
import {AuthService} from './services/AuthService'
import {AWSService} from './services/AWSService'

const log = getLogger(__filename)

export class ActivityTracker<T extends Object> {
  private userHasInteracted = false
  private activityInterval?: number

  constructor(private sessionId: string, private onActivityTrack: () => T | false) {}

  start() {
    this.activityInterval = window.setInterval(this.checkActivity, 30000)
    document.addEventListener('keydown', this.onInteracted)
    document.addEventListener('click', this.onInteracted)
    document.addEventListener('mousemove', this.onInteracted)
    document.addEventListener('pointermove', this.onInteracted)
  }

  stop() {
    window.clearInterval(this.activityInterval)
    document.removeEventListener('keydown', this.onInteracted)
    document.removeEventListener('click', this.onInteracted)
    document.removeEventListener('mousemove', this.onInteracted)
    document.removeEventListener('pointermove', this.onInteracted)
  }

  private onInteracted = () => {
    this.userHasInteracted = true
  }

  private checkActivity = async () => {
    if (!this.userHasInteracted) {
      log.debug('no user interaction in the last interval, not logging activity')
      return
    }

    this.userHasInteracted = false

    const auth = AuthService.singleton()
    const credentials = await AWSService.singleton(auth).getAppCredentials('annotator')

    if (!credentials) throw new Error('Unable to get AWS credentials')

    const Bucket = credentials.sessionBucket
    const s3 = getS3Client(credentials.credentials)
    // TODO get orgId from the AuthService. Listen to AuthEvents.UPDATED
    const organizationId = auth.orgId
    const account = auth.account
    const sessionId = this.sessionId

    if (!(account && (account.user as any).user_id)) {
      log.warn('No authenticated user, not logging activity.', account)
      return
    }

    if (!organizationId) {
      log.warn('No organization ID for user, not logging activity.')
      return
    }

    const userId: string = (account.user as any).user_id
    const timestamp = Date.now()
    const Key = `${organizationId}/stats/${sessionId}/${userId}--${timestamp}.json`
    const metaData = this.onActivityTrack()

    if (!metaData) {
      log.debug('annotated-scene not ready, skipping logging of user activity')
      return
    }

    await s3
      .putObject({
        Body: JSON.stringify({
          userId,
          timestamp,
          intervalSeconds: 30,
          meta: metaData,
        }),
        Bucket,
        Key,
      })
      .promise()
  }
}
