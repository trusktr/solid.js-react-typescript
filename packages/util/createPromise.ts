export default
function createPromise<A, B>() {

    let resolve: (val?:A | PromiseLike<A>) => void
    let reject: (val:B) => void

    const promise = new Promise<A>( ( res, rej ) => {

        resolve = res
        reject = rej

    } )

    return { promise, resolve, reject }

}
