const {baseConfig} = require('./webpack.config.base')

module.exports = {
  ...baseConfig,

  entry: {
    saffron: './annotator/saffronEntry',
  },

  output: {
    ...baseConfig.output,

    // libraryTarget of the Saffron entry is "commonjs", so that Saffron can import it with require().
    // libraryTarget "commonjs2" also means that externals will be imported by the output
    // bundle using `require()` calls (useful in Node or Electron)
    libraryTarget: 'commonjs2',
  },

  // externals are not bundled, the bundle imports these with `require()`
  // calls.
  externals: [
    // supplied by Node
    'electron',
    'fs',
    'path',
    'url',
    'http',

    // supplied by Saffron
    'react',
    '@mapperai/mapper-saffron-sdk',
  ],
}
