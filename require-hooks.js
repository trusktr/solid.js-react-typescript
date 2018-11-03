/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

const path = require('path')
const Module = require('module')
const url = require('url')
const fs = require('fs')

// creates import aliases, f.e. import config from '@src/config'
require('module-alias').addAliases({
	'@src': path.resolve(__dirname, 'src'),
	'annotator-config': path.resolve(__dirname, 'src', 'annotator-config'),
})

// ability to require/import TypeScript files
require('ts-node').register({
	typeCheck: false,
	transpileOnly: true,
	files: true,

	// manually supply our own compilerOptions, otherwise if we run this file
	// from another project's location (f.e. from Saffron) then ts-node will use
	// the compilerOptions from that other location, which may not work.
	compilerOptions: require('./tsconfig.json').compilerOptions,
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

function requireContext(directory, recursive, regExp) {
	const dir = require('node-dir')
	const path = require('path')

	// Assume absolute path by default
	let basepath = directory

	if (!directory) return null

	if (directory[0] === '.') {
		// Relative path
		basepath = path.join(__dirname, directory)
	} else if (!path.isAbsolute(directory)) {
		// Module path
		basepath = require.resolve(directory)
	}

	const keys = dir
		.files(basepath, {
			sync: true,
			recursive: recursive || false,
		})
		.filter(function(file) {
			return file.match(regExp || /\.(json|js)$/)
		})
		.map(function(file) {
			return path.join('.', file.slice(basepath.length + 1))
		})

	const context = function(key) {
		return require(context.resolve(key))
	}

	context.resolve = function(key) {
		return path.join(directory, key)
	}

	context.keys = function() {
		return keys
	}

	return context
}

Module.prototype.require = function(moduleIdentifier) {
	if (['.yaml', '.yml'].some(ext => moduleIdentifier.endsWith(ext))) {
		const o = require('js-yaml').safeLoad(
			fs.readFileSync(
				path.resolve(path.dirname(this.filename + ''), moduleIdentifier + ''),
				'utf8',
			),
		)

		return Object.assign({}, o, {
			default: o,
		})
	} else if (
		moduleIdentifier.endsWith('.obj') ||
		moduleIdentifier.endsWith('.png')
		// ...add more as needed...
	) {
		return {
			// Return an object with a default property so we can do `import objFile from './path/to/file.obj'` in ES6 modules (or TypeScript)
			default: toFileURL(
				path.resolve(path.dirname(this.filename), moduleIdentifier),
			),
		}
	} else {
		// return oldRequire.call(this, moduleIdentifier)
		try {
			return oldRequire.call(this, moduleIdentifier)
		} catch (err) {
			console.log('Default require failed', err)
		}
	}
}

Module.prototype.require.context = requireContext
process.mainModule.require.context = requireContext
oldRequire.context = requireContext
require.context = requireContext
