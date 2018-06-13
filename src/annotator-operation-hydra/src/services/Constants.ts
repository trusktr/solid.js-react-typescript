import * as SaffronSDK from "@mapperai/mapper-saffron-sdk"

console.log("IMPORT SDK", SaffronSDK)
export const apiRoadNetwork = 4
export const apiDomain = 'dev' // 'dexmonicus' 'evgenyzava'
export const apiVersion = 1

export const defaultRequestHeaders = {
  "Mapper-Client-Name": "saffron-roadnetwork-editor",
  "page-size": 100000,
  "page-number": 0
}
