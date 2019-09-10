/**
 *  Copyright 2019 Velodyne Lidar, Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import {HttpMethod} from './CloudService'
import {IAWSTemporaryCredentials, IOrganizationUserInfo} from './AuthService'

export interface MakeAPIRequestParameters {
  method: HttpMethod
  uri: string
  clientName: string
  body: any
  query: string | null
  headers: any
  retries: number
  isJsonResponse: boolean
  delay: number // milliseconds to wait between requests
  parseResponse: boolean
}

export function defaultMakeAPIRequestParameters(): Partial<MakeAPIRequestParameters> {
  return {
    body: null,
    query: null,
    headers: {},
    retries: 3,
    isJsonResponse: true,
    delay: 1000,
    parseResponse: true,
  }
}

export interface MakeAPIRequestResponse {
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
