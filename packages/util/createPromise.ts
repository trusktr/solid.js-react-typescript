interface Resolve<A> {
	(val?: A | PromiseLike<A>): void
}

interface Reject<B> {
	(val: B): void
}

type PromiseReturn<A, B> = {
	promise: Promise<A>
	resolve: Resolve<A>
	reject: Reject<B>
}

export default
function createPromise<A, B>(): PromiseReturn<A, B> {

	// these lines throw a definite assignment error. It can be fixed is we
	// update to TS ^2.7.1. See
	// https://github.com/Microsoft/TypeScript/pull/20166
	let resolve: Resolve<A>
	let reject: Reject<B>

	const promise = new Promise<A>( ( res, rej ): void => {

		resolve = res
		reject = rej

	} )

	return { promise, resolve, reject }

}
