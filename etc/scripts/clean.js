#!/usr/bin/env node
require('./init-scripts')

echo(`Cleaning`)

const
	dirs = process.env.NODE_ENV !== 'production' ? ['dist/app', 'dist/.awcache-dev'] : ['dist/app-package', 'dist/.awcache-prod']

for (let dir of dirs) {
	try {
		rm('-Rf', dir)
	} catch (err) {
		log.warn(`Failed to delete ${dir}`, err)
	}
}

//process.env.HOME + '/Library/Application Support/Electron/epic*'
