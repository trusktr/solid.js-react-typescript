const {baseConfig} = require('./webpack.config.base')
const CopyPlugin = require('copy-webpack-plugin')

module.exports = {
  ...baseConfig,

  entry: {
    app: './entry',
  },

  output: {
    ...baseConfig.output,

    // output as a UMD module so that we can load it as a <script> tag.
    libraryTarget: 'umd',
  },

  plugins: [
    ...baseConfig.plugins,

    new CopyPlugin([
      // NOTE:
      // "from" paths are relative to the srcRootDir
      // "to" paths are relative to the output destination.

      // Copy the HTML entry point file that launches Annotator UI.
      {from: 'index.html', to: './'},
    ]),
  ],
}
