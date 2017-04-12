#!/usr/bin/env babel-node
require('./init-scripts')


// SET PACKAGING ENV VAR
env['EPIC_PACKAGE'] = 'true'

const
	TsConfigNames = {
		Default: 'tsconfig.json',
		Plugin: 'tsconfig.epic-plugin.json'
	}

const
	Path = require('path'),
	Fs = require('fs'),
	_ = require('lodash'),
	Glob = require('glob'),
	pkgDir = Path.resolve(baseDir,'dist','epic-plugin-env'),
	pkgJson = readJsonFile('package.json')
	

// Clean and Prepare Dirs
function clean() {
	rm('-Rf', pkgDir)
}

function prep() {
	mkdir('-p', pkgDir)
}


echo(`Creating epic-plugin-env`)

function createPackageFiles() {
	echo("Creating tsconfig")
	rm(TsConfigNames.Plugin)
	let
		tsConfig = readJsonFile(TsConfigNames.Default,'utf8'),
		pluginTsConfig = Object.assign({},tsConfig,{
			compilerOptions: _.assign({},tsConfig.compilerOptions,{
				
				declaration: true
			})
		})
	
	writeJsonFile(TsConfigNames.Plugin,pluginTsConfig)
	
	
	echo(`Creating package.json for plugin-env`)

	// Copy the pkg config and remove unused props
	let
		pluginPkgJson = _.omit(pkgJson, 'scripts', 'name', 'description', 'build', 'browser', 'packaging', 'directories', 'jest', 'engines', 'devDependencies', 'dependencies')
	
	Object.assign(pluginPkgJson, {
		name: 'epic-plugin-env',
		description: 'Epictask plugin env',
		main: 'epic-plugin-env/PluginEnvEntry.js',
		typings: 'epic-plugin-env/index.d.ts'
	})
	
	writeJsonFile(Path.resolve(pkgDir, 'package.json'), pluginPkgJson)
}



function compileDeclarationFiles() {
	echo('Compiling TypeScript: with custom config for declarations')
	exec(`./node_modules/.bin/tsc --project ${TsConfigNames.Plugin}`)
}


function copyDeclarationFiles() {
	const
		declarationFiles = Glob.sync('**/*.d.ts', {cwd: 'dist/out'})
	
	
	echo('All declaration files')
	declarationFiles.forEach(file => {
		echo(`Copying: ${file}`)
		
		let
			srcFile = Path.resolve('dist', 'out', file),
			srcContent = Fs.readFileSync(srcFile, 'utf8'),
			
			srcFromRegex = /from\s['"](epic[^"']*)['"]/g,
			srcMatch,
			destFile = Path.resolve(pkgDir, file),
			destDir = Path.dirname(destFile)
		
		mkdir('-p', destDir)
		
		
		while ((srcMatch = srcFromRegex.exec(srcContent)) !== null) {
			let
				match = srcMatch[0],
				fromFile = srcMatch[1],
				srcFromFile = Path.resolve('dist', 'out', fromFile),
				isDir = isDirectory(srcFromFile, '.d.ts'),
				destFromFile = Path.resolve(pkgDir, fromFile),
				destRelativeFromFile = isDir ?
					Path.relative(destDir, destFromFile) :
					Path.join(
						Path.relative(destDir, Path.dirname(destFromFile)),
						Path.basename(destFromFile)
					),
				newMatch = match.replace(fromFile, destRelativeFromFile)
			
			
			echo(`Mapped (${fromFile}) to relative ${destRelativeFromFile}`)
			srcContent = srcContent.replace(match, newMatch)
			
		}
		
		Fs.writeFileSync(destFile, srcContent)
	})
}

function copyEntry() {
	echo(`Copying entry`)
	cp('dist/out/epic-plugin-env/PluginEnvEntry.js',Path.resolve(pkgDir,'epic-plugin-env'))
}

/**
 * Check if a file is a directory
 *
 * @param file
 * @param exts
 * @returns {boolean}
 */
function isDirectory(file,...exts) {
	const
		testNames = [file]
	
	exts.forEach(ext => testNames.unshift(file + ext))
	
	for (let testName of testNames) {
		try {
			if (!Fs.existsSync(testName))
				continue
			
			return Fs.statSync(testName).isDirectory()
		} catch (err) {
		}
	}
	
	return false
	
}

//clean()
prep()
createPackageFiles()
compileDeclarationFiles()
copyDeclarationFiles()
copyEntry()