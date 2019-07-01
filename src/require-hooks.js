/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

// const ts = require('typescript')
const path = require('path')
const Module = require('module')
const url = require('url')
const fs = require('fs')

// require('require-context/register')

// creates import aliases, f.e. import config from '@src/config'
require('module-alias').addAliases({
  '@src': path.resolve(__dirname),
  'annotator-config': path.resolve(__dirname, 'annotator-config'),

  // typescript imports typescript instead of JS in Annotator Standalone mode
  // (annotated-scene's package.json main field points to the .js compiled
  // output which we'll otherwise import without this line)
  '@mapperai/mapper-annotated-scene': (fromPath, moduleIdentifier, alias) => {
    if (moduleIdentifier === alias) return alias + '/src'
    return alias
  },
})

// ability to require/import TypeScript files
require('ts-node').register({
  typeCheck: false,
  transpileOnly: true,
  files: true,
  ignore: [/node_modules\/(?!@mapperai\/mapper-annotated-scene|tinyqueue)/],

  // manually supply our own compilerOptions, otherwise if we run this file
  // from another project's location (f.e. from Saffron) then ts-node will use
  // the compilerOptions from that other location, which may not work.
  compilerOptions: {
    ...require('./tsconfig.json').compilerOptions,
    allowJs: true,
    checkJs: false,
  },
})

// css files straight to document head (assumes that the browser `document` API
// exists)
require('css-modules-require-hook')({
  extensions: ['.css'],

  preprocessCss: function(cssCode, file) {
    addStyleToHead(cssCode)
    return ''
  },
})

function addStyleToHead(cssCode) {
  // defer to an animation frame, to not block import evaluation.
  requestAnimationFrame(() => {
    const style = document.createElement('style')

    style.textContent = cssCode
    document.head.appendChild(style)
  })
}

// Import OBJ and PNGfiles. The import returns a valid URL, which works with
// things like window.Image or THREE.OBJLoader.
//
// In this case it returns a file:// URL, while a Webpack build would return a
// data URL. Either type of URL works in Electron, but we already have access to
// the filesystem so we don't need to bother with making data URLs.
//
// This works with relative paths only, for now.
function toFileURL(filePath) {
  return url.format({
    pathname: filePath,
    protocol: 'file:',
    slashes: true,
  })
}

const oldRequire = Module.prototype.require

// function requireContext(directory, recursive, regExp) {
//   const dir = require('node-dir')
//   const path = require('path')
//
//   // Assume absolute path by default
//   let basepath = directory
//
//   if (!directory) return null
//
//   if (directory[0] === '.') {
//     // Relative path
//     basepath = path.join(__dirname, directory)
//   } else if (!path.isAbsolute(directory)) {
//     // Module path
//     basepath = require.resolve(directory)
//   }
//
//   const keys = dir
//     .files(basepath, {
//       sync: true,
//       recursive: recursive || false,
//     })
//     .filter(function(file) {
//       return file.match(regExp || /\.(json|js)$/)
//     })
//     .map(function(file) {
//       return path.join('.', file.slice(basepath.length + 1))
//     })
//
//   const context = function(key) {
//     return require(context.resolve(key))
//   }
//
//   context.resolve = function(key) {
//     return path.join(directory, key)
//   }
//
//   context.keys = function() {
//     return keys
//   }
//
//   return context
// }

Module.prototype.require = function(moduleIdentifier) {
  if (['.yaml', '.yml'].some(ext => moduleIdentifier.endsWith(ext))) {
    const data = require('js-yaml').safeLoad(
      fs.readFileSync(path.resolve(path.dirname(this.filename + ''), moduleIdentifier), 'utf8')
    )
    const result = Object.assign({}, data)

    result.default = result
    return result
  } else if (['.obj', '.png', '.svg', '.jpg'].some(ext => moduleIdentifier.endsWith(ext))) {
    const result = String(toFileURL(path.resolve(path.dirname(this.filename), moduleIdentifier)))

    result.default = result
    return result
  } else if (moduleIdentifier.endsWith('.worker')) {
    if (typeof window === 'undefined') throw new Error('Workers may only be imported in a renderer process')

    const workerScriptFile = Module._resolveFilename(moduleIdentifier, this, false)
    const ext = path.extname(workerScriptFile)

    if (!(ext === '.ts' || ext === '.js')) throw new Error('expected a TypeScript or JavaScript file')

    // let source = fs.readFileSync(workerScriptFile, 'utf8')

    // if (ext === '.ts') {
    // 	source = ts.transpileModule(source, {
    // 		compilerOptions: { module: ts.ModuleKind.CommonJS },
    // 	}).outputText
    // }

    // assuming we are compiling to CommonJS format, we need these vars because
    // they aren't normally available in workers, so the code will fail
    // otherwise.
    // source = 'var module = {}; var exports = module.exports = {}; ' + source
    // source = 'var exports = {}; ' + source
    // const lines = source.split('\n')
    // const lineToRemove = lines.find(line => line.startsWith('exports'))
    // lines.splice(lines.indexOf(lineToRemove), 1)
    // source = lines.join('\n')

    const source = `
			require('${__filename}') // load require-hooks in the worker
			require('${workerScriptFile}') // run the worker entry point

			// provide a Worker reference (Chrome bug, missing WOrker
			// constructor inside workers, added in v69,
			// https://bugs.chromium.org/p/chromium/issues/detail?id=31666)
			if (typeof global.Worker === 'undefined') {

				// this allows the default export in the worker to work
				// (although the export does nothing, the purpose is solely to
				// trick TypeScript about the type)
				global.Worker = class {
					constructor() {
						throw new Error(\`
							This version of Electron doesn't have sub-workers yet.
							Electron needs a Blink engine update.
							https://bugs.chromium.org/p/chromium/issues/detail?id=31666
						\`)
					}
				}
			}
		`
    const sourceUrl = URL.createObjectURL(new Blob([source], {type: 'text/javascript'}))

    class ModuleWorker {
      constructor() {
        return new Worker(sourceUrl)
      }
    }

    ModuleWorker.default = ModuleWorker
    return ModuleWorker
  } else {
    return oldRequire.call(this, moduleIdentifier)
  }
}

// Module.prototype.require.context = requireContext
// process.mainModule.require.context = requireContext
// oldRequire.context = requireContext
// require.context = requireContext
