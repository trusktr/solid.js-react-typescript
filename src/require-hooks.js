/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

require('@babel/register')({

	// Array of ignore conditions, either a regex or a function. (Optional)
	ignore: [

		// When a file path matches this regex then it is **not** compiled
		// TODO JOE when we make mapper-annotated-scene a library in node_modules, we need to handle it.
		/node_modules/,

		// The file's path is also passed to any ignore functions. It will
		// **not** be compiled if `true` is returned.
		filepath => filepath === '/path/to/some/file.js',

	],

	// Optional only regex - if any filenames **don't** match this regex then they
	// aren't compiled
	// only: /my_es6_folder/,

	// Setting this will remove the currently hooked extensions of `.es6`, `.es`, `.jsx`, `.mjs`
	// and .js so you'll have to add them back if you want them to be used again.
	extensions: ['.ts', '.tsx'],

	// Setting this to false will force rebuild every time.
	cache: true,

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

// sass files (assumes that the browser `document` API exists)
//
// FIXME currently node-sass isn't running in Electron.
//
// const sass = require('node-sass');
//
// require('css-modules-require-hook')({
// 	extensions: ['.scss'],
//
// 	preprocessCss: function (scssCode, file) {
//
// 		const cssCode = sass.renderSync({ file })
// 		addStyleToHead( cssCode )
// 		return ''
//
// 	},
// })

function addStyleToHead(cssCode) {
	// defer to an animation frame, to not block import evaluation.
	requestAnimationFrame(() => {
		const style = document.createElement('style')

		style.textContent = cssCode
		document.head.appendChild(style)
	})
}
