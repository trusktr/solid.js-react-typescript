const
	assert = require('assert'),
	fs = require('fs'),
	path = require('path'),
	proxyProvidedLoaderPath = require.resolve('../loaders/provided-proxy-loader'),
	srcTest = /\.tsx?$/

//log.info(`Resolved provided proxy pre-loader to ${proxyProvidedLoaderPath}`)

module.exports = {
	/**
	 * All pre-loaders, for
	 * hot loading, source-maps, etc
	 */
	
	loaders: [
		{
			test: /\.json$/,
			loader: 'json'
		},
		
		// SourceCode
		{
			test: srcTest,
			exclude: [/node_modules/],
			loaders: [
				'react-hot-loader/webpack',
				`awesome-typescript-loader?cacheDirectory=dist/.awcache-${isDev ? 'dev' : 'prod'}`,
				proxyProvidedLoaderPath,
				//'source-map-loader'
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
			test: /\.global\.scss$/,
			loaders: [
				'style-loader',
				'css-loader',
				`sass-loader?includePaths=${path.resolve(baseDir, "./packages/annotator-assets")}`
			]
		},
		{
			test: /^((?!\.global).)*\.scss$/,
			exclude: /(node_modules)/,
			loaders: [
				'style-loader',
				'css-loader?modules&sourceMap&importLoaders=1&localIdentName=[name]__[local]___[hash:base64:5]',
				`sass-loader?includePaths=${path.resolve(baseDir, "./src/assets")}`
			]
		}
	]
}




