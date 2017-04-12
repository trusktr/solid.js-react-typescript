#!/usr/bin/env node
require('./init-scripts')

require('shelljs/global')

const
	path = require('path')


prepareDirs()


//exec(`node ${webpackCmd} --config etc/webpack/webpack.config.js --display-error-details`)

exec(`${gulpCmd} compile`)

//exec('node --max-old-space-size=1500 ./node_modules/gulp/bin/gulp.js compile-watch')
