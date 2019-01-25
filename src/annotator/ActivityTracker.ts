import { S3 } from 'aws-sdk'
import { getS3Client, getLogger, } from '@mapperai/mapper-annotated-scene'
import { getAccount, getOrganizationId } from '@mapperai/mapper-saffron-sdk'
import { awsCredentials, s3Bucket } from './SaffronDataProviderFactory'

const log = getLogger(__filename)

export class ActivityTracker<T extends Object | null> {
  private userHasInteracted = false
  private activityInterval?: number
  private bucket?: string
  private s3?: S3

  constructor(
    private sessionId: string,
    private onActivityTrack?: () => T
  ) {}

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

    const organizationId = getOrganizationId()
    const account = getAccount()
    const sessionId = this.sessionId

    if (!(account && organizationId)) {
      log.warn('user not authenticated, not logging activity yet')
      return
    }

    if (!this.s3) {
      const [ creds, bucket ] = await Promise.all([
        awsCredentials,
        s3Bucket,
      ])

      this.bucket = bucket
      this.s3 = await getS3Client(creds)
    }

    const userId = account.user.id
    const timestamp = Date.now()
    const Key = `${organizationId}/stats/${sessionId}/${userId}--${timestamp}.json`

    const metaData = (this.onActivityTrack && this.onActivityTrack()) || {}

    await this.s3!
      .putObject({
        Body: JSON.stringify({
          userId,
          timestamp,
          intervalSeconds: 30,
          meta: metaData,
        }),
        Bucket: this.bucket!,
        Key
      })
      .promise()
  }
}