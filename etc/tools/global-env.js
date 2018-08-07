require('shelljs/global')

const tsc = require('typescript')
const assert = require('assert')
const path = require('path')
const semver = require('semver')
const _ = require('lodash')
const {readJSONFileSync} = require('./helpers')
const baseDir = global.baseDir = global.baseDir || path.resolve(__dirname, '../..')

global.log = console

process.argv.forEach(arg => {
	if (arg === '--dev') process.env.NODE_ENV = 'development'
})

/**
 * Global modules and
 */
const TypeScriptEnabled = true
const env = process.env.NODE_ENV || 'development'
const isDev = env === 'development'

Object.assign(global, {
	tsc,
	_,
	env,
	isDev,
	isProd: !isDev,
	isSaffron: typeof process.env.SAFFRON !== 'undefined',
	basePackageJson: readJSONFileSync(`${baseDir}/package.json`),
	srcRootDir: path.resolve(baseDir, TypeScriptEnabled ? 'src' : 'dist/out'),
	assert,
}, require('./helpers'))

// Config for release and versioning
Object.assign(global, {
	nextMinorVersion: semver.inc(global.basePackageJson.version, 'patch'),
	releaseFiles: [],
	releaseDir: `${baseDir}/target/releases`,
})
