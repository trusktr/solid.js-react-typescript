/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

// TODO JOE figure out what we need for Saffron integration
import * as SaffronSDK from "@mapperai/mapper-saffron-sdk"

export const apiRoadNetwork = 4
export const apiDomain = 'dev' // 'dexmonicus' 'evgenyzava'
export const apiVersion = 1

export const defaultRequestHeaders = {
  "Mapper-Client-Name": "saffron-beholder",
  "page-size": 100000,
  "page-number": 0
}
