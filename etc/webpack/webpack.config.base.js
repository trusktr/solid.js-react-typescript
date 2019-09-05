const {DefinePlugin} = require('webpack')
const Path = require('path')
const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin')
const packageJson = require('../../package.json')

const baseDir = Path.resolve(__dirname, '..', '..')
const distDir = `${baseDir}/dist/`
const srcRootDir = Path.resolve(baseDir, 'src')
const isDev = process.env.NODE_ENV !== 'production'
const isProd = !isDev

module.exports = {
  baseDir,
  distDir,
  isDev,
  isProd,

  baseConfig: {
    cache: true,
    context: srcRootDir,

    output: {
      path: `${distDir}/package`,
      filename: '[name].js',
    },

    module: {
      rules: [
        // SOURCE MAPS
        {
          test: /\.js$/,
          exclude: /(typelogger|async-file|node_modules)/,
          use: ['source-map-loader'],
          enforce: 'pre',
        },

        // CSS / SCSS
        {
          test: /\.(scss|css)$/,
          use: [
            'style-loader',
            'css-loader',
            {
              loader: 'sass-loader',
              options: {},
            },
          ],
        },

        // YAML
        {
          test: /\.(yaml|yml)$/,
          use: ['json-loader', 'yaml-loader'],
        },

        // TYPESCRIPT
        {
          test: /\.tsx?$/,
          // exclude: [/node_modules(?!\/(animation-loop|lowclass))/],
          exclude: [/node_modules/],
          loader: 'ts-loader',
          options: {
            transpileOnly: true,
            //experimentalWatchApi: true,
          },
        },

        // JADE
        {
          test: /\.(jade|pug)$/,
          use: ['pug-loader'],
        },

        // ASSETS
        {
          test: /\.(eot|svg|ttf|woff|woff2|png|jpg|gif|ico|obj)$/,
          exclude: [],
          use: [
            {
              loader: 'url-loader',
              options: {
                // include assets smaller than this inside the bundle as data URLs
                limit: Infinity,
              },
            },
          ],
        },

        {
          test: /\.worker\.(ts|js)$/,
          loader: 'worker-loader',
          options: {inline: true, fallback: false},
        },
      ],
    },

    resolve: {
      modules: [Path.join(baseDir, 'src'), 'node_modules'],
      extensions: ['.ts', '.tsx', '.js', '.jsx'],
    },

    plugins: [
      new DefinePlugin({
        'process.env.WEBPACK': true,
        'process.env.isDev': isDev,
        'process.env.APP_VERSION': JSON.stringify(packageJson.version),
        'process.env.APP_NAME': JSON.stringify(packageJson.appName),
        'process.env.APP_DESCRIPTION': JSON.stringify(packageJson.description),
        'process.env.PUSHER_APP_ID': JSON.stringify(isProd ? '587311' : '587309'),
        'process.env.PUSHER_KEY': JSON.stringify(isProd ? 'fe244062872f627c5516' : 'c70b52329c6a6e733524'),
        'process.env.PUSHER_CLUSTER': JSON.stringify('mt1'),

        // This is needed because annotated-scene's web worker imports xmldom,
        // which trie to use `window.DOMParser`, but `window` is not defined
        // inside of web workers, so annotated-scene imports DOMParser from
        // xmldom and assigns it onto the global inside the web worker, and this
        // particular line of Webpack config replaces calls to
        // `window.DOMParser` with `DOMParser` which will cause the worker code
        // to load the DOMParser patched onto the web worker global.
        'window.DOMParser': 'DOMParser',
      }),
    ].concat(
      isProd
        ? []
        : [
            // with the current size of project, its faster without this plugin.
            new ForkTsCheckerWebpackPlugin({
              tsconfig: Path.resolve(baseDir, 'tsconfig.json'),
            }),
          ]
    ),

    /**
     * Node Shims
     */
    node: {
      __dirname: false,
      __filename: true,
      global: true,
      process: true,
      console: true,
    },

    devServer: {
      contentBase: Path.join(baseDir, 'dist'),
      host: '0.0.0.0',
      port: 5000,
      hot: true,
    },

    devtool: isDev ? 'source-map' : 'source-map',

    stats: {
      assets: false, // shows all output assets
    },

    optimization: {
      minimize: isDev ? false : true,
    },
  },
}
