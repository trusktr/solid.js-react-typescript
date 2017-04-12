//require('source-map-support').install()
require('babel-polyfill')
require('reflect-metadata')

global.__NO_WEBPACK__ = false //!!require('electron').remote.getGlobal('__NO_WEBPACK__')
//if (global.__NO_WEBPACK__)
//	require("./bin/epictask-polyfill-webpack")

window.startLoadTime = Date.now()

console.log(`Loading BrowserEntry`)

const
	isDev = "#{htmlWebpackPlugin.options.isDev}" === 'true',
	$ = require('jquery'),
	_ = require('lodash')

function logBenchmark(name) {
	if (isDev)
		console.log(`Time to ${name} is ${(Date.now() - window.startLoadTime) / 1000}s`)
}

function loadApp() {
	const loadPkg = function(pkgName) {
		console.info(`Loading pkg ${pkgName}`)
		pkgName = `./${pkgName}.js`
		
		try {
			require(pkgName)
		} catch (err) {
			console.error(`Failed to load pkg`,err)
		}
	}
	console.info(`Choosing pkg for "${process.env.EPIC_ENTRY}"`)
	switch (process.env.EPIC_ENTRY) {
		case "DatabaseServer":
			loadPkg("epic-entry-database-server")
			break
		case "JobServer":
			loadPkg("epic-entry-job-server")
			break
		default:
			loadPkg("epic-entry-ui")
			break
	}
}

/**
 * Update the root size
 */
function updateRootSize() {
	const
		{innerWidth:width, innerHeight:height} = window
	
	$('#root').css({
		width,
		minWidth: width,
		maxWidth: width,
		height,
		minHeight: height,
		maxHeight: height
	})
}

// EXPOSE LOAD APP GLOBALLY
window.loadApp = loadApp


window.startEpic = function () {
	
	
	updateRootSize()
	window.addEventListener('resize', updateRootSize)
	
	let
		hash = window.location.hash
	
	function parseParams() {
		let
			paramStr = hash.substr(1)
		
		if (paramStr.indexOf('?') > -1) {
			paramStr = paramStr.substr(paramStr.indexOf('?') + 1)
		}
		
		let
			pairs = paramStr
				.split('&')
		
		return pairs.reduce(function (map, nextPair) {
			const
				parts = nextPair.split('=')
			
			if (parts.length === 2)
				map[parts[0]] = parts[1]
			return map
		}, {})
	}
	
	//noinspection NpmUsedModulesInstalled
	let
		electron = require('electron'),
		params = parseParams(),
		log = console,
		loaded = false,
		processType = params.EPIC_ENTRY || 'UI',
		isChildWindow = processType === 'UIChildWindow'
	
	log.info(`Process type = ${processType}`,params)
	
	_.assign(process.env, {
		EPIC_ENTRY: processType
	})
	
	_.assign(global, {
		_,
		$: window.$ || require('jquery'),
		
		getLogger: function (loggerName) {
			return console
		}
	})
	//logBenchmark('After globals')
	
	try {
		_.assign(global,{
			React: require('react'),
			ReactDOM: require('react-dom'),
			Radium: require('radium')
		})
		require('react-tap-event-plugin')()
	} catch (err) {
		log.info('Failed to inject tap event handler = HMR??')
	}
	
	// if (isDev && !isChildWindow) {
	// 	try {
	// 		//__non_webpack_require__('devtron').install()
	// 	} catch (err) {
	// 		log.info(`Dev tron is prob already loaded`)
	// 	}
	// }
	
	
	function loadUI() {
		
		// CHILD WINDOW - LOAD IMMEDIATE
		logBenchmark('Loading app')
		loadApp()
		logBenchmark('Loaded app')
		
	}
	
	// IN DEV MODE - install debug menu
	// if (isDev) {
	// 	require('debug-menu').install()
	// }
	log.info(`Going to load`)
	logBenchmark('To load')
	if (processType === 'UI' || processType === 'UIChildWindow') {
		loadUI()
	} else {
		loadApp()
	}
}