import {AuthService} from './AuthService'
import {getLogger} from '../../util/Logger'
import {
  ApiResponseHeaders,
  defaultMakeAPIRequestParameters as defaults,
  IProfileResponse,
  MakeAPIRequestParameters,
  MakeAPIRequestResponse,
} from './Models'

const log = getLogger(__filename)

// TODO get this from somewhere outside of the application (f.e. from the build
// step, or set by CLI env vars).
const MAPPER_ENV = 'dev'

// todo change to something appropriate with this class moves to a standalone lib
export const saffronClientName = 'saffron-platform'

export const apiVersion = 1

export enum HttpMethod {
  GET,
  POST,
  PATCH,
  PUT,
  DELETE,
}

const HeaderMap = {
  authorization: 'Authorization',
  totalItems: 'total-items',
  pageSize: 'page-size',
  pageNumber: 'page-number',
}

export class CloudService {
  static identityProfileEndpoint = `identity/${apiVersion}/profile`
  static healthEndpoint = 'health'

  static makeAPIURL(uri: string): string {
    const api = uri.split('/')[0]
    const baseUrl = `https://${MAPPER_ENV}-${api}-api.mapperai.net`.toLowerCase()
    return `${baseUrl}/${uri}`
  }

  constructor(public auth: AuthService) {}

  /**
   * Retrieve the user credentials from Mapper Cloud Services
   */
  async getUserProfile(idToken: string | null = this.auth.authToken): Promise<IProfileResponse> {
    const method = HttpMethod.GET
    const uri = CloudService.identityProfileEndpoint

    if (!idToken) throw new TypeError('idToken must not be null in order to get the user profile.')

    log.info(`Requesting user profile from Cloud Services`)
    try {
      const headers = {Authorization: `Bearer ${idToken}`}
      const result = await this.makeAPIRequest({
        ...defaults(),
        method,
        uri,
        clientName: saffronClientName,
        headers,
      } as MakeAPIRequestParameters)
      const {data} = result

      log.info('User profile obtained ', result)

      return data as IProfileResponse
    } catch (err) {
      log.error('Error occurred while requesting cloud service user profile ', err)
      throw err
    }
  }

  async health(): Promise<MakeAPIRequestResponse> {
    log.debug(`Requesting health endpoint`)
    const method = HttpMethod.GET
    const uri = CloudService.healthEndpoint

    return this.makeAPIRequest({...defaults(), method, uri, clientName: saffronClientName} as MakeAPIRequestParameters)
  }

  /**
   * Make an API request to cloud services
   */
  makeAPIRequest = async (params: MakeAPIRequestParameters): Promise<MakeAPIRequestResponse> => {
    const {method, uri, clientName, body, query, headers, retries, isJsonResponse, delay, parseResponse} = params

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
        log.error('Unable to set body', body, err)
        throw err
      }
    }

    const idToken = this.auth.authToken

    if (!headers[HeaderMap.authorization] && idToken) headers[HeaderMap.authorization] = `Bearer ${idToken}`

    headers['mapper-client-name'] = clientName

    let url = CloudService.makeAPIURL(uri)
    if (query) url = url.concat(`?query=${query}`)
    log.info('saffron fetch:', request.method, url)

    try {
      const response = await fetch(url, request)
      if (response.status >= 400) {
        log.warn(`Request for ${url} failed (${response.status}): ${response.statusText}`, response)
        // noinspection ExceptionCaughtLocallyJS
        throw new APIError(response)
      }

      if (!parseResponse)
        return {
          success: true,
          response,
        } as MakeAPIRequestResponse

      let formattedResponse: any
      try {
        formattedResponse = await (isJsonResponse ? response.json() : response.text())
      } catch (err) {
        log.warn('response err', err)
      }

      const headers: ApiResponseHeaders = {
        totalItems: parseInt(response.headers.get('total-items') || '', 10),
        pageSize: parseInt(response.headers.get('page-size') || '', 10),
        pageNumber: parseInt(response.headers.get('page-number') || '', 10),
      }

      return {
        success: true,
        headers: headers,
        data: formattedResponse,
        response,
      } as MakeAPIRequestResponse
    } catch (err) {
      if (err instanceof APIError) {
        if (err.response.status >= 500) {
          // Determine if the request should be retried
          if (retries === 0) {
            log.debug('Request failed, and no more retries remaining - throwing error')
            throw err
          }

          // exponential back-off
          await sleep(delay)

          // an error occurred and we should retry it
          log.debug(`Retrying request for ${uri} -- retries left ${retries - 1} -- current error`, err)
          return await this.makeAPIRequest({
            method,
            uri,
            clientName,
            body,
            query,
            headers,
            isJsonResponse,
            parseResponse,
            retries: retries - 1,
            delay: delay * 2,
          })
        } else {
          // Some kind of client error
          return {
            success: false,
            response: err.response,
          } as MakeAPIRequestResponse
        }
      }

      // an error occurred and the status was less than 500 (most likely a 400 which we shouldn't retry on)
      log.error(err)
      throw err
    }
  }
}

export class APIError extends Error {
  constructor(public response: Response) {
    super(response.statusText)
  }
}

const sleep = (t: number) => new Promise(r => setTimeout(r, t))
