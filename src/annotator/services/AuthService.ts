import Auth0Lock from 'auth0-lock'
import * as jwt_decode from 'jwt-decode'
import {makeEventEmitterClass} from 'events-typed'
import {CloudService} from './CloudService'
import {AWSService} from './AWSService'
import {getLogger} from '../../util/Logger'

const log = getLogger(__filename)

// TODO store creds in a local storage mechanism so that we don't have to log in
// every time we restart the app.

class AuthServiceEvents {
  constructor(
    /**
     * @event UPDATED - Called anytime auth status changes. Initially,
     * `authService.account` is `null`. UPDATED is triggered once the user has
     * logged in and `account` will be an `IAccount` object. UPDATED is also
     * triggered every time the auth or aws credentials are refreshedk, in
     * which case `account` is an updated `IAccount` object. If UPDATED is
     * called and `account` is null, then the user is logged out.
     */
    public UPDATED: IAccount | null
  ) {}
}

export const AuthEvents = makeEnumFromClass(AuthServiceEvents)

// create an Node.js EventEmitter class containing the AuthService event types.
// This gives us strongly-typed event handlers.
class AuthServiceEmitter extends makeEventEmitterClass<AuthServiceEvents>() {}

let instance: AuthService | null = null

/**
 * @class - This is a singleton. Get the instance with `AuthService.singleton()`
 */
export class AuthService extends AuthServiceEmitter {
  /**
   * @property account - If the user is logged in, this is an IAccount object.
   * If the user isn't logged in, this is null.
   */
  account: IAccount | null = null

  static singleton() {
    if (instance) return instance
    return new AuthService()
  }

  /**
   * @constructor - This class is a singleton, call `AuthService.singleton()` to
   * get the singleton instance.
   */
  private constructor() {
    super() // wasteful super() call, because TypeScript doesn't completely follow ES spec: https://github.com/Microsoft/TypeScript/issues/8277
    if (instance) return instance
    instance = this

    this.init()
  }

  destroy() {
    window.clearInterval(this.tokenCheckerTimer)
    window.clearInterval(this.awsCredentialsTimer)
    window.clearInterval(this.appAWSCredentialsTimer)
  }

  get awsCreds(): IAWSTemporaryCredentials | null {
    return (this.account && this.account.awsCredentials) || null
  }

  get authToken(): string | null {
    return (this.account && this.account.authCredentials.idToken) || null
  }

  get orgId(): string | null {
    return (this.account && this.account.organizationUser.organization.id) || null
  }

  get isAuthenticated(): boolean {
    return !!(this.account && this.authToken && this.orgId && this.isAuthTokenValid())
  }

  async logout() {
    // appActions.setAccount(account)
    this.account = null
    this.emit(AuthEvents.UPDATED, this.account)
  }

  /**
   * Start the login process
   */
  showLogin(): void {
    this.lock.show()
  }

  /**
   * Hide the login window
   */
  hideLogin(): void {
    this.lock.hide()
  }

  /**
   * Setup listeners and periodic checks pertaining to authentication and app manifest syncs
   */
  async setupAuthenticationCheck() {
    try {
      // Check every 30 minutes that the user's auth token has not expired
      this.tokenCheckerTimer = window.setInterval(
        () => this.checkAuth0TokenExpiration(),
        this.AUTH0_TOKEN_EXPIRATION_INTERVAL * 1000
      )

      await this.checkAuth0TokenExpiration()

      // Check every 10 minutes that the user's aws credentials have not expired
      this.awsCredentialsTimer = window.setInterval(
        () => this.checkUserAWSTokenExpiration(),
        this.AWS_TOKEN_EXPIRATION_INTERVAL * 1000
      )

      await this.checkUserAWSTokenExpiration()

      // Check every 10 minutes that APP aws credentials have not expired
      this.appAWSCredentialsTimer = window.setInterval(
        () => AWSService.singleton(this).checkAppAWSCredentials(),
        this.AWS_TOKEN_EXPIRATION_INTERVAL * 1000
      )

      await AWSService.singleton(this).checkAppAWSCredentials()
    } catch (err) {
      log.error('Error setting up authentication checks', err)
      await this.logout()
    }
  }

  removeAllListeners(_name?: string): this {
    throw new Error("Don't do that. Each listener site should handle its own cleanup.")
  }

  protected authClientId = 'r2L3AkvLNfWN6e357HYQoKpSKVAFbPXi'
  protected authDomain = 'mapperai.auth0.com'
  protected AWS_TOKEN_EXPIRATION_INTERVAL = 60 * 10 // 10 minutes
  protected AUTH0_TOKEN_EXPIRATION_INTERVAL = 60 * 30 // 30 minutes
  protected MANIFEST_CHECK_INTERVAL = 60 * 15 // 15 minutes

  protected init() {
    // Hash change event handler
    window.addEventListener('hashchange', this.onHashChange)

    /**
     * Authenticated event
     */
    this.lock.on('authenticated', async authResult => {
      log.info('auth result', authResult)

      authResult['expiresAt'] = decodeJWTToken(authResult['idToken'], 'exp')
      await this.setUserProfile((authResult as unknown) as Auth0Credentials) // TODO fix type
    })
  }

  protected onHashChange = (event: any): any => {
    if (this.isAuthenticated) return

    const params = getHashParams(event.newURL),
      idToken = params['id_token'] || params['/id_token'],
      accessToken = params['access_token'] || params['/access_token'],
      scope = params['scope'] || params['/scope']

    const expiresAt = decodeJWTToken(idToken, 'exp')
    const auth0Credentials = {
      accessToken,
      expiresAt,
      idToken,
      scope,
    } as Auth0Credentials

    if (idToken) {
      log.info(`ID token found. Starts with: ${idToken.substring(0, 15)}...`)
      event.preventDefault()
      event.stopImmediatePropagation()
      this.setUserProfile(auth0Credentials).catch(err => log.error('Unable to set user profile', err))
    }
  }

  protected async setUserProfile(credentials: Auth0Credentials) {
    let idToken = credentials.idToken

    if (!idToken) {
      log.warn('Id token not set, unable to fetch aws credentials', idToken)
      return
    }

    try {
      const cloudService = new CloudService(this),
        {orgUserInfo, awsCredentials} = await cloudService.getUserProfile(idToken)

      this.account = {
        authCredentials: credentials as Auth0Credentials,
        user: orgUserInfo.user,
        awsCredentials,
        authorization: orgUserInfo.authorization,
        organizationUser: orgUserInfo.organizationUser,
      }

      this.emit(AuthEvents.UPDATED, this.account)

      if (location.pathname.startsWith('/access_token')) {
        location.replace('/')
      }
    } catch (err) {
      log.error('Unable to get AWS credentials', err)
    }
  }

  /**
   * Periodically check if the user's aws credentials are valid
   */
  protected async checkUserAWSTokenExpiration() {
    if (!this.account) {
      log.error('can not get AWS tokens while user is not logged in.')
      return
    }

    // Check if AWS Credentials need to be refreshed
    const awsCredentialsExpiration = this.account.awsCredentials.expiration / 1000 || 0

    if (!(awsCredentialsExpiration < currentTimeInSeconds() + this.AWS_TOKEN_EXPIRATION_INTERVAL * 1.5)) return

    // AWS Credentials expired or expiring soon, fetching new ones

    this.setUserProfile(this.account.authCredentials)
  }

  /**
   * Check the user's auth token expiration
   */
  protected async checkAuth0TokenExpiration() {
    const expiresAt = (this.account && this.account.authCredentials.expiresAt) || 0
    const tokenValidNow = expiresAt > currentTimeInSeconds()
    log.info(`Checking to refresh user auth tokens. Id token expires on ${printDate(expiresAt)}, raw=${expiresAt}.`)

    if (!tokenValidNow || !this.authToken) {
      // Logout user
      log.warn('User has an invalid auth token. Logging user out.')
      await this.logout()
      return
    }

    // Get the current Auth0 idToken and check if it will expire in next 45 minutes
    // AUTH0_TOKEN_EXPIRATION_INTERVAL * 1.5 is used as a buffer across interval checks
    if (this.authToken && !this.isAuthTokenValid(minutesToSeconds(this.AUTH0_TOKEN_EXPIRATION_INTERVAL * 1.5))) {
      log.info('Auth token is about to expire. Refreshing now')
      this.lock.checkSession({}, async (err, authResult) => {
        log.info('Result from refreshing auth token', err, authResult)

        if (!err && authResult) {
          authResult['expiresAt'] = decodeJWTToken(authResult['idToken'], 'exp')
          await this.setUserProfile((authResult as unknown) as Auth0Credentials) // TODO fix type
        } else {
          log.error('Error refreshing user auth tokens', err)
        }
      })
    } else if (!this.authToken) {
      log.warn('No auth token found, unable to attempt refresh.')
    } else {
      log.info('Auth token valid. No need to refresh.')
    }
  }

  private lock = new Auth0Lock(this.authClientId, this.authDomain, {
    auth: {
      sso: false,
      responseType: 'token id_token',
      redirectUrl: 'http://localhost:23456',
      redirect: false,
      params: {
        scope: 'openid email profile offline_access',
      },
    },

    languageDictionary: {
      title: 'mapper',
    },

    theme: {
      logo: 'https://s3.amazonaws.com/mapper-website-assets/prod/images/mapper_mark.png',
      primaryColor: '#0E0E0E',
    },
  })

  private tokenCheckerTimer: number = -1
  private awsCredentialsTimer: number = -1
  private appAWSCredentialsTimer: number = -1

  private isAuthTokenValid(offsetInSeconds = 0): boolean {
    const expiresAt = (this.account && this.account.authCredentials.expiresAt) || 0
    const tokenValid = expiresAt > currentTimeInSeconds() + offsetInSeconds
    return tokenValid
  }
}

/**
 * @function decodeJWTToken - Decode a JWT Token and extract a key value from it
 * @param token - The JWT token
 * @param key - The key whose value you want
 */
function decodeJWTToken(token: string, key: string): string | number | null {
  if (!token) return null
  const decoded = jwt_decode(token) as any
  return decoded[key] || null
}

export function currentTimeInSeconds(): number {
  return Date.now() / 1000
}

function minutesToSeconds(minutes: number): number {
  return minutes * 60
}

function printDate(seconds: number): string {
  const date = new Date(seconds * 1000)
  return `${date.toDateString()} ${date.toTimeString()}`
}

export interface Auth0Credentials {
  accessToken: string
  expiresAt: number
  idToken: string
  scope: string
}

export interface IAccount {
  authCredentials: Auth0Credentials
  user: IProfile
  awsCredentials: IAWSTemporaryCredentials
  authorization: IAuthorization
  organizationUser: IOrganizationUser
}

export interface IProfile {
  id: string
  given_name: string
  family_name: string
  email: string
  picture: string
  authorizationInfo: IAuthorization
  organization?: string
}

export interface IAuthorization {
  id: string
  email: string
  organizations: Array<IOrganizationUser>
  permissions: Array<string>
  mapper: boolean
}

export interface IAWSCredentials {
  accessKeyId: string
  secretAccessKey: string
}

export interface IAWSTemporaryCredentials extends IAWSCredentials {
  sessionToken: string
  expiration: number // milliseconds
}

export interface IOrganizationUserResponse {
  organization: IOrganization
  users: Array<IOrganizationUserInfo>
  roles: Array<IRole>
}

export interface IOrganization {
  id: string
  name: string
  description: string
  deleted: boolean
  createdAt: number
  createdBy: string
  updatedAt: number
  updatedBy: string
}

export interface IOrganizationUserInfo {
  organizationUser: IOrganizationUser
  user: IProfile
  authorization: IAuthorization
  roles: Array<string>
  permissions: Array<string>
}

export interface IOrganizationUser {
  id: string
  organization: IOrganization
  owner: boolean
  userId: string
  roles: Array<IRole>
  deleted: boolean
  createdAt: number
  createdBy: string
  updatedAt: number
  updatedBy: string
}

export interface IRole {
  id: string
  name: string
  description: string
  permissions: Array<string>
  createdAt: number
  createdBy: string
  updatedAt: number
  updatedBy: string
}

/**
 * Get all the hash params from a url
 *
 * @param {string} url
 * @returns {{[p:string]:string}}
 */
function getHashParams(url: string): {[key: string]: string} {
  const result = {}

  if (url.indexOf('#') === -1) {
    return result
  }

  try {
    const pairs = (url && url.split('#')[1].split('&')) || []

    pairs.forEach(pair => {
      try {
        const [key, value] = pair.split('=')
        result[key] = value
      } catch (ex) {
        log.warn('Unable to parse', pair)
      }
    })
  } catch (ex) {
    log.warn('Unable to parse pairs', ex)
  }

  return result
}

function makeEnumFromClass<T>(Class: new (...args: unknown[]) => T): {[key in keyof T]: key} {
  const Enum = {} as {[k in keyof T]: k}

  // loop on the keys of a dummy Class instance in order to create the
  // enum-like.
  for (const key in new (Class as any)()) Enum[key] = key

  return Object.freeze(Enum)
}
