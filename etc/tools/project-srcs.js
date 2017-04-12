
module.exports = function() {
	return [
		`${processDir}/node_modules/@types/**/*.d.ts`,
		`${processDir}/typings/**/*.d.ts`,
		`${processDir}/src/**/*.ts`
	]
}