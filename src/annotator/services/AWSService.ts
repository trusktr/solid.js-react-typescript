import {CloudService, HttpMethod, saffronClientName} from './CloudService'
import {AuthService, IAWSTemporaryCredentials, currentTimeInSeconds} from './AuthService'
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

/**
 * @class AWSService - This class is coupled with the `AuthService` class in an
 * important way: after the user has logged in, `AuthService` sets up a
 * `setInterval` that repeatedly calls `AWSService.checkAppAWSCredentials` in
 * order to ensure that the credentials are always refreshed before they
 * expire. If `AuthService` does not do this, then the
 * `AWSService.getAppCredentials` may not work as expected. This (current)
 * coupling prevents from having to hit the network many times each time
 * credentials are needed.
 */
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
   * Check if App AWS credentials are valid (this is different from a user's AWS credentials)
   *
   * This is called periodically by AuthService.setupAuthenticationChecks after
   * the user has logged in, to ensure that the creds are always fresh.
   *
   * TODO: we need to handle the case when the user's laptop was closed for a
   * longer period of time, which makes the creds seem to be instantaneously
   * expire from perspective of this code. The creds won't be refreshed until
   * the next time that this runs, so any network request between laptop open
   * and auth refresh will fail.
   */
  async checkAppAWSCredentials(): Promise<void> {
    if (!this.auth.account) {
      log.error('can not get AWS app credentials while user is not logged in.')
      return
    }

    const promises: Promise<any>[] = []
    const keysValues = Object.entries(this.appCreds) as [KnownApp, IAppAWSCredentials | undefined][]

    for (const [appEndpoint, creds] of keysValues) {
      promises.push(
        (async () => {
          const expiresAt = creds!.credentials.expiration / 1000 || 0
          const areCredentialsValid = expiresAt > currentTimeInSeconds() + AWS_TOKEN_EXPIRATION_INTERVAL * 1.5

          if (areCredentialsValid) return

          await this.getAppCredentials(appEndpoint, false)
        })()
      )
    }

    await Promise.all(promises)
  }

  /**
   * On initial login, this will be called once by checkAppAWSCredentials,
   * before the AuthService's initial UPDATED event is fired to let us know the
   * user is logged in. Once the UPDATED event is fired, then we can call this
   * method freely to get the cached credentials.
   */
  async getAppCredentials(appEndpoint: KnownApp, useCache = true): Promise<IAppAWSCredentials> {
    if (!this.auth.account) throw new Error('can not get AWS app credentials while user is not logged in.')

    const creds = this.appCreds[appEndpoint]

    if (useCache && creds) return creds

    log.debug(
      ' ----------------- fetch app credentials (this should only happen once on initial login, and once in a while on refresh of the credentials).'
    )

    const cloudService = new CloudService(this.auth)
    const uri = `identity/1/credentials/${this.auth.orgId}/${appEndpoint}`
    const response = await cloudService.makeAPIRequest({
      method: HttpMethod.GET,
      uri: uri,
      clientName: saffronClientName,
    })

    return (this.appCreds[appEndpoint] = response.data)
  }
}
