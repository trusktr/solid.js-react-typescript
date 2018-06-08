require('shelljs/global')

const
	tsc = require('typescript'),
	fs = require('fs'),
	assert = require('assert'),
	path = require('path'),
	semver = require('semver'),
	_ = require('lodash'),
	log = global.log = console,
	{readJSONFileSync} = require('./helpers')

global.baseDir = global.baseDir || path.resolve(__dirname, '../..')

process.argv.forEach(arg => {
	if (arg == '--dev')
		process.env.NODE_ENV = 'development'
})

/**
 * Global modules and
 */
const
	TypeScriptEnabled = true,
	env = process.env.NODE_ENV || 'development',
	isDev = env === 'development'


Object.assign(global, {
	tsc,
	_,
	env,
	isDev,
	isProd: !isDev,
	isSaffron: typeof process.env.SAFFRON !== 'undefined',
	basePackageJson: readJSONFileSync(`${baseDir}/package.json`),
	srcRootDir: path.resolve(baseDir, TypeScriptEnabled ? 'src' : 'dist/out'),
	assert
}, require('./helpers'))


// Config for release and versioning
Object.assign(global, {
	nextMinorVersion: semver.inc(basePackageJson.version, 'patch'),
	releaseFiles: [],
	releaseDir: `${baseDir}/target/releases`
})
