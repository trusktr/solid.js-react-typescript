/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */
const path = require('path')

// ability to require/import TypeScript files
require('ts-node').register({
  typeCheck: false,
  transpileOnly: true,
  files: true,
  project: path.resolve(__dirname, '../../../tsconfig.json'.replace('/', path.sep)),

  // manually supply our own compilerOptions, otherwise if we run this file
  // from another project's location (f.e. from Saffron) then ts-node will use
  // the compilerOptions from that other location, which may not work.
  compilerOptions: {
    // so that it runs in Node.js (ES Modules aren't released in Node.js yet at time of
    // writing)
    module: 'commonjs',
  },
})

module.exports = require('./MainEntry')
