/**
 *  Copyright 2018 Mapper Inc. Part of the mapper-annotator project.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

export interface Resolve<A> {
  (val?: A | PromiseLike<A>): void
}
export interface Reject<B> {
  (val: B): void
}
export type PromiseReturn<A, B> = {
  // eslint-disable-line comma-spacing
  promise: Promise<A>
  resolve: Resolve<A>
  reject: Reject<B>
}

export default function createPromise<A, B>(): PromiseReturn<A, B> {
  // These two default function values aren't needed if we upgrade to TS ^2.7.1
  // https://github.com/Microsoft/TypeScript/pull/20166
  let res: Resolve<A> = (): void => {} // tslint:disable-line:no-empty
  let rej: Reject<B> = (): void => {} // tslint:disable-line:no-empty

  const promise = new Promise<A>(
    (resolve, reject): void => {
      res = resolve
      rej = reject
    }
  )

  return { promise, resolve: res, reject: rej }
}