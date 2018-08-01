console.log('ESLint TypeScript config')

module.exports = {
	extends: ['./.eslintrc.js'],
	parser: 'typescript-eslint-parser',
	plugins: [
		'typescript',
	],
	rules: {

		// these are off because TypeScript handles these, and ESLint otherwise gets false positives on these.
		// See: https://github.com/eslint/typescript-eslint-parser/issues/208
		'no-undef': 0,
		'no-unused-vars': 0,

		// typescript-specific rules
		'typescript/adjacent-overload-signatures': 'error', // — Require that member overloads be consecutive
		'typescript/class-name-casing': 'error', // — Require PascalCased class and interface names (class-name from TSLint)
		'typescript/explicit-function-return-type': 'error', // — Require explicit return types on functions and class methods
		// 'typescript/explicit-member-accessibility': , // — Require explicit accessibility modifiers on class properties and methods (member-access from TSLint)
		// 'typescript/interface-name-prefix': , // — Require that interface names be prefixed with I (interface-name from TSLint)
		'typescript/member-delimiter-style': ['error', { // — Require a specific member delimiter style for interfaces and type literals
			delimiter: 'none',
			requireLast: true,
			ignoreSingleLine: true,
		}],
		// 'typescript/member-naming': , // — Enforces naming conventions for class members by visibility.
		// 'typescript/member-ordering': , // — Require a consistent member declaration order (member-ordering from TSLint)
		'typescript/no-angle-bracket-type-assertion': 'error', // — Enforces the use of as Type assertions instead of <Type> assertions (no-angle-bracket-type-assertion from TSLint)
		'typescript/no-array-constructor': 'error', // — Disallow generic Array constructors
		// 'typescript/no-empty-interface': , // — Disallow the declaration of empty interfaces (no-empty-interface from TSLint)
		'typescript/no-explicit-any': 'error', // — Disallow usage of the any type (no-any from TSLint)
		'typescript/no-inferrable-types': 'error', // — Disallows explicit type declarations for variables or parameters initialized to a number, string, or boolean. (no-inferrable-types from TSLint)
		// 'typescript/no-namespace': 'error', // — Disallow the use of custom TypeScript modules and namespaces
		// 'typescript/no-non-null-assertion': , // — Disallows non-null assertions using the ! postfix operator (no-non-null-assertion from TSLint)
		// 'typescript/no-parameter-properties': , // — Disallow the use of parameter properties in class constructors. (no-parameter-properties from TSLint)
		'typescript/no-triple-slash-reference': 'error', // — Disallow /// <reference path="" /> comments (no-reference from TSLint)
		// 'typescript/no-type-alias': , // — Disallow the use of type aliases (interface-over-type-literal from TSLint)
		'typescript/no-unused-vars': 'error', // — Prevent TypeScript-specific constructs from being erroneously flagged as unused
		// 'typescript/no-use-before-define': , // — Disallow the use of variables before they are defined
		'typescript/no-var-requires': 'error', // — Disallows the use of require statements except in import statements (no-var-requires from TSLint)
		// 'typescript/prefer-namespace-keyword': , // — Require the use of the namespace keyword instead of the module keyword to declare custom TypeScript modules. (no-internal-module from TSLint)
		'typescript/type-annotation-spacing': ['error', {}], // — Require consistent spacing around type annotations

	},
}
