try {
	require('babel/register')
} catch (err) {}

try {
	require('babel-polyfill')
} catch (err) {}

require('shelljs/global')

const path = require('path')
const {exec, process, test, mkdir, echo} = global

/**
 * Exec cmd
 *
 * @param cmd
 * @param onError
 */
function execNoError(cmd, onError = null) {
	const
		result = exec(cmd)

	if (result.code !== 0) {
		if (!onError || onError(result) !== false)
			process.exit(result.code)
	}

	return result
}

const {platform} = process
const Fs = require('fs')
const isMac = platform	=== 'darwin'
const isWindows = platform === 'win32'

Object.assign(global, {
	execNoError,
	baseDir: process.cwd(),
	isMac,
	isWindows,
	isLinux: !isMac && !isWindows,
	platformName: isWindows ? 'windows' : isMac ? 'macos' : 'linux',
	WindowsEpicPath: `c:/users/jglanz/development/densebrain/epictask-workspace/epictask`,

	/**
	 * Setup Dev ENV
	 */
	devEnv() {
		Object.assign(process.env, {
			HOT: 1,
			DEBUG: 1,
			NODE_ENV: 'development',
			COLOR: 0,
			COLORS: 0,
		})
	},

	/**
	 * Ensures that required directories exist
	 */
	prepareDirs() {
		const
			homeDir = process.env.HOME
		const hostname = require('os').hostname()
		const mkRamDiskCmd = `${homeDir}/Dropbox/Home/bin/mk-ramdisk.sh`
		const awCacheExists = test('-d', 'dist/.awcache')
		const mkRamDiskCmdExists = test('-e', mkRamDiskCmd)

		if (!awCacheExists) {
			if (mkRamDiskCmdExists && hostname === 'linux-dev') {
				echo(`Creating ramdisk`)
				exec(`sudo rm -R ${process.cwd()}/dist`)
				exec(`sudo ${mkRamDiskCmd} epic-ramdisk 6g ${process.cwd()}/dist`)
			} else {
				mkdir(`-p`, `dist/.awcache`)
			}
		}

		mkdir('-p', path.resolve(process.cwd(), 'dist/.awcache'))
		mkdir('-p', path.resolve(process.cwd(), 'dist/build'))
	},

	/**
	 * Webpack command
	 */
	webpackCmd: path
		.resolve(
			process.cwd(),
			'node_modules',
			'.bin',
			`webpack${process.platform === 'win32' ? '.cmd' : ''}`
		),

	/**
	 * Gulp command
	 */
	gulpCmd: path
		.resolve(
			process.cwd(),
			'node_modules',
			'.bin',
			`gulp${process.platform === 'win32' ? '.cmd' : ''}`
		),

	/**
	 * Write object to json file
	 *
	 * @global
	 * @param filename
	 * @param o
	 */
	writeJsonFile(filename, o) {
		Fs.writeFileSync(filename, JSON.stringify(o, null, 2))
	},

	/**
	 * Read file as JSON object
	 *
	 * @param filename
	 * @returns {any}
	 */
	readJsonFile(filename) {
		return JSON.parse(Fs.readFileSync(filename, 'utf8'))
	},

})
