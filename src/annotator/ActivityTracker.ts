import {getValue} from 'typeguard'
import {getS3Client} from '@mapperai/mapper-annotated-scene'
import SaffronSDK, {getAccount, getOrganizationId} from '@mapperai/mapper-saffron-sdk'
import getLogger from 'util/Logger'

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
      log.info('no user interaction in the last interval, not logging activity')
      return
    }

    this.userHasInteracted = false

    const credentials = SaffronSDK.AWSManager.getAppAWSCredentials('Annotator')

    if (!credentials) throw new Error('Unable to get AWS credentials')

    const Bucket = credentials.sessionBucket
    const s3 = getS3Client(credentials.credentials)
    const organizationId = getOrganizationId()
    const account = getAccount()
    const sessionId = this.sessionId

    if (!(account && getValue(() => account.user.id) && organizationId)) {
      log.warn('user not authenticated, not logging activity yet')
      return
    }

    const userId = account.user.id
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
