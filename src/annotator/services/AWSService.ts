import {CloudService, HttpMethod, saffronClientName} from './CloudService'
import {AuthService, IAWSTemporaryCredentials, currentTimeInSeconds} from './AuthService'
import {defaultMakeAPIRequestParameters as defaults, MakeAPIRequestParameters} from './Models'
import {getLogger} from '../../util/Logger'

const log = getLogger(__filename)

const AWS_TOKEN_EXPIRATION_INTERVAL = 60 * 10

export interface IAppAWSCredentials {
  credentials: IAWSTemporaryCredentials
  sessionBucket: string
}

let instance: AWSService | null = null

// so far "annotator" is the only app with app credentials
type KnownApp = 'annotator'

export class AWSService {
  static singleton(auth: AuthService) {
    return new AWSService(auth)
  }

  private constructor(public auth: AuthService) {
    if (instance) return instance
    instance = this
  }

  // TODO store fetched app AWS credentials
  appCreds: Partial<Record<KnownApp, IAppAWSCredentials>> = {}

  /**
   * Periodically check if App AWS credentials are valid (this is different from a user's AWS credentials)
   */
  async checkAppAWSCredentials(): Promise<void> {
    const promises: Promise<any>[] = []
    const keysValues = Object.entries(this.appCreds) as [KnownApp, IAppAWSCredentials | undefined][]

    for (const [appEndpoint, creds] of keysValues) {
      promises.push(
        (async () => {
          const expiresAt = creds!.credentials.expiration / 1000 || 0
          const areCredentialsValid = expiresAt > currentTimeInSeconds() + AWS_TOKEN_EXPIRATION_INTERVAL * 1.5

          if (areCredentialsValid) return

          const newCredentials = await this.getAppCredentials(appEndpoint, true)

          if (!newCredentials) {
            log.error(`Unable to get AWS credentials for app endpoint "${appEndpoint}"`)
            return
          }

          this.appCreds[appEndpoint] = newCredentials
        })()
      )
    }

    await Promise.all(promises)
  }

  private fetchPromise: Promise<IAppAWSCredentials> | null = null

  // TODO, if creds are not expired, return them, instead of getting new ones each time, and rename to `getAppAWSCredentials`.
  async getAppCredentials(appEndpoint: KnownApp, skipCache = false): Promise<IAppAWSCredentials> {
    const creds = this.appCreds[appEndpoint]

    if (!skipCache && creds) return creds

    if (this.fetchPromise) return this.fetchPromise

    const cloudService = new CloudService(this.auth)
    const uri = `identity/1/credentials/${this.auth.orgId}/${appEndpoint}`

    this.fetchPromise = cloudService
      .makeAPIRequest({
        ...defaults(),
        method: HttpMethod.GET,
        uri: uri,
        clientName: saffronClientName,
      } as MakeAPIRequestParameters)
      .then(response => response.data as IAppAWSCredentials)

    return this.fetchPromise
  }
}
