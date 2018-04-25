interface Resolve<A> {
	(val?:A | PromiseLike<A>): void
}

interface Reject<B> {
	(val:B): void
}

type PromiseReturn<A, B> = {
	promise: Promise<A>
	resolve: Resolve<A>
	reject: Reject<B>
}

export default
function createPromise<A, B>(): PromiseReturn<A, B> {

    let resolve: (val?:A | PromiseLike<A>) => void
    let reject: (val:B) => void

    const promise = new Promise<A>( ( res, rej ) => {

        resolve = res
        reject = rej

    } )

    return { promise, resolve, reject }

}
