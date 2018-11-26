import {
  IAWSCredentials,
  makeDataCloudProviderFactory,
  DataProviderFactory,
  PusherConfig
} from '@mapperai/mapper-annotated-scene'
import SaffronSDK, {
  getPusherConnectionParams,
  getOrganizationId
} from '@mapperai/mapper-saffron-sdk'
import getLogger from 'util/Logger'

const log = getLogger(__filename)

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
      )
        return credentials
    }

    credentialPromise = (async () => {
      try {
        const response = (await new SaffronSDK.CloudService.CloudService().makeAPIRequest(
          SaffronSDK.CloudConstants.API.Identity,
          SaffronSDK.CloudConstants.HttpMethod.GET,
          `identity/1/credentials/${organizationId}/annotator`,
          'annotator'
        )).data

        // SET THE BUCKET
        sessionBucket = response.sessionBucket

        // ENSURE EXPIRATION
        const credentials = { ...response.credentials }

        credentials.expiration = Date.now() + 1000 * 60 * 50 // 50mins

        return credentials as IAWSCredentials
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
    false
  )
}
