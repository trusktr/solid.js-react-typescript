const {baseConfig} = require('./webpack.config.base')
const CopyPlugin = require('copy-webpack-plugin')

module.exports = {
  ...baseConfig,

  entry: {
    'annotator-ui': './annotator/entry',
  },

  output: {
    ...baseConfig.output,

    // libraryTarget of annotator's entry is "umd", so that we can load it as a script tag.
    libraryTarget: 'umd',
  },

  plugins: [
    ...baseConfig.plugins,

    new CopyPlugin([
      // NOTE:
      // "from" paths are relative to the srcRootDir
      // "to" paths are relative to the output destination.

      // Copy the HTML entry point file that launches Annotator UI.
      {from: 'annotator/StandaloneEntry.html', to: './'},
    ]),
  ],
}
