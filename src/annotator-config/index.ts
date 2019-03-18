// Copyright 2017 Mapper Inc.
// CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.

import * as _ from 'lodash'
import createPromise from '../util/createPromise'
import { IAnnotatedSceneConfig } from '@mapperai/mapper-annotated-scene'

const config = {}
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

// prettier-ignore
const {
  promise: configPromise,
  reject: rejectConfig,
  resolve: resolveConfig
} = createPromise<IAnnotatedSceneConfig, Error>()

// eslint-disable-next-line typescript/no-explicit-any
function configReady(): typeof configPromise {
  return configPromise
}

function setupConfig(): void {
  try {
    const confMods = require.context('.', true, /yaml$/)
    const confKeys = confMods.keys()
    const envFilename = `${deployEnv}.yaml`

    const testConfKeys = [envFilename, 'local.yaml']
    const conf = testConfKeys.reduce((conf, nextKey) => {
      const key = confKeys.find(key => key.includes(nextKey))

      if (key)
        _.merge(conf, confMods(key))

      return conf
    }, {})

    // prettier-ignore
    console.log('Available env configs', confKeys, 'desired', envFilename, 'final config', conf)

    Object.assign(config, conf)
    resolveConfig(config)
  } catch (err) {
    console.error('Failed to load config', err)
    rejectConfig(err)
  }
}

setupConfig()

export default config
export { configReady }
