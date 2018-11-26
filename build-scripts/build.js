#!/usr/bin/env node

// Builds the annotator from the command line.
// MUST be run from the base directory (NOT from build-scripts)
// Exit if there is an error

require('shelljs/global')

function run(cmd) {
	const result = exec(cmd)
	if (result.code !== 0)
		throw Error(`Failed to exec: ${cmd}\n${result.stdout}\n${result.stderr}`)
}

//run("npm run lib:build")

rm('-Rf', 'dist/*.zip')
rm('-Rf', 'dist/container')
mkdir('-p', 'dist/container/dist')
cp('saffron.js', 'dist/container')
cp('package.json', 'dist/container')
cp('-R', 'dist/package', 'dist/container/dist')
cd('dist/container')

const pkg = JSON.parse(require('fs').readFileSync('package.json', 'utf-8')),
	{ version } = pkg,
	pkgFilename = require('path').resolve(
		__dirname,
		'..',
		'dist',
		`mapper-annotator-${version}.zip`,
	)

run('npm install --production')

rm('-Rf', 'node_modules/@mapperai/mapper-annotated-scene')
rm('-Rf', 'node_modules/electron')
cp(
	'-R',
	'../../node_modules/@mapperai/mapper-annotated-scene',
	'node_modules/@mapperai/',
)

console.log(`Packaging: ${pkgFilename}`)
run(`zip -r ${pkgFilename} .`)
