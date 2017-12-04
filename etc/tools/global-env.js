require('shelljs/global')
require('../webpack/parts/stats')

const
	tsc = require('typescript'),
	fs = require('fs'),
	assert = require('assert'),
	path = require('path'),
	semver = require('semver'),
	_ = require('lodash')

global.baseDir = global.baseDir || path.resolve(__dirname, '../..')
const
	log = global.log = console,
	{readJSONFileSync} = require('./helpers')

process.argv.forEach(arg => {
	if (arg == '--dev')
		process.env.NODE_ENV = 'development'
})

/**
 * Global modules and
 */
const
	processDir = baseDir,
	TypeScriptEnabled = true,
	env = process.env.NODE_ENV || 'development'


Object.assign(global, {
	tsc,
	_,
	env,
	isDev: env === 'development',
	processDir,
	basePackageJson: readJSONFileSync(`${baseDir}/package.json`),
	srcRootDir: path.resolve(baseDir, TypeScriptEnabled ? 'packages' : 'dist/out'),
	Deferred: require('./deferred'),
	assert
}, require('./helpers'))


// Config for release and versioning
Object.assign(global, {
	nextMinorVersion: semver.inc(basePackageJson.version, 'patch'),
	releaseFiles: [],
	releaseDir: `${baseDir}/target/releases`
})
