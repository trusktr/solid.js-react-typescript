module.exports = {
	root: true,
	extends: ['prettier'],
	parser: 'babel-eslint',
	parserOptions: {
		sourceType: 'module',
	},

	// TODO restore non-prettier stuff that we may still want.
	//
	// env: {
	// 	browser: true,
	// 	node: true,
	// 	es6: true,
	// },
	// // https://github.com/feross/standard/blob/master/RULES.md#javascript-standard-style
	// extends: [
	// 	// 'plugin:vue/base',
	// 	'standard',
	// ],
	// // required to lint *.vue files
	// plugins: [
	// 	// 'html',
	// 	// 'vue',
	// 	'json', // TODO JOE not working, doesn't seem to do anything with JSON files
	// ],
	// // add your custom rules here
	// rules: {
	//
	// 	// disable this rule because it causes an error with our code.
	// 	'no-useless-constructor': 0,
	//
	// 	// allow paren-less arrow functions
	// 	'arrow-parens': 0,
	// 	// allow async-await
	// 	'generator-star-spacing': 0,
	// 	// allow debugger during development
	// 	'no-debugger': process.env.NODE_ENV === 'production' ? 2 : 0,
	//
	// 	semi: [ 'error', 'never' ],
	// 	'no-tabs': 0,
	// 	indent: ['error', 'tab', {SwitchCase: 1}],
	// 	'prefer-const': 'error',
	// 	'one-var': ['error', 'never'],
	// 	'no-var': 'error',
	// 	'space-in-parens': ['error', 'never'],
	// 	'space-before-function-paren': ['error', 'never'],
	// 	'padded-blocks': ['error', 'never'],
	// 	'comma-dangle': ['error', 'always-multiline'],
	// 	'template-curly-spacing': ['error', 'never'],
	// 	'promise/param-names': 0,
	// 	'no-return-assign': ['error', 'except-parens'],
	// 	'object-curly-spacing': ['error', 'never'],
	// 	'array-bracket-spacing': ['error', 'never'],
	// 	'computed-property-spacing': ['error', 'never'],
	// 	'brace-style': ['error', '1tbs', {allowSingleLine: false}],
	// 	'quote-props': ['error', 'as-needed'],
	// 	curly: ['error', 'multi-or-nest', 'consistent'],
	//
	// 	'padding-line-between-statements': ['error',
	//
	// 		{
	// 			blankLine: 'always',
	// 			prev: '*',
	// 			next: [
	// 				'block',
	// 				'const',
	// 				'let',
	// 				'var',
	// 				'import',
	// 				'export',
	// 			],
	// 		},
	// 		{
	// 			blankLine: 'always',
	// 			next: '*',
	// 			prev: [
	// 				'block',
	// 				'const',
	// 				'let',
	// 				'var',
	// 				'import',
	// 				'export',
	// 			],
	// 		},
	//
	// 		{blankLine: 'never', prev: 'const', next: 'const'},
	// 		{blankLine: 'never', prev: 'let', next: 'let'},
	// 		{blankLine: 'never', prev: 'var', next: 'var'},
	// 		{blankLine: 'never', prev: 'import', next: 'import'},
	// 		{blankLine: 'never', prev: 'export', next: 'export'},
	//
	// 		{
	// 			blankLine: 'always',
	// 			prev: '*',
	// 			next: [
	// 				'multiline-block-like',
	// 				'multiline-expression',
	// 				'class',
	// 				'function',
	// 			],
	// 		},
	// 		{
	// 			blankLine: 'always',
	// 			next: '*',
	// 			prev: [
	// 				'multiline-block-like',
	// 				'multiline-expression',
	// 				'class',
	// 				'function',
	// 			],
	// 		},
	// 	],
	// },

	overrides: [
		{
			files: ['*.ts', '*.tsx'],
			parser: 'typescript-eslint-parser',
			parserOptions: {
				ecmaFeatures: {
					jsx: true,
				},
			},

			// TODO restore non-prettier stuff that we may still want.
			//
			// plugins: ['typescript'],
			// rules: {
			// 	// these are off because TypeScript handles these, and ESLint otherwise gets false positives on these.
			// 	// See: https://github.com/eslint/typescript-eslint-parser/issues/208
			// 	'no-undef': 0,
			// 	'no-unused-vars': 0,
			//
			// 	// typescript-specific rules
			// 	'typescript/adjacent-overload-signatures': 'error', // — Require that member overloads be consecutive
			// 	'typescript/class-name-casing': 'error', // — Require PascalCased class and interface names (class-name from TSLint)
			// 	'typescript/explicit-function-return-type': [
			// 		'error',
			// 		{
			// 			allowExpressions: true,
			// 		},
			// 	], // — Require explicit return types on functions and class methods
			// 	// 'typescript/explicit-member-accessibility': , // — Require explicit accessibility modifiers on class properties and methods (member-access from TSLint)
			// 	// 'typescript/interface-name-prefix': , // — Require that interface names be prefixed with I (interface-name from TSLint)
			// 	'typescript/member-delimiter-style': [
			// 		'off',
			// 		{
			// 			// — Require a specific member delimiter style for interfaces and type literals
			// 			delimiter: 'none',
			// 			requireLast: true,
			// 			ignoreSingleLine: true,
			// 		},
			// 	],
			// 	// 'typescript/member-naming': , // — Enforces naming conventions for class members by visibility.
			// 	// 'typescript/member-ordering': , // — Require a consistent member declaration order (member-ordering from TSLint)
			// 	'typescript/no-angle-bracket-type-assertion': 'error', // — Enforces the use of as Type assertions instead of <Type> assertions (no-angle-bracket-type-assertion from TSLint)
			// 	'typescript/no-array-constructor': 'error', // — Disallow generic Array constructors
			// 	// 'typescript/no-empty-interface': , // — Disallow the declaration of empty interfaces (no-empty-interface from TSLint)
			// 	'typescript/no-explicit-any': 'error', // — Disallow usage of the any type (no-any from TSLint)
			// 	'typescript/no-inferrable-types': 'error', // — Disallows explicit type declarations for variables or parameters initialized to a number, string, or boolean. (no-inferrable-types from TSLint)
			// 	'typescript/no-namespace': 'error', // — Disallow the use of custom TypeScript modules and namespaces
			// 	// 'typescript/no-non-null-assertion': , // — Disallows non-null assertions using the ! postfix operator (no-non-null-assertion from TSLint)
			// 	// 'typescript/no-parameter-properties': , // — Disallow the use of parameter properties in class constructors. (no-parameter-properties from TSLint)
			// 	'typescript/no-triple-slash-reference': 'error', // — Disallow /// <reference path="" /> comments (no-reference from TSLint)
			// 	// 'typescript/no-type-alias': , // — Disallow the use of type aliases (interface-over-type-literal from TSLint)
			// 	'typescript/no-unused-vars': 'error', // — Prevent TypeScript-specific constructs from being erroneously flagged as unused
			// 	// 'typescript/no-use-before-define': , // — Disallow the use of variables before they are defined
			// 	'typescript/no-var-requires': 'error', // — Disallows the use of require statements except in import statements (no-var-requires from TSLint)
			// 	// 'typescript/prefer-namespace-keyword': , // — Require the use of the namespace keyword instead of the module keyword to declare custom TypeScript modules. (no-internal-module from TSLint)
			// 	'typescript/type-annotation-spacing': ['error', {}], // — Require consistent spacing around type annotations
			// },
		},
	],
}
