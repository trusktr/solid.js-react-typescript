require('shelljs/global')
const fs = require('fs')

export function readJSONFileSync(filename) {
	return JSON.parse(fs.readFileSync(filename,'utf-8'))
}

export function deleteFileSync(filename) {
	rm('-f',filename)
}

export function deleteDirSync(filename) {
	rm('-Rf',filename)
}

export function writeJSONFileSync(filename,json) {
	deleteFileSync(filename)
	fs.writeFileSync(filename,JSON.stringify(json,null,4),{flag: 'w'})
}

