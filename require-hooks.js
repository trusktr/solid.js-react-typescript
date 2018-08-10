/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

const path = require('path')
const Module = require('module')
const url = require('url')

// creates import aliases, f.e. import config from '@src/config'
require('module-alias').addAliases({
	'@src': path.resolve(__dirname, 'src'),
})

// ability to require/import TypeScript files
require('ts-node').register({
	typeCheck: false,
	transpileOnly: true,
	files: true,
	ignore: [
		// ignore all node_modules except @mapperai/annotated-scene
		/node_modules(?!\/@mapperai\/annotated-scene)/,
	],
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

Module.prototype.require = function(moduleIdentifier) {
	if (
		moduleIdentifier.endsWith('.obj') ||
		moduleIdentifier.endsWith('.png')
		// ...add more as needed...
	) {
		return {
			// Return an object with a default property so we can do `import objFile from './path/to/file.obj'` in ES6 modules (or TypeScript)
			default: toFileURL(path.resolve(path.dirname(this.filename), moduleIdentifier)),
		}
	} else {
		return oldRequire.call(this, moduleIdentifier)
	}
}
