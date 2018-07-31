// http://eslint.org/docs/user-guide/configuring

module.exports = {
	root: true,
	// parser: 'babel-eslint',
	parser: 'typescript-eslint-parser',
	parserOptions: {
		sourceType: 'module',
	},
	env: {
		browser: true,
		node: true,
		es6: true,
	},
	// https://github.com/feross/standard/blob/master/RULES.md#javascript-standard-style
	extends: [
		'plugin:vue/base',
		'standard',
	],
	// required to lint *.vue files
	plugins: [
		'html',
		'vue',
		'json',
	],
	// add your custom rules here
	'rules': {
		// allow paren-less arrow functions
		'arrow-parens': 0,
		// allow async-await
		'generator-star-spacing': 0,
		// allow debugger during development
		'no-debugger': process.env.NODE_ENV === 'production' ? 2 : 0,

		'no-tabs': 0,
		'indent': [ 'error', 'tab', { SwitchCase: 1 } ],
		'prefer-const': 'error',
		'one-var': [ 'error', 'never' ],
		'space-in-parens': [ 'error', 'never' ],
		'space-before-function-paren': [ 'error', 'never' ],
		'padded-blocks': [ 'error', 'never' ],
		'comma-dangle': [ 'error', 'always-multiline' ],
		'template-curly-spacing': [ 'error', 'never' ],
		'promise/param-names': 0,
		'no-return-assign': [ 'error', 'except-parens' ],
		'object-curly-spacing': [ 'error', 'never' ],
		'array-bracket-spacing': [ 'error', 'never' ],
		'computed-property-spacing': [ 'error', 'never' ],
		'brace-style': [ 'error', 'stroustrup', { allowSingleLine: true } ],
		'padding-line-between-statements': [ 'error',
			{
				blankLine: 'never',
				prev: '*',
				next: [
					'block',
					'multiline-block-like',
					'multiline-expression',
					'class',
					'function',
				],
			},
			{
				blankLine: 'never',
				next: '*',
				prev: [
					'block',
					'multiline-block-like',
					'multiline-expression',
					'class',
					'function',
				],
			},
		],
	},
}
