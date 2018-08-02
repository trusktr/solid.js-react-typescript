#!/usr/bin/env node

/* global prepareDirs, exec, webpackCmd */

require('./init-scripts')

require('shelljs/global')

prepareDirs()

const
	cmd = process.platform === 'win32'
		? `node_modules\\.bin\\babel-node --max-old-space-size=2500 .\\node_modules\\webpack\\bin\\webpack.js`
		: `./node_modules/.bin/babel-node --max-old-space-size=4000 ${webpackCmd}`

exec(`${cmd} --config etc/webpack/webpack.config.js --display-error-details --hide-modules`)

// exec(`node ${webpackCmd} --config etc/webpack/webpack.config.js --display-error-details`)

// exec(`${gulpCmd} compile`)

// exec('node --max-old-space-size=1500 ./node_modules/gulp/bin/gulp.js compile-watch')
