const Webpack = require('webpack')
const {DefinePlugin} = Webpack
const Path = require('path')
const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin')
const CopyPlugin = require('copy-webpack-plugin')
const _ = require('lodash')
const baseDir = Path.resolve(__dirname, '..', '..')
const srcRootDir = Path.resolve(baseDir, 'src')
const isDev = process.env.NODE_ENV !== 'production'
const isProd = !isDev
const WebpackStatsConfig = {
  colors: true,
  errors: true,
  warnings: true,
  timings: true,
  cached: false,
  errorDetails: true,
  assets: false, //true - shows all output assets
  chunks: false,
  chunkModules: false,
  hash: false,
  reasons: false,
  modules: false,
  chunkOrigins: false,
}

function resolveDirs(...dirs) {
  return dirs.map(dir => {
    return ['c', 'C', '/', '.'].includes(dir.charAt(0)) ? Path.resolve(dir) : Path.join(baseDir, dir)
  })
}

const moduleDirs = resolveDirs('src', 'node_modules')
const distDir = `${baseDir}/dist/`

function makeModuleConfig() {
  return {
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

      // ASSETS / FONTS
      {
        test: /\.(eot|svg|ttf|woff|woff2)\w*/,
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

      // ASSETS / IMAGES & ICONS
      {
        test: /\.(png|jpg|gif|ico)$/,
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
    ],
  }
}

function makeHotEntry(entry, devEntries) {
  if (devEntries) entry.unshift(...devEntries)
  return entry
}

function makeOutputConfig() {
  const outputConfig = {
    path: `${distDir}/package`,
    filename: 'bundle.js',
    // this is important, it means that externals will be imported by the output
    // bundle using `require()` calls (useful in Node or Electron)
    libraryTarget: 'commonjs2',
  }

  return outputConfig
}

function makeResolveConfig() {
  return {
    modules: moduleDirs,
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
  }
}

function getDevTool() {
  const DevTools = {
    development: 'source-map',
    production: 'source-map',
  }

  return DevTools[process.env.NODE_ENV] || DevTools.development
}

const packageJson = require('../../package.json')

const name = 'mapper-annotator'

module.exports = {
  name,
  entry: {
    bundle: _.uniq(makeHotEntry(['./annotator/saffronEntry'])),
  },
  context: srcRootDir,
  stats: WebpackStatsConfig,
  output: makeOutputConfig(),
  module: makeModuleConfig(),
  cache: true,
  recordsPath: `${distDir}/records__${name}`,
  devtool: getDevTool(),
  resolve: makeResolveConfig(),

  plugins: [
    new DefinePlugin({
      'process.env.WEBPACK': true,
      'process.env.isDev': isDev,
      'process.env.APP_VERSION': JSON.stringify(packageJson.version),
      'process.env.APP_NAME': JSON.stringify(packageJson.appName),
      'process.env.APP_DESCRIPTION': JSON.stringify(packageJson.description),
    }),
    new ForkTsCheckerWebpackPlugin({
      tsconfig: Path.resolve(baseDir, 'tsconfig.json'),
    }),
    new CopyPlugin([{from: '**/*', to: 'src/'}, {from: '../tsconfig.json', to: 'src/'}]),
  ].concat(
    isProd
      ? [
          new Webpack.LoaderOptionsPlugin({
            minimize: true,
            debug: false,
          }),
        ]
      : []
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

  // externals are not bundled, the bundle imports these with `require()`
  // calls.
  externals: [
    // supplied by Node
    'electron',
    'source-map-support',
    'require-context',

    // supplied by Saffron
    'react',
    '@mapperai/mapper-saffron-sdk',
  ],

  devServer: {
    contentBase: Path.join(baseDir, 'dist'),
    host: '0.0.0.0',
    port: 5000,
    hot: true,
  },
}
