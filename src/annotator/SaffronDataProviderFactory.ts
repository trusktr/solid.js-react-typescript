import {
  IAWSCredentials,
  makeDataCloudProviderFactory,
  DataProviderFactory,
  PusherConfig,
} from '@mapperai/mapper-annotated-scene'
import getLogger from '../util/Logger'
import {
  getAppAWSCredentials,
  getPusherConnectionParams,
  getPusherAuthorization,
  getPusherAuthEndpoint,
  getOrganizationId,
  goAhead,
} from './ipc'

const log = getLogger(__filename)

let defaultOrgId: string

~(async () => {
  await goAhead()
  defaultOrgId = await getOrganizationId()
})()

/**
 * Tile service client factory for meridian
 */
export async function makeSaffronDataProviderFactory(
  sessionId: string | null,
  useCache = true,
  organizationId: string = defaultOrgId
): Promise<DataProviderFactory> {
  const credentialProvider = async (): Promise<IAWSCredentials> => {
    // TODO, Saffron knows which app is running and can determine the app
    // behind the scenes without us needing to specify it here.
    const response = await getAppAWSCredentials()
    if (response == null) throw new Error('AWS Credentials are null')
    return response.credentials
  }

  // Use this if you want to dev/debug with local keys
  //
  // const credentialProvider = () => ({
  // 	accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
  // 	secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ''
  // })

  const bucketProvider = async (_: string): Promise<string> => {
    // TODO, Saffron knows which app is running and can determine the app
    // behind the scenes without us needing to specify it here.
    const creds = await getAppAWSCredentials()
    if (!creds) throw new Error('no AWS credentials')
    return creds.sessionBucket
  }

  const pusherParams = await getPusherConnectionParams()

  return makeDataCloudProviderFactory(
    credentialProvider,
    bucketProvider,
    organizationId,
    sessionId,
    true,
    {
      key: pusherParams.key,
      cluster: pusherParams.cluster,
      authEndpoint: await getPusherAuthEndpoint(),
      authorizer: async (channelName: string, socketId: string, _options: any): Promise<any> => {
        try {
          return await getPusherAuthorization(channelName, socketId)
        } catch (err) {
          log.error('Unable to authenticate for pusher', err)
          throw err
        }
      },
    } as PusherConfig,
    null,
    false,
    useCache
  )
}
