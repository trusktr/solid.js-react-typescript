// const fs = require('fs')
// const makeSrcGlobs = require('./project-srcs')

const tsConfigFile = `${processDir}/tsconfig.json`
const tsBaseConfig = readJSONFileSync(tsConfigFile)
/**
 * Create a TS config for this project
 * using tsconfig.base.json, write it to disk
 * append the latest compiler
 * return
 *
 * @returns {{tsConfig,tsSettings,tsConfig}}
 */
function makeTypeScriptConfig() {
	const tsConfig = _.cloneDeep(tsBaseConfig)

	//tsConfig.filesGlob = makeSrcGlobs(null,null,true)

	const tsSettings = Object.assign({},tsConfig.compileOptions,{
		typescript: tsc
	})

	return {
		tsConfig,
		tsSettings,
		tsConfigFile
	}
}


module.exports = makeTypeScriptConfig