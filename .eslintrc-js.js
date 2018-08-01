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

		// disable this rule because it causes an error with our code.
		'no-useless-constructor': 0,

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
		'no-var': 'error',
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
		'brace-style': [ 'error', '1tbs', { allowSingleLine: false } ],
		'quote-props': [ 'error', 'as-needed' ],
		'curly': [ 'error', 'multi-or-nest', 'consistent' ],

		// ????????????????
		// 'no-mixed-operators': 0,
		// 'no-return-assign': 0,

		'padding-line-between-statements': [ 'error',

			{
				blankLine: 'always',
				prev: '*',
				next: [
					'block',
					'const',
					'let',
					'var',
					'import',
					'export',
				],
			},
			{
				blankLine: 'always',
				next: '*',
				prev: [
					'block',
					'const',
					'let',
					'var',
					'import',
					'export',
				],
			},

			{ blankLine: 'never', prev: 'const', next: 'const' },
			{ blankLine: 'never', prev: 'let', next: 'let' },
			{ blankLine: 'never', prev: 'var', next: 'var' },
			{ blankLine: 'never', prev: 'import', next: 'import' },
			{ blankLine: 'never', prev: 'export', next: 'export' },

			{
				blankLine: 'always',
				prev: '*',
				next: [
					'multiline-block-like',
					'multiline-expression',
					'class',
					'function',
				],
			},
			{
				blankLine: 'always',
				next: '*',
				prev: [
					'multiline-block-like',
					'multiline-expression',
					'class',
					'function',
				],
			},
		],
	},
}
