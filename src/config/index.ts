// Copyright 2017 Mapper Inc.
// CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.

import * as nconf from 'nconf'
import * as yaml from 'nconf-yaml'
import * as path from 'path'
import * as fs from 'fs'
import * as Electron from 'electron'
import createPromise from '@/util/createPromise'

export default nconf

// see https://github.com/jprichardson/is-electron-renderer
function detectRenderer() {

	// running in a web browser
	if (typeof process === 'undefined') return true

	// node-integration is disabled
	if (!process) return true

	// We're in node.js somehow
	if (!process.type) return false

	return process.type === 'renderer'

}

const isRenderer = detectRenderer()
const isMain = !isRenderer

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

interface IMeta {
	APP_PATH: string
	IN_SAFFRON: boolean
}

// tslint:disable-next-line:no-any
const { promise: metaPromise, resolve: resolveMeta, reject: rejectMeta } = createPromise<IMeta, Error>()

export async function getMeta() {
	return metaPromise
}

async function connect() {

	if ( isMain ) {

		resolveMeta( {
			APP_PATH: process.cwd(),
			IN_SAFFRON: false,
		} )

		const { APP_PATH, IN_SAFFRON } = await getMeta()

		Electron.ipcMain.on('connect', (event) => {

			event.sender.send('connect', { APP_PATH, IN_SAFFRON })

		})

	}

	else if ( isRenderer ) {

		// otherwise we're in Saffron and in a renderer process

		Electron.ipcRenderer.once('connect', (event, { APP_PATH, IN_SAFFRON }) => {

			resolveMeta( { APP_PATH, IN_SAFFRON } )

			// pointless return to silence unused-parameter TypeScript error
			return event

		})

		// we're either running in a <webview> in Saffron (so sendToHost() connects
		// to the parent document where the <webview> is located), or we're running
		// standlone outside of Saffron (so send() connects to main)
		Electron.ipcRenderer.sendToHost('connect')
		Electron.ipcRenderer.send('connect')

		setTimeout( () => {

			rejectMeta( new Error('Unable to connect') )

		}, 5000 )

	}

}

connect()

const { promise: configPromise, resolve: resolveConfig } = createPromise()

export function configReady() {
	return configPromise
}

async function setupConfig() {

	const { APP_PATH } = await getMeta()

	const dirName = path.join( APP_PATH, 'src', 'config' )
	const envFile = path.join(dirName, deployEnv + '.yaml')

	if (!fs.existsSync(envFile)) {
		throw new Error(`Bad environment variable MAPPER_ENV=${deployEnv}. Missing required config file ${envFile}.`)
	}

	const required = [
		'tile_manager.utm_tile_scale',
		'tile_manager.super_tile_scale',
		'output.annotations.json.path',
		'output.annotations.kml.path',
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
