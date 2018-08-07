module.exports = function(content) {
	const {resourcePath} = this

	// Mark plugin as cache-able
	this.cacheable()

	// console.log(`Proxy provider is checking`,resourcePath)
	let hotStuff = ''

	if (/(@Provided|shared\/util\/ProxyProvided)/.test(content)) {
		const isTS = /\.tsx?$/.test(resourcePath)

		// console.log(`Adding @Provided hot loading for ${resourcePath}`,isTS)

		hotStuff = `
			if (module.hot) {
				const hotLog = (...hotLogArgs) => {
					if (typeof console !== 'undefined')
						${isTS ? '(console as any)' : 'console'}.log(...hotLogArgs)
				}

				module.hot.accept(() => hotLog('HMR Updating ProxyProvided',typeof __filename !== 'undefined' ? __filename : '${resourcePath.replace(/\\/g, '/')}'))
			}
		`
	}

	return content + hotStuff
}
