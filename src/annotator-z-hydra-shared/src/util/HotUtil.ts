import * as _ from "lodash"

export function getHot<T extends any>(mod, key, defaultValue: T | null = null): T | null {
  if ((module as any).hot) {
    return _.get(mod, `hot.data.${key}`, defaultValue) as any
  }
  return defaultValue
}
