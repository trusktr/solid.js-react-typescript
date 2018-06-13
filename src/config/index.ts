// Copyright 2017 Mapper Inc.
// CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.

import * as nconf from 'nconf'
import * as yaml from 'nconf-yaml'
import * as path from 'path'
import * as fs from 'fs'
import * as Electron from 'electron'
import createPromise from '@/util/createPromise'

export default nconf

const envInput = (process.env.MAPPER_ENV || '').toLowerCase()
let deployEnv
if (envInput === 'prod' || envInput === 'production') {
	deployEnv = 'prod'
} else if (envInput === 'dev' || envInput === 'development' || envInput === '') {
	deployEnv = 'dev'
} else if (envInput === 'test') {
	deployEnv = 'test'
} else {
	throw new Error('Unknown environment name: MAPPER_ENV=' + envInput)
}

// tslint:disable-next-line:no-any
const { promise: appPathPromise, resolve: resolveAppPath, reject: rejectAppPath } = createPromise<string, Error>()

export async function getAppPath() {
	return appPathPromise
}

function connect() {

	if ( !__SAFFRON__ ) {

		const APP_PATH = process.cwd()
		resolveAppPath( APP_PATH )

	}
	else {

		let connected = false

		Electron.ipcRenderer.on('connect', (event, msg) => {

			if (connected) return
			resolveAppPath( msg.APP_PATH )

			// pointless return to silence unused-parameter TypeScript error
			return event

		})

		// we're either running in a <webview> (in Saffron) or as a new BrowserWindow
		// (outside of Saffron), so we send a 'connect' message to both destinations.
		Electron.ipcRenderer.sendToHost('connect')
		Electron.ipcRenderer.send('connect')

		setTimeout( () => {

			rejectAppPath( new Error('Unable to connect') )

		}, 5000 )

	}

}

connect()

const { promise: configPromise, resolve: resolveConfig } = createPromise()

export function configReady() {
	return configPromise
}

async function setupConfig() {

	const APP_PATH = await getAppPath()

	const dirName = path.join( APP_PATH, 'src', 'config' )
	const envFile = path.join(dirName, deployEnv + '.yaml')

	if (!fs.existsSync(envFile)) {
		throw new Error(`Bad environment variable MAPPER_ENV=${deployEnv}. Missing required config file ${envFile}.`)
	}

	const required = [
		'tile_manager.tile_message_format',
		'tile_manager.utm_tile_scale',
		'tile_manager.super_tile_scale',
		'output.annotations.json.path',
		'output.annotations.kml.path',
		'output.trajectory.csv.path',
	]

	const localFile = path.join(dirName, 'local.yaml')

	nconf
		// command-line arguments
		.argv()
		// environment variables
		.env(required)
		// config files
		.file('local_config', {file: localFile, format: yaml})
		.file('shared_config', {file: envFile, format: yaml})
		.defaults({})

	required.forEach((key) => {

		if (!nconf.get(key)) {
			throw new Error(`missing required configuration key: ${key}`)
		}

	})

	resolveConfig( nconf )

}

setupConfig()
