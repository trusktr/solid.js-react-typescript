// Copyright 2017 Mapper Inc.
// CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.

import * as _ from 'lodash'
import createPromise from '../util/createPromise'
import { IAnnotatedSceneConfig } from '@mapperai/mapper-annotated-scene'

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
} = createPromise<IAnnotatedSceneConfig, Error>()

// eslint-disable-next-line typescript/no-explicit-any
function configReady(): typeof configPromise {
	return configPromise
}

function setupConfig(): void {
	if (process.env.WEBPACK) {
		try {
			const confMods = require.context('.', true, /yaml$/)
			const confKeys = confMods.keys()
			const envFilename = `${deployEnv}.yaml`

			console.log('Available env configs', confKeys, 'desired', envFilename)

			const testConfKeys = [envFilename, 'local.yaml']
			const conf = testConfKeys.reduce((conf, nextKey) => {
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
		~(async function() {
			const modules = [
				import('path'),
				import('fs'),
				import('nconf'),
				import('nconf-yaml'),
			]
			const [path, fs, nconf, yaml] = await Promise.all(modules)
			const envFile = path.resolve(__dirname, deployEnv + '.yaml')

			if (!fs.existsSync(envFile)) {
				throw new Error(
					`Bad environment variable NODE_ENV=${deployEnv}. Missing required config file ${envFile}.`,
				)
			}

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
		})()
	}
}

setupConfig()

export default config
export { configReady }
