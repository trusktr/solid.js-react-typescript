/**
 *  Copyright 2017 Mapper Inc. Part of the mapper-annotator project.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */
import * as React from 'react'
import * as ReactDOM from 'react-dom'
import 'jquery-ui-dist/jquery-ui.css' // eslint-disable-line import/no-webpack-loader-syntax
import * as $ from 'jquery'
import {loadAnnotatedSceneStore} from '@mapperai/mapper-annotated-scene'
import Annotator from './Annotator'
import {configReady} from '../annotator-config'
import {AuthService, AuthEvents} from './services/AuthService'

// This is needed because jQuery-ui depends on the globals existing.
Object.assign(global, {
  jQuery: $,
  $: $,
})

export function startAnnotator(): void {
  const auth = AuthService.singleton()

  auth.showLogin(true)

  auth.on(AuthEvents.UPDATED, function listener(account) {
    if (!(account && auth.orgId))
      throw new Error('Something went wrong. A user account belonging to an organization should exist.')

    auth.removeListener(AuthEvents.UPDATED, listener)
    // auth.hideLogin()

    render(auth.orgId)
  })
}

async function render(org: string): Promise<void> {
  // import jQuery-UI after setting up the jQuery global
  require('jquery-ui-dist/jquery-ui')

  await configReady()

  loadAnnotatedSceneStore()

  const root = $('#root')[0]

  ReactDOM.render(<Annotator orgId={org} />, root)
}
