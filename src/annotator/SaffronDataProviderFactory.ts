import {IAWSCredentials} from '@mapperai/mapper-annotated-scene'
import {DataProviderFactory} from '@mapperai/mapper-annotated-scene/dist/modules/tiles/DataProvider'
import {makeDataCloudProviderFactory} from '@mapperai/mapper-annotated-scene/dist/modules/tiles/DataCloudProvider'
import {PusherConfig} from '@mapperai/mapper-annotated-scene/dist/modules/tiles/DataCloudProviderPusherClient'
import getLogger from '../util/Logger'
import {AuthService} from './services/AuthService'
import {AWSService} from './services/AWSService'
import {CloudService, HttpMethod} from './services/CloudService'

const log = getLogger(__filename)

export async function makeSaffronDataProviderFactory(
  sessionId: string | null,
  useCache = true,
  organizationId: string
): Promise<DataProviderFactory> {
  const credentialProvider = async (): Promise<IAWSCredentials> => {
    // TODO, Saffron knows which app is running and can determine the app
    // behind the scenes without us needing to specify it here.
    const auth = AuthService.singleton()
    const aws = AWSService.singleton(auth)
    const response = await aws.getAppCredentials('annotator')
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
    const auth = AuthService.singleton()
    const aws = AWSService.singleton(auth)
    const creds = await aws.getAppCredentials('annotator')
    if (!creds) throw new Error('no AWS credentials')
    return creds.sessionBucket
  }

  const pusherInfo = {
    key: process.env.PUSHER_KEY!,
    cluster: process.env.PUSHER_CLUSTER!,
  }

  return makeDataCloudProviderFactory(
    credentialProvider,
    bucketProvider,
    organizationId,
    sessionId,
    true,
    {
      key: pusherInfo.key,
      cluster: pusherInfo.cluster,
      authEndpoint: CloudService.makeAPIURL('identity/1/pusher/auth'),
      authorizer: async (channelName: string, socketId: string, _options: any): Promise<any> => {
        try {
          const cloudService = new CloudService(AuthService.singleton())
          return (await cloudService.makeAPIRequest({
            method: HttpMethod.POST,
            uri: 'identity/1/pusher/auth',
            clientName: 'annotator',
            body: {
              channelName,
              socketId,
            },
          })).data
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
