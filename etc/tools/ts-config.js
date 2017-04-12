const path = require('path')
const fs = require('fs')


const tsConfigBaseFile = () => `${baseDir}/tsconfig.json`

/**
 * Create base TypeScript Configuration
 */
export function makeTsConfigBase() {
	
	const
		// Load the base configuration
		baseConfig = require(`${baseDir}/etc/tsconfig.base.json`),
		
		// Tweaks
		templateConfig = {
			...baseConfig,
			
			// Set absolute baseUrl
			compilerOptions: {
				...baseConfig.compilerOptions,
				baseUrl: './src',//path.resolve(baseDir, 'src'),
				//sourceRoot: path.resolve(baseDir,'src'),
				outDir: './build/js'// path.resolve(baseDir,'etc',baseConfig.outDir || '../build/js')
			},
			
			// Map exclusions to include parents
			exclude: baseConfig.exclude.reduce((excludedPaths, excludePath) =>
				excludedPaths.concat([excludePath])
			, [])
		}
	
	// Write the updated config
	log.info(`Writing base ts config to ${tsConfigBaseFile()}`)
	writeJSONFileSync(tsConfigBaseFile(), templateConfig)
	
}


/**
 * Create project configs for Awesome-TypeScript-Loader
 *
 * @param dest
 * @param extraOpts
 * @returns {*}
 */
export function makeTsConfig(dest,...extraOpts) {
	
	// Load the default configuration
	const baseConfig = readJSONFileSync(tsConfigBaseFile())
	
	// Expand exclusions
	const config = {
		...baseConfig,
		
		exclude: baseConfig.exclude
			.map(excludePath =>
				excludePath.startsWith('../') ? excludePath.substring(3) : excludePath
			)
	}
	
	// Merge additional config options
	const tsConfigJson = _.merge({}, config, ...extraOpts)
	
	// Write the config and return it
	writeJSONFileSync(dest, tsConfigJson)
	
	return dest
}
