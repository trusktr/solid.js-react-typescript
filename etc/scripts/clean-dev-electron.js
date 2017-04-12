#!/usr/bin/env node
require('./init-scripts')

const
	path = require('path'),
	{process} = global,
	electronRoot =
		
		// MAC
		isMac ? path.resolve(process.env.HOME,'Library','Application Support','Electron') :
			
			// LINUX
			isLinux ? path.resolve(process.env.HOME,'.config','Electron') :
				
				// WINDOWS
				path.resolve(process.env.HOME,'AppData','Roaming','Electron')

echo(`Cleaning ${electronRoot}`)
cd(electronRoot)
rm(
	'-rf',
	'Cookies*',
	'epictask*',
	path.resolve(electronRoot,'Local Storage') + '/https_github*'

)
