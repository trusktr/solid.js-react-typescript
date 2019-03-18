interface Window {
  mapperOrganizationId?: string
  mapperSessionId?: string
  isSaffron: boolean
}

// StrictUnion<A | B | C>
// see https://github.com/trusktr/typebox/blob/master/src/StrictUnion.ts
type UnionKeys<T> = T extends any ? keyof T : never
type StrictUnionHelper<T, TAll> = T extends any ? T & Partial<Record<Exclude<UnionKeys<TAll>, keyof T>, never>> : never
type StrictUnion<T> = StrictUnionHelper<T, T>
