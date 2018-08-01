// ESLint rules for JS only

console.log('ESLint JavaScript config')

module.exports = {
	extends: ['./.eslintrc.js'],
	parser: 'babel-eslint',
	plugins: [
		'json', // TODO JOE not working, doesn't seem to do anything with JSON files
	],
}
