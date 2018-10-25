// Copyright 2017 Mapper Inc.
// CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.

const _ = require('lodash')
const createPromise = require('../util/createPromise').default

const config = {}
const envInput = (process.env.NODE_ENV || '').toLowerCase()

let deployEnv

if (envInput === 'prod' || envInput === 'production') deployEnv = 'prod'
else if (envInput === 'dev' || envInput === 'development' || envInput === '')
	deployEnv = 'dev'
else if (envInput === 'test') deployEnv = 'test'
else throw new Error('Unknown environment name: NODE_ENV=' + envInput)

const {
	promise: configPromise,
	reject: rejectConfig,
	resolve: resolveConfig,
} = createPromise()
//const deferredConfig = new Deferred()

// eslint-disable-next-line typescript/no-explicit-any
function configReady() {
	return configPromise
}

function setupConfig() {
	if (process.env.WEBPACK) {
		try {
			const confMods = require.context('.', true, /yaml$/),
				confKeys = confMods.keys(),
				envFilename = `${deployEnv}.yaml`

			console.log('Available env configs', confKeys, 'desired', envFilename)

			const testConfKeys = [envFilename, 'local.yaml'],
				conf = testConfKeys.reduce((conf, nextKey) => {
					const key = confKeys.find(key => key.includes(nextKey))
					if (key) {
						const confMod = confMods(key)
						_.merge(conf, confMod)
					}
					return conf
				}, {})

			console.log(
				'Available env configs',
				confKeys,
				'desired',
				envFilename,
				'final config',
				conf,
			)

			const required = [
				// 'tile_manager.utm_tile_scale',
				// 'tile_manager.super_tile_scale',
				'output.annotations.json.path',
				'output.annotations.kml.path',
			]

			required.forEach(key => {
				if (!conf[key])
					throw new Error(`missing required configuration key: ${key}`)
			})

			Object.assign(config, conf)
			resolveConfig(config)
		} catch (err) {
			console.error('Failed to load config', err)
			rejectConfig(err)
		}
	} else {
		const path = require('path')
		const fs = require('fs')
		const nconf = require('nconf')
		const yaml = require('nconf-yaml')
		const envFile = path.resolve(__dirname, deployEnv + '.yaml')

		if (!fs.existsSync(envFile))
			throw new Error(
				`Bad environment variable NODE_ENV=${deployEnv}. Missing required config file ${envFile}.`,
			)

		const required = [
			// 'tile_manager.utm_tile_scale',
			// 'tile_manager.super_tile_scale',
			'output.annotations.json.path',
			'output.annotations.kml.path',
		]
		const localFile = path.resolve(__dirname, 'local.yaml')

		nconf
			.argv()
			.env(required)
			.file('local_config', { file: localFile, format: yaml })
			.file('shared_config', { file: envFile, format: yaml })
			.defaults({})

		required.forEach(key => {
			if (!nconf.get(key))
				throw new Error(`missing required configuration key: ${key}`)
		})

		Object.assign(config, nconf.get())
		resolveConfig(config)
	}
}

setupConfig()

module.exports = {
	configReady,
	default: config,
}
