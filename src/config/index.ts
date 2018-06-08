// Copyright 2017 Mapper Inc.
// CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.

import * as nconf from 'nconf'
import * as yaml from 'nconf-yaml'
import * as path from 'path'
import * as fs from 'fs'

export default nconf

const required = [
	'tile_manager.tile_message_format',
	'tile_manager.utm_tile_scale',
	'tile_manager.super_tile_scale',
	'output.annotations.json.path',
	'output.annotations.kml.path',
	'output.trajectory.csv.path',
]

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
const g = global as any

export const APP_PATH = g.APP_PATH = g.APP_PATH || process.cwd()

const dirName = path.join( APP_PATH, 'src', 'config' )
const envFile = path.join(dirName, deployEnv + '.yaml')
if (!fs.existsSync(envFile)) {
	throw new Error(`Bad environment variable MAPPER_ENV=${deployEnv}. Missing required config file ${envFile}.`)
}
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
