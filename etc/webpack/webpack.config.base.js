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
          exclude: /node_modules/,
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
          oneOf: [
            // for files using Solid.js
            {
              /**
               * @param {string} value
               */
              test: value => {
                if (value.match(/\.solid\.tsx?$/)) console.log(' ------------- found solid file:', value)
                return !!value.match(/\.solid\.tsx?$/)
              },
              loader: require.resolve('babel-loader'),
              options: {
                babelrc: false,
                configFile: false,
                presets: ['@babel/preset-env', 'solid', '@babel/preset-typescript'],
                plugins: ['@babel/proposal-class-properties'],
                cacheDirectory: true,
                cacheCompression: !isDev,
                compact: !isDev,
              },
            },
            // for files using React
            {
              loader: 'ts-loader',
              options: {
                transpileOnly: true,
                experimentalWatchApi: true,
              },
            },
          ],
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

    plugins: [].concat(
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
