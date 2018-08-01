module.exports = {
	extends: [
		'./.eslintrc-js.js',
	],
	rules: {

		// these are off because TypeScript handles these, and ESLint otherwise gets false positives on these.
		// See: https://github.com/eslint/typescript-eslint-parser/issues/208
		'no-undef': 0,
		'no-unused-vars': 0,

	},
}
