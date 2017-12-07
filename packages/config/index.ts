// Copyright 2017 Mapper Inc.
// CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.

'use strict'

const nconf = module.exports = require('nconf')
nconf.formats.yaml = require('nconf-yaml')
const path = require('path')
const fs = require('fs')

const required = [
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

const dirName = 'packages/config'
const envFile = path.join(dirName, deployEnv + '.yaml')
if (!fs.existsSync(envFile)) {
	throw new Error(`Bad environment variable MAPPER_ENV=${deployEnv}. Missing required config file ${envFile}.`)
}

nconf
	// command-line arguments
	.argv()
	// environment variables
	.env(required)
	// config files
	.file({file: envFile, format: nconf.formats.yaml})
	.defaults({})

required.forEach((key) => {
	if (!nconf.get(key)) {
		throw new Error(`missing required configuration key: ${key}`)
	}
})