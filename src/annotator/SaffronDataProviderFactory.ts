import {
  IAWSCredentials,
  makeDataCloudProviderFactory,
  DataProviderFactory,
  PusherConfig,
  Deferred
} from '@mapperai/mapper-annotated-scene'
import SaffronSDK, {
  getPusherConnectionParams,
  getOrganizationId
} from '@mapperai/mapper-saffron-sdk'
import getLogger from 'util/Logger'

const log = getLogger(__filename)

const {
  promise: awsCredentials,
  resolve: resolveCredentials,
  reject: rejectCredentials,
} = new Deferred<IAWSCredentials>()

export { awsCredentials }

const {
  promise: s3Bucket,
  resolve: resolveBucket,
} = new Deferred<string>()

export { s3Bucket }

/**
 * Tile service client factory for meridian
 */
export function makeSaffronDataProviderFactory(
  sessionId: string | null,
  organizationId: string = getOrganizationId()!
): DataProviderFactory {
  /**
   * Holds the credentials that will be used
   * to get tokens from S3
   */
  let credentialPromise: Promise<IAWSCredentials | null> | null = null
  /**
   * Session bucket name
   */
  let sessionBucket: string

  /**
   * Provide credentials promise
   *
   * @returns {Promise<IAWSCredentials>}
   */
  const credentialProvider = async (): Promise<IAWSCredentials | null> => {
    if (credentialPromise) {
      const credentials = await credentialPromise

      if (
        credentials != null &&
        sessionBucket &&
        credentials.expiration! > Date.now()
      ) {
        resolveCredentials(credentials)
        return credentials
      } else {
        rejectCredentials(new Error('invalid credentials'))
      }
    }

    credentialPromise = (async () => {
      try {
        const response = SaffronSDK.AWSManager.getAppAWSCredentials("Annotator")
        log.info("Got aws credentials from saffron", response)
        if(response == null) {
          throw new Error("AWS Credentials are null")
        }
        
        // SET THE BUCKET
        sessionBucket = response.sessionBucket
        resolveBucket(sessionBucket)
        
        return response.credentials as IAWSCredentials
      } catch (err) {
        log.error('Unable to get credentials', err)
        credentialPromise = null
        return null
      }
    })()

    return credentialPromise == null ? null : await credentialPromise
  }

  /**
   * Provide bucket information
   *
   * @returns {string}
   */
  const bucketProvider = (_: string): string => {
    return sessionBucket
  }

  const pusherParams = getPusherConnectionParams(),
    { CloudService, CloudConstants } = SaffronSDK,
    { API, HttpMethod } = CloudConstants,
    cloudService = new CloudService.CloudService()

  return makeDataCloudProviderFactory(
    credentialProvider,
    bucketProvider,
    organizationId,
    sessionId,
    true,
    {
      key: pusherParams.key,
      cluster: pusherParams.cluster,
      authEndpoint: CloudService.makeAPIURL(
        API.Identity,
        'identity/1/pusher/auth'
      ),
      authorizer: async (
        channelName: string,
        socketId: string,
        _options: any
      ): Promise<any> => {
        try {
          return (await cloudService.makeAPIRequest(
            API.Identity,
            HttpMethod.POST,
            'identity/1/pusher/auth',
            'annotator',
            { channelName, socketId }
          )).data
        } catch (err) {
          log.error('Unable to authenticate for pusher', err)
          throw err
        }
      }
    } as PusherConfig,
    null,
    false
  )
}
