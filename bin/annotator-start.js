process.env['SUPPRESS_NO_CONFIG_WARNING'] = true // keeps gtran-kml package happy

const
	APP_SEARCH_PATHS = [
		'../dist/app',
		'../dist/app-package',
		'../app',
		'..',
		'.',
		'../../../app'
	]

let resolvedAppPath = null
const fs = require('fs')

for (let appPath of APP_SEARCH_PATHS) {
	try {
		appPath = require.resolve(`${appPath}/annotator-entry-main`)

		if (fs.existsSync(appPath)) {
			resolvedAppPath = appPath
            console.log(`Found at ${resolvedAppPath}`)
			break
		}
	} catch (err) {
        console.log(`Failed to find at path ${appPath} ${err.message} ${err}`)
	}
}

console.log(`Loading main`)
if (resolvedAppPath) {
	require(resolvedAppPath)
} else {
	require('../annotator-entry-main')
}
