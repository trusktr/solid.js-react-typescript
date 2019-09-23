import {AuthService} from './AuthService'
import {getLogger} from '../../util/Logger'
import {
  ApiResponseHeaders,
  DEFAULT_API_REQUEST_OPTIONS,
  IProfileResponse,
  APIRequestOptions,
  APIResponse,
} from './Models'

const log = getLogger(__filename)

// TODO get this from somewhere outside of the application (f.e. from the build
// step, or set by CLI env vars).
const CLOUD_ENV = process.env.CLOUD_ENV

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
    const baseUrl = `https://${CLOUD_ENV}-${api}-api.mapperai.net`.toLowerCase()
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
        method,
        uri,
        clientName: saffronClientName,
        headers,
      })

      const {data} = result

      log.info('User profile obtained ', result)

      return data as IProfileResponse
    } catch (err) {
      log.error('Error occurred while requesting cloud service user profile ', err)
      throw err
    }
  }

  async health(): Promise<APIResponse> {
    log.debug(`Requesting health endpoint`)
    const method = HttpMethod.GET
    const uri = CloudService.healthEndpoint

    return this.makeAPIRequest({method, uri, clientName: saffronClientName})
  }

  /**
   * Make an API request to cloud services
   */
  makeAPIRequest = async (options: APIRequestOptions): Promise<APIResponse> => {
    let appliedOptions = Object.assign({}, DEFAULT_API_REQUEST_OPTIONS, options) as Required<APIRequestOptions>
    // prettier-ignore
    const {method, uri, clientName, body, cors, query, headers, retries, isJsonResponse, delay, parseResponse} = appliedOptions

    const request: any = {
      method: HttpMethod[method],
      cache: 'no-cache',
      mode: cors,
      headers,
    }

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

    try {
      const response = await fetch(url, request)
      if (response.status >= 400) {
        log.error(`Request for ${url} failed (${response.status}): ${response.statusText}`, response)
        // noinspection ExceptionCaughtLocallyJS
        throw new APIError(response)
      }

      if (!parseResponse) {
        return {
          success: true,
          response,
        }
      }

      const formattedResponse: any = await (isJsonResponse ? response.json() : response.text())

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
      }
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

          appliedOptions = {...appliedOptions, retries: appliedOptions.retries - 1, delay: appliedOptions.delay * 2}
          return await this.makeAPIRequest(appliedOptions)
        } else {
          // Some kind of client error
          return {
            success: false,
            response: err.response,
          }
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

const sleep = (t: number): Promise<void> => new Promise(resolve => setTimeout(resolve, t))
