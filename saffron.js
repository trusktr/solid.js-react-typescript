require('source-map-support').install()

const SaffronSDK = require('@mapperai/mapper-saffron-sdk')

console.info('LEVEL2')

// Object.assign(window, {
// 	SaffronSDK,
// 	isSaffron: true,
// })

module.exports = require('./dist/package/bundle')
