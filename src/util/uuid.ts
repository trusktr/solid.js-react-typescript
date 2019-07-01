/**
 *  Copyright 2019 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

const uuidRe = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i

export function isUuid(uuid: string): boolean {
  return !!uuid.match(uuidRe)
}
