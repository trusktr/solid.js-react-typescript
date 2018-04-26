// GET SHELL JS
import '../tools/global-env'
import assert from 'assert'
import CircularDependencyPlugin from "circular-dependency-plugin"
import Webpack,{ DefinePlugin,HotModuleReplacementPlugin} from 'webpack'
import Path from 'path'
import Fs from 'fs'
import DefinedEnv from './webpack.env'
import LoaderConfig from './parts/loaders'
import {CheckerPlugin} from 'awesome-typescript-loader'

// EXTERNALS / makes all node_modules external
import nodeExternals from 'webpack-node-externals'

// Import globals
const
	{
		isDev,
		baseDir,
		srcRootDir,
		_
	} = global

const
	isPackaging = false


/**
 * Resolves directories and maps to ram disk
 * if available
 */
function resolveDirs(...dirs) {
	return dirs.map(dir => {
		return (['c', 'C', '/', '.'].includes(dir.charAt(0))) ?
			Path.resolve(dir) :
			Path.join(baseDir, dir)
	})
}

assert(Fs.existsSync(srcRootDir), `TypeScript must be compiled to ${Path.resolve(srcRootDir)}`)

const
	// Module Directories
	moduleDirs = resolveDirs(srcRootDir, 'node_modules'),

	// Output Directory
	distDir = `${baseDir}/dist/${isPackaging ? 'app-package' : 'app'}`

// TypeScript SRC ALIAS
function tsAlias(tsFilename) {
	return Path.resolve(srcRootDir, tsFilename)
}

function makeAliases() {
	return {
		buildResources: Path.resolve(baseDir, 'build'),
		libs: Path.resolve(baseDir, 'libs'),
		styles: tsAlias('annotator-assets/styles'),
		assets: tsAlias('annotator-assets')
	}
}

/**
 * Create externals array
 */
function makeExternals() {
	return [
		nodeExternals({
			whitelist: [
				/webpack/,
				/webpack-hot/,
				/react-hot-loader/
			]
		})
	]
}

/**
 * Create module config
 */
function makeModuleConfig() {
	return LoaderConfig
}

export function makeHotEntry(entry, devEntries) {
	// HMR ENTRY ADDITION
	if (isDev) {
		entry.unshift("webpack/hot/dev-server")
		entry.unshift('webpack/hot/poll.js?500')
	}

	if (devEntries)
		entry.unshift(...devEntries)

	return entry
}

function makeOutputConfig(name, isEntry = false) {
	const
		outputConfig = {
			path: `${distDir}/`,
			publicPath: `${distDir}/`,
		}

	outputConfig.filename = '[name].js'

	if (isEntry !== true)
		outputConfig.library = `${name}`

	return outputConfig
}

function makeResolveConfig() {
	return {
		alias: makeAliases(),
		modules: moduleDirs,
		extensions: ['.ts', '.tsx', '.js', '.jsx']
	}
}

function patchConfig(config) {
	// Development specific updates
	if (isDev) {
		_.merge(config, {
			// In development specify absolute path - better debugger support
			output: {
				devtoolModuleFilenameTemplate: "file://[absolute-resource-path]",
				devtoolFallbackModuleFilenameTemplate: "file://[absolute-resource-path]"
			},
		})

		config.plugins.splice(1, 0, new HotModuleReplacementPlugin())
	} else {
		config.plugins.push(new Webpack.optimize.UglifyJsPlugin({
			mangle: false,
			mangleProperties: false,
			compress: {
				warnings: true
			}
		}), new Webpack.LoaderOptionsPlugin({
			minimize: true,
			debug: false
		}))
	}

	return config
}

const
	DevTools = {
		'development': 'cheap-source-map',
		'production': 'source-map'
	},

	devtool = DevTools[process.env.NODE_ENV]

// Webpack Config
export function makeConfig(name, dependencies, entry, configFn) {
	let
		config = {

			name,
			dependencies,
			/**
			 * Target type
			 */
			target: 'node',

			/**
			 * All entries including common
			 */
			entry,
			/**
			 * Source root, './packages'
			 */
			context: srcRootDir,

			/**
			 * Stats config
			 */
			stats:  WebpackStatsConfig,

			/**
			 * Output configuration
			 */
			output: makeOutputConfig(null, true),

			// LOADERS
			module: makeModuleConfig(),
			cache: true,
			recordsPath: `${distDir}/records__${name}`,

			/**
			 * DevTool config
			 */
			devtool,

			// Currently we need to add '.ts' to the resolve.extensions array.
			resolve: makeResolveConfig(),

			/**
			 * Plugins
			 */
			plugins: [
				new CheckerPlugin(),

				// NO ERRORS
				new Webpack.NoEmitOnErrorsPlugin(),

				// AVOID CIRCULAR
				new CircularDependencyPlugin(),

				// ENV
				new DefinePlugin(DefinedEnv),

				// NAMED MODULES
				new Webpack.NamedModulesPlugin(),
			],

			/**
			 * Node Shims
			 */
			node: {
				__dirname: true,
				__filename: true,
				global: true,
				process: true
			},

			/**
			 * Externals
			 */
			externals: makeExternals()
		}

	if (configFn)
		configFn(config)

	return patchConfig(config)
}
