const {
	env,
	isDev,
	baseDir,
	isSaffron,
} = global
const Path = require('path')
const Fs = require('fs')
const pkgJson = JSON.parse(Fs.readFileSync(Path.resolve(baseDir, 'package.json'), 'utf-8'))

module.exports = {
	__DEV__: isDev,
	__PROD__: !isDev,
	__SAFFRON__: isSaffron,
	DEBUG: isDev,
	TEST: false,
	VERSION: JSON.stringify(pkgJson.version),
	'Env.isDev': isDev,
	'process.env.__DEV__': isDev,
	'process.env.NODE_ENV': JSON.stringify(env),
	'process.env.DefaultTransportScheme': JSON.stringify('IPC'),
	'ProcessConfig.isStorybook()': false,
	'Env.isElectron': true,
}
