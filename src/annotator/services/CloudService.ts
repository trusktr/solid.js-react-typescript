import {IAWSTemporaryCredentials, IOrganizationUserInfo, AuthService} from './AuthService'

// TODO get this from somewhere outside of the application (f.e. from the build
// step, or set by CLI env vars).
const MAPPER_ENV = 'dev'

export const apiVersion = 1

export enum HttpMethod {
  GET,
  POST,
  PATCH,
  PUT,
  DELETE,
}

export enum API {
  Identity,
  Saffron,
  Payments,
  Common,
  Tasking,
  RoadNetwork,
  Device,
  Tobler,
  Tiles,
}

export const Headers = {
  ContentType: 'Content-Type',
  Authorization: 'Authorization',
  OrganizationId: 'organization-id',
}

export const MimeTypes = {
  PLAIN: 'text/plain',
  JSON: 'application/json',
}

export class CloudService {
  static identityProfileEndpoint = `identity/${apiVersion}/profile`
  static healthEndpoint = 'health'

  static makeBaseURL(api: API, cloudDomain: string): string {
    return `https://${cloudDomain.toLowerCase()}-${API[api].toLowerCase()}-api.mapperai.net`
  }

  static makeAPIURL(api: API, uri: string): string {
    return `${this.makeBaseURL(api, MAPPER_ENV)}/${uri}`
  }

  constructor(public auth: AuthService) {}

  /**
   * Retrieve the user credentials from Mapper Cloud Services
   * @param {string} accessToken
   * @param {string} idToken
   * @returns {Promise<any>}
   */
  async getUserProfile(idToken: string | null = this.auth.authToken): Promise<IProfileResponse> {
    const method = HttpMethod.GET,
      uri = CloudService.identityProfileEndpoint,
      api = API.Identity

    if (!idToken) throw new TypeError('idToken must not be null in order to get the user profile.')

    console.info(`Requesting user profile from Cloud Services`)
    try {
      const result = await this.makeAPIRequest(api, method, uri, 'saffron-platform', null, undefined, {
          Authorization: `Bearer ${idToken}`,
        }),
        {data} = result

      console.info('User profile obtained ', result)

      return data as IProfileResponse
    } catch (err) {
      console.error('Error occurred while requesting cloud service user profile ', err)
      throw err
    }
  }

  async health() {
    console.debug(`Requesting health endpoint`)
    const method = HttpMethod.GET,
      uri = CloudService.healthEndpoint,
      api = API.Saffron

    try {
      const content = await this.makeAPIRequest(api, method, uri, 'saffron-platform', null, undefined)
      console.info('Health endpoint response - ', content)
      return content
    } catch (err) {
      console.error('Error occurred while checking health endpoint ', err)
    }
  }

  /**
   * Make an API request to cloud services
   *
   * @param {HttpMethod} method
   * @param {string} uri
   * @param body
   * @param {boolean} isJsonResponse
   * @returns {Promise<any>}
   * @param api
   * @param clientName
   * @param query
   * @param headers
   * @param retries
   * @param isJsonResponse
   * @param delay - milliseconds to wait between requests
   */
  makeAPIRequest = async (
    api: API,
    method: HttpMethod,
    uri: string,
    clientName: string,
    body: any = null,
    query: string | null = null,
    headers: any = {},
    retries: number = 3,
    isJsonResponse: boolean = true,
    delay: number = 1000
  ): Promise<any> => {
    const request = {
      method: HttpMethod[method],
      cache: 'no-cache',
      mode: 'cors',
      headers,
    } as any

    if (body) {
      try {
        request.body = typeof body === 'string' ? body : JSON.stringify(body)
        headers['Content-Type'] = typeof body === 'string' ? 'plain/text' : 'application/json'
      } catch (err) {
        console.error('Unable to set body', body, err)
        throw err
      }
    }

    const idToken = this.auth.authToken

    if (!headers['Authorization'] && idToken) {
      headers['Authorization'] = `Bearer ${idToken}`
    }

    headers['mapper-client-name'] = clientName

    console.debug('Body request', request.body)

    let url = (this.constructor as typeof CloudService).makeAPIURL(api, uri)

    if (query) {
      url = url.concat(`?query=${query}`)
    }

    console.info('Saffron requesting from', url)

    try {
      const response = await fetch(url, request)
      if (response.status >= 400) {
        console.error(`Request for ${url} failed (${response.status}): ${response.statusText}`, response)
        // noinspection ExceptionCaughtLocallyJS
        const contentType = response.headers.get(Headers.ContentType)

        let responseData: string | Object | null = null
        try {
          if (contentType === MimeTypes.JSON) {
            responseData = await response.json()
          } else {
            responseData = await response.text()
          }
        } catch (ex) {
          console.warn('Failed to get error response data', ex)
        }

        throw new APIError(url, responseData, response.status, response.statusText)
      }

      const formattedResponse = await (isJsonResponse ? response.json() : response.text())

      // wrap it in a model so we can include the headers among other fields
      return {
        headers: response.headers,
        data: formattedResponse,
      } as MakeAPIRequestResponse
    } catch (err) {
      if (!(err instanceof APIError)) throw err

      // Determine if the request should be retried
      if (retries === 0) {
        console.debug('Request failed, and no more retries remaining - throwing error')
        throw err
      }

      if (err.statusCode >= 500) {
        // exponential backoff
        await sleep(delay)
        console.info('Finished exponential backoff')

        // an error occurred and we should retry it
        console.debug(`Retrying request for ${uri} -- retries left ${retries - 1} -- current error`, err)
        return await this.makeAPIRequest(
          api,
          method,
          uri,
          clientName,
          body,
          query,
          headers,
          retries - 1,
          isJsonResponse,
          delay * 2
        )
      }

      // an error occurred and the status was less than 500 (most likely a 400 which we shouldn't retry on)
      console.error(`Error occurred -- status: ${err.statusCode || 'unknown status'} -- error:`, err)
      throw err
    }
  }
}

export class APIError extends Error {
  private data: string | Object

  url: string
  statusCode: number
  statusText: string

  constructor(url: string, data: string | Object | null, statusCode: number, statusText: string | null = null) {
    super(typeof data === 'string' ? data : JSON.stringify(data, null, 4))

    Object.assign(this, {
      url,
      data,
      statusCode,
      statusText,
    })
  }

  get dataJSON(): Object {
    return typeof this.data === 'string' ? {data: this.data} : this.data
  }

  get dataString(): string {
    return typeof this.data === 'string' ? this.data : JSON.stringify(this.data, null, 4)
  }

  get toJSON() {
    return {
      url: this.url,
      statusCode: this.statusCode,
      statusText: this.statusText,
      data: this.data,
    }
  }

  toString() {
    return this.dataString
  }
}

const sleep = (t: number) => new Promise(r => setTimeout(r, t))

export interface MakeAPIRequestResponse {
  headers: any
  data: any
}

export interface IProfileResponse {
  orgUserInfo: IOrganizationUserInfo
  awsCredentials: IAWSTemporaryCredentials
}
