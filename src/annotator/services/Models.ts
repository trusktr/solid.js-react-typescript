/**
 *  Copyright 2019 Velodyne Lidar, Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import {HttpMethod} from './CloudService'
import {IAWSTemporaryCredentials, IOrganizationUserInfo} from './AuthService'

export interface APIRequestOptions {
  method: HttpMethod
  uri: string
  clientName: string
  body?: unknown | null
  cors?: 'cors' | 'no-cors' | 'same-origin'
  query?: string | null
  headers?: Record<string, string>
  retries?: number
  isJsonResponse?: boolean
  delay?: number
  parseResponse?: boolean
}

export const DEFAULT_API_REQUEST_OPTIONS: Partial<APIRequestOptions> = Object.freeze({
  body: null,
  cors: 'cors',
  query: null,
  headers: {},
  retries: 3,
  isJsonResponse: true,
  delay: 1000,
  parseResponse: true,
})

export interface APIResponse {
  success: boolean
  headers?: ApiResponseHeaders
  data?: any
  response: Response
}

export interface ApiResponseHeaders {
  totalItems: number
  pageSize: number
  pageNumber: number
}

export interface IProfileResponse {
  orgUserInfo: IOrganizationUserInfo
  awsCredentials: IAWSTemporaryCredentials
}
