/**
 *  Copyright 2017 Mapper Inc. Part of the mapper-annotator project.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import './env'
import './disable-logger'
import 'jquery-ui-dist/jquery-ui.css' // eslint-disable-line import/no-webpack-loader-syntax
import * as $ from 'jquery'
import * as React from 'react'
import * as ReactDOM from 'react-dom'
import App from './App'
import {
  Deferred,
  loadAnnotatedSceneStore,
  getAnnotatedSceneReduxStore
} from '@mapperai/mapper-annotated-scene'
import { Provider } from 'react-redux'
import { configReady } from 'annotator-config'
import TestWorker from './test.worker'

new TestWorker() // see output in the console

// This is needed because jQuery-ui depends on the globals existing.
Object.assign(global, {
  jQuery: $,
  $: $
})

require('jquery-ui-dist/jquery-ui')

type ElementOrComponent = JSX.Element | React.Component

let deferred: Deferred<ElementOrComponent>

// otherwise, Saffron will mount the exported App for us.
async function start(isSaffron = false): Promise<ElementOrComponent> {
  if (deferred) return deferred.promise

  deferred = new Deferred<ElementOrComponent>()

  await configReady()

  // services.loadStore()
  loadAnnotatedSceneStore()

  const root = $('#root')[0]

  const doRender = (): void => {
    const component = (
      <Provider store={getAnnotatedSceneReduxStore()}>
        <App />
      </Provider>
    )

    if (!isSaffron) ReactDOM.render(component, root)

    deferred.resolve(component)
  }

  $(doRender)

  return deferred.promise
}

async function stop(): Promise<void> {}

module.exports = {
  start,
  stop
}
