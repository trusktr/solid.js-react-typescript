#!/usr/bin/env node
require('./init-scripts')

devEnv()

require('shelljs/global')

const
	path = require('path')

prepareDirs()

const
	cmd = process.platform === 'win32' ?
		`node_modules\\.bin\\babel-node --max-old-space-size=2500 .\\node_modules\\webpack\\bin\\webpack.js` :
		`./node_modules/.bin/babel-node --max-old-space-size=4000 ${webpackCmd}`

exec(`${cmd} --config etc/webpack/webpack.config.js --watch --display-error-details --hide-modules`)

//exec(`${gulpCmd} compile-watch`)

//exec('node --max-old-space-size=1500 ./node_modules/gulp/bin/gulp.js compile-watch')
