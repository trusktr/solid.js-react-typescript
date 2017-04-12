const
	fs = require('fs'),
	{execSync} = require('child_process')

//execSync('npm init -f')
//execSync('npm i babel-polyfill shelljs')
//require('shelljs/global')

/**
 * Exec cmd
 *
 * @param cmd
 * @param onError
 */
function execNoError(cmd,onError = null) {
	const
		result = exec(cmd)
	
	if (result.code !== 0) {
		if (!onError || onError(result) !== false) {
			process.exit(result.code)
		}
	}
	
	return result
}


execNoError('npm i')
execNoError('npm run package')