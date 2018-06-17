
import '../scripts/init-scripts'
import '../tools/global-env'
const { isDev, baseDir, srcRootDir, _ } = global
import DefinedEnv from './webpack.env'
import assert from 'assert'
import HtmlWebpackPlugin from 'html-webpack-plugin'
import Path from 'path'
import nodeExternals from 'webpack-node-externals'
import CircularDependencyPlugin from "circular-dependency-plugin"
import Webpack, { DefinePlugin, HotModuleReplacementPlugin } from 'webpack'
import Fs from 'fs'
import { CheckerPlugin } from 'awesome-typescript-loader'
import WebpackStatsConfig from './stats'

const name = 'annotator-app'
const moduleDirs = resolveDirs(srcRootDir, 'node_modules')
const isPackaging = false
const distDir = `${baseDir}/dist/${isPackaging ? 'app-package' : 'app'}`

const DevTools = {
	'development': 'cheap-source-map',
	'production': 'source-map'
}

assert(Fs.existsSync(srcRootDir), `TypeScript must be compiled to ${Path.resolve(srcRootDir)}`)

module.exports = patchConfig({

	name,
	dependencies: [],
	target: 'node',

	entry: Object.assign(
		{
		    'annotator-entry-ui': './annotator-entry-ui/index',
		    'annotator-image-lightbox': './annotator-image-lightbox/index',
		},
		!isSaffron ? {
		    'annotator-entry-main': './annotator-entry-main/MainEntry',
		} : {}
	),

	// Source root, './src'
	context: srcRootDir,

	stats: WebpackStatsConfig,

	output: {
		path: `${distDir}/`,
		publicPath: `${distDir}/`,
		filename: '[name].js',
        libraryTarget: 'commonjs2',
	},

	// LOADERS
	module: {
		loaders: [
			{
				test: /\.json$/,
				exclude: [/node_modules/],
				loader: 'json-loader'
			},

			// SourceCode
			{
				test: /\.tsx?$/,
				exclude: [/node_modules/],
				loaders: [
					'react-hot-loader/webpack',
					`awesome-typescript-loader?cacheDirectory=dist/.awcache-${isDev ? 'dev' : 'prod'}`,
					require.resolve('./loaders/provided-proxy-loader'),
				],
			},

			// JADE
			{
				test: /\.(jade|pug)$/,
				loaders: ['pug-loader']
			},

			// ASSETS / FONTS
			{
				test: /\.(eot|svg|ttf|woff|woff2)\w*/,
				loaders: ['file-loader?name=assets/fonts/[name].[hash].[ext]']
			},

			// ASSETS / IMAGES & ICONS
			{
				test: /\.(png|jpg|gif|ico)$/,
				loaders: ['file-loader?name=assets/images/[name].[hash].[ext]'],
			},

			// 3D models
			{
				test: /\.(obj)$/,
				loaders: ['file-loader?name=assets/models/[name].[ext]'],
			},

			// CSS
			{
				test: /\.global\.css$/,
				loaders: [
					'style-loader',
					'css-loader?sourceMap'
				]
			},
			{
				test: /node_modules.*\.css$/,
				loaders: ['file-loader?name=assets/images/[name].[hash].[ext]']
			},
			{
				test: /^((?!\.global).)*\.css$/,
				exclude: /(node_modules)/,
				loaders: [
					'style-loader',
					'css-loader?modules&sourceMap&importLoaders=1&localIdentName=[name]__[local]___[hash:base64:5]'
				]
			},

			// SCSS
			{
				test: /\.scss$/,
				loaders: [
					'style-loader',
					'css-loader',
					{ loader: `sass-loader`, options: {
						data: `$__SAFFRON__: ${ isSaffron };`
					}},
				],
			},
		]
	},
	cache: true,
	recordsPath: `${distDir}/records__${name}`,

	devtool: DevTools[process.env.NODE_ENV],

	// Currently we need to add '.ts' to the resolve.extensions array.
	resolve: {
		alias: {
			assets: alias('annotator-assets'),
			'@': alias(''),
		},
		modules: moduleDirs,
		extensions: ['.ts', '.tsx', '.js', '.jsx']
	},

	plugins: [

        new HtmlWebpackPlugin({
            filename: 'browser-entry.html',
            template: `${process.cwd()}/src/annotator-assets/templates/BrowserEntry.jade`,
            inject: false,
            isDev
        }),

        new HtmlWebpackPlugin({
            filename: 'image-lightbox.html',
            template: `${process.cwd()}/src/annotator-assets/templates/ImageLightbox.jade`,
            inject: false,
            isDev
        }),

		new CheckerPlugin(),

		// ENV
		new DefinePlugin(DefinedEnv),

	].concat( isDev ? [

		// AVOID CIRCULAR
		new CircularDependencyPlugin(),

		// TODO, not needed in newer Webpack, just specify hot:true
		// new HotModuleReplacementPlugin(),

		new Webpack.NamedModulesPlugin(),

	] : [

		// NO ERRORS
		new Webpack.NoEmitOnErrorsPlugin(),

		/* TODO replace with Babel minify, UglifyJS is old and breaks on newer syntax.
		new Webpack.optimize.UglifyJsPlugin({
			mangle: false,
			mangleProperties: false,
			compress: {
				warnings: true
			}
		}),
		*/

		new Webpack.LoaderOptionsPlugin({
			minimize: true,
			debug: false
		}),

	]),

	/**
	 * Node Shims
	 */
	node: {
		__dirname: true,
		__filename: true,
		global: true,
		process: true
	},

	externals: [
		// makes all node_modules external
		nodeExternals({
			whitelist: [
				/webpack/,
				/webpack-hot/,
				/react-hot-loader/
			]
		})
	],
})

/**
 * Resolves directories and maps to ram disk
 * if available
 */
function resolveDirs(...dirs) {
	return dirs.map(dir => {
		// f.e. c:\path, C:\path, /path, ./path, ../path
		return (['c', 'C', '/', '.'].includes(dir.charAt(0))) ?
			Path.resolve(dir) :
			Path.join(baseDir, dir)
	})
}

// TypeScript SRC ALIAS
function alias(tsFilename) {
	console.log('alias:', Path.resolve(srcRootDir, tsFilename))
	return Path.resolve(srcRootDir, tsFilename)
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
	}

	return config
}
