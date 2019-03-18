// GET SHELL JS
const Webpack = require('webpack')
const {DefinePlugin, HotModuleReplacementPlugin} = Webpack
const Path = require('path')
const Fs = require('fs')
const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin')
const _ = require('lodash')
const baseDir = Path.resolve(__dirname, '..', '..')
const srcRootDir = Path.resolve(baseDir, 'src')
const pkgJson = JSON.parse(Fs.readFileSync(Path.resolve(baseDir, 'package.json'), 'utf-8'))
const isDev = process.env.NODE_ENV !== 'production'
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

/**
 * Resolves directories and maps to ram disk
 * if available
 *
 * @param dirs
 */
function resolveDirs(...dirs) {
  return dirs.map(dir => {
    return ['c', 'C', '/', '.'].includes(dir.charAt(0)) ? Path.resolve(dir) : Path.join(baseDir, dir)
  })
}

const moduleDirs = resolveDirs('src', 'node_modules')
const distDir = `${baseDir}/dist/`

function tsAlias(tsFilename) {
  return Path.resolve(srcRootDir, tsFilename)
}

/**
 * Make aliases
 *
 * @returns {{styles: *, assets: *}}
 */
function makeAliases() {
  return {
    //"@src/config": tsAlias(srcRootDir,"config/index.ts")
  }
}

/**
 * Create externals array
 */
function makeExternals() {
  return [
    'fs',
    'events',
    'child_process',
    'path',
    'electron',
    'react',
    'react-dom',
    '@mapperai/mapper-annotated-scene',
    '@mapperai/mapper-saffron-sdk',
    'material-ui',
    'material-ui-icons',
    'typelogger',
    'reselect',
    'lodash',
    'react-redux',
    'mapbox-gl',
    'react-mapbox-gl',
    'config',
    'source-map-support',
  ]
  // return {
  // 	'react': 'commonjs react', // this line is just to use the React dependency of the parent Saffron platform
  // 	'react-dom': 'react-dom',
  // 	'@mapperai/mapper-saffron-sdk': '@mapperai/mapper-saffron-sdk', // this will expose the saffron-sdk in the bundled js file which the Saffron Platform will overwrite by hijacking 'require'
  // 	'material-ui': 'material-ui',
  // 	'material-ui-icons': 'material-ui-icons',
  // 	'typelogger': 'typelogger',
  // 	'reselect': 'reselect',
  // 	'react-redux': 'react-redux',
  // 	'lodash': 'lodash',
  // 	'mapbox-gl': 'mapbox-gl',
  // 	'react-mapbox-gl': 'react-mapbox-gl',
  // 	'@types/mapbox-gl': '@types/mapbox-gl',
  //
  // }
}

/**
 * Create module config
 */
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

/**
 * Create react hot entry
 *
 * @param entry
 * @param devEntries
 * @returns {*}
 */
function makeHotEntry(entry, devEntries) {
  // HMR ENTRY ADDITION
  //if (isDev) entry.unshift('react-hot-loader/patch')

  if (devEntries) entry.unshift(...devEntries)

  return entry
}

/**
 * Create the output configuration
 *
 * @returns {{path: string}}
 */
function makeOutputConfig() {
  const outputConfig = {
    path: `${distDir}/package`,
    filename: 'bundle.js',
    libraryTarget: 'commonjs2', // THIS IS THE MOST IMPORTANT LINE!,
    //filename: '[name].[hash].js'
  }

  return outputConfig
}

/**
 * Create resolver config
 *
 * @returns {{alias: {styles: *, assets: *}, modules: *, extensions: string[]}}
 */
function makeResolveConfig() {
  return {
    alias: makeAliases(),
    modules: moduleDirs,
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
  }
}

/**
 * Patch the configuration both
 * for dev/prod and with the passed
 * configuration
 *
 * @param config
 * @returns {*}
 */
function patchConfig(config) {
  // Development specific updates
  if (isDev) {
    _.merge(config, {
      // In development specify absolute path - better debugger support
      output: {
        //devtoolModuleFilenameTemplate: 'file://[absolute-resource-path]',
        // devtoolFallbackModuleFilenameTemplate: "file://[absolute-resource-path]"
      },
    })

    // IF ENTRY & DEV THEN HMR
    //config.plugins.splice(1, 0, new HotModuleReplacementPlugin())
  } else {
    config.plugins.push(
      new Webpack.LoaderOptionsPlugin({
        minimize: true,
        debug: false,
      })
    )
  }

  return config
}

/**
 * Get the correct dev tool
 *
 * @returns {*}
 */
function getDevTool() {
  const DevTools = {
    development: 'source-map',
    production: 'source-map',
  }

  return DevTools[process.env.NODE_ENV] || DevTools.development
}

// Webpack Config
function makeConfig(name, dependencies, entry, configFn) {
  const config = {
    name,
    dependencies,

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
    stats: WebpackStatsConfig,

    /**
     * Output configuration
     */
    output: makeOutputConfig(),

    // LOADERS
    module: makeModuleConfig(),
    cache: true,
    recordsPath: `${distDir}/records__${name}`,

    /**
     * DevTool config
     */
    devtool: getDevTool(),

    // Currently we need to add '.ts' to the resolve.extensions array.
    resolve: makeResolveConfig(),

    /**
     * Plugins
     */
    plugins: [
      new DefinePlugin({
        'process.env.WEBPACK': true,
      }),
      new ForkTsCheckerWebpackPlugin({
        tsconfig: Path.resolve(baseDir, 'tsconfig.json'),
      }),
    ],

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

    /**
     * Externals
     */
    externals: makeExternals(),

    devServer: {
      contentBase: Path.join(baseDir, 'dist'),
      host: '0.0.0.0',
      port: 5000,
      hot: true,
    },
  }

  if (configFn) configFn(config)

  return patchConfig(config)
}

module.exports = makeConfig(
  'mapper-annotator',
  [],
  {
    bundle: _.uniq(makeHotEntry(['./annotator/saffronEntry'])),
  },
  config => {
    _.merge(config, {
      devServer: {},
    })
  }
)
