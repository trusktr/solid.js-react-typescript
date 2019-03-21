import {
  IAWSCredentials,
  makeDataCloudProviderFactory,
  DataProviderFactory,
  PusherConfig,
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
  useCache = true,
  organizationId: string = getOrganizationId()!,
): DataProviderFactory {
  /**
   * Provide credentials promise
   *
   * @returns {Promise<IAWSCredentials>}
   */
  const credentialProvider = (): IAWSCredentials | null => {
    const response = SaffronSDK.AWSManager.getAppAWSCredentials("Annotator")
    if(response == null) throw new Error("AWS Credentials are null")
    return response.credentials
  }

  // Use this if you want to dev/debug with local keys
  //
  // const credentialProvider = () => ({
  // 	accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
  // 	secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ''
  // })

  /**
   * Provide bucket information
   *
   * @returns {string}
   */
  const bucketProvider = (_: string): string => {
    const creds = SaffronSDK.AWSManager.getAppAWSCredentials("Annotator")
    if (!creds) throw new Error('no AWS credentials')
    return creds.sessionBucket
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
    false,
    useCache,
  )
}