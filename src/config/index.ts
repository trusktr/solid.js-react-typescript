// Copyright 2017 Mapper Inc.
// CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.

import * as nconf from 'nconf'
import * as yaml from 'nconf-yaml'
import * as path from 'path'
import * as fs from 'fs'
import createPromise from '../util/createPromise'

const config = {}

export default config

const envInput = (process.env.NODE_ENV || '').toLowerCase()

let deployEnv

if (envInput === 'prod' || envInput === 'production')
	deployEnv = 'prod'
else if (envInput === 'dev' || envInput === 'development' || envInput === '')
	deployEnv = 'dev'
else if (envInput === 'test')
	deployEnv = 'test'
else
	throw new Error('Unknown environment name: NODE_ENV=' + envInput)

const {promise: configPromise, resolve: resolveConfig} = createPromise()

// eslint-disable-next-line typescript/no-explicit-any
export function configReady(): any {
	return configPromise
}

async function setupConfig(): Promise<void> {
	const envFile = path.resolve(__dirname, deployEnv + '.yaml')

	if (!fs.existsSync(envFile))
		throw new Error(`Bad environment variable NODE_ENV=${deployEnv}. Missing required config file ${envFile}.`)

	const required = [
		'tile_manager.utm_tile_scale',
		'tile_manager.super_tile_scale',
		'output.annotations.json.path',
		'output.annotations.kml.path',
	]
	const localFile = path.resolve(__dirname, 'local.yaml')

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
		if (!nconf.get(key))
			throw new Error(`missing required configuration key: ${key}`)
	})

	Object.assign(config, nconf.get())

	resolveConfig(config)
}

setupConfig()
