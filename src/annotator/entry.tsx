/**
 *  Copyright 2017 Mapper Inc. Part of the mapper-annotator project.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */
import * as React from 'react'
import * as ReactDOM from 'react-dom'
import 'jquery-ui-dist/jquery-ui.css' // eslint-disable-line import/no-webpack-loader-syntax
import * as $ from 'jquery'
import {Provider as ReduxProvider} from 'react-redux'
import * as tinycolor from 'tinycolor2'
import {MuiThemeProvider, createMuiTheme} from '@material-ui/core'
import {MapperCssBaseline} from '@mapperai/mapper-themes'
import {Deferred, loadAnnotatedSceneStore, getAnnotatedSceneReduxStore} from '@mapperai/mapper-annotated-scene'
import {App} from './App'
import {configReady} from '../annotator-config'
import {ready} from './SaffronDataProviderFactory'

type ElementOrComponent = JSX.Element | React.Component

let deferred: Deferred<ElementOrComponent>

export async function startAnnotator(isInsideSaffronBrowsingContext = false): Promise<ElementOrComponent> {
  if (deferred) return deferred.promise
  deferred = new Deferred<ElementOrComponent>()

  await ready

  // This is needed because jQuery-ui depends on the globals existing.
  Object.assign(global, {
    jQuery: $,
    $: $,
  })

  // import jQuery-UI after setting up the jQuery global
  require('jquery-ui-dist/jquery-ui')

  await configReady()

  // services.loadStore()
  loadAnnotatedSceneStore()

  const root = $('#root')[0]

  const doRender = (): void => {
    const component = (
      <MuiThemeProvider theme={createMuiTheme(makeMapperPalette())}>
        <MapperCssBaseline />
        <ReduxProvider store={getAnnotatedSceneReduxStore()}>
          <App />
        </ReduxProvider>
      </MuiThemeProvider>
    )

    if (!isInsideSaffronBrowsingContext) ReactDOM.render(component, root)

    deferred.resolve(component)
  }

  $(doRender)

  return deferred.promise
}

// TODO get all the following theme stuff from mapper-themes

type Contrast = 'light' | 'dark' | 'brown'

interface Color {
  50: string
  100: string
  200: string
  300: string
  400: string
  500: string
  600: string
  700: string
  800: string
  900: string
  A100: string
  A200: string
  A400: string
  A700: string
  contrastDefaultColor: Contrast
}

export function makeMaterialPalette(hex: string): Color {
  const colors = [
    {
      hex: tinycolor(hex)
        .lighten(52)
        .toHexString(),
      name: '50',
    },
    {
      hex: tinycolor(hex)
        .lighten(37)
        .toHexString(),
      name: '100',
    },
    {
      hex: tinycolor(hex)
        .lighten(26)
        .toHexString(),
      name: '200',
    },
    {
      hex: tinycolor(hex)
        .lighten(12)
        .toHexString(),
      name: '300',
    },
    {
      hex: tinycolor(hex)
        .lighten(6)
        .toHexString(),
      name: '400',
    },
    {
      hex: hex,
      name: '500',
    },
    {
      hex: tinycolor(hex)
        .darken(6)
        .toHexString(),
      name: '600',
    },
    {
      hex: tinycolor(hex)
        .darken(12)
        .toHexString(),
      name: '700',
    },
    {
      hex: tinycolor(hex)
        .darken(18)
        .toHexString(),
      name: '800',
    },
    {
      hex: tinycolor(hex)
        .darken(24)
        .toHexString(),
      name: '900',
    },
    {
      hex: tinycolor(hex)
        .lighten(52)
        .toHexString(),
      name: 'A100',
    },
    {
      hex: tinycolor(hex)
        .lighten(37)
        .toHexString(),
      name: 'A200',
    },
    {
      hex: tinycolor(hex)
        .lighten(6)
        .toHexString(),
      name: 'A400',
    },
    {
      hex: tinycolor(hex)
        .darken(12)
        .toHexString(),
      name: 'A700',
    },
  ]

  return colors.reduce((palette, nextColor) => {
    palette[nextColor.name] = nextColor.hex
    return palette
  }, {}) as Color
}

export interface IThemePalette {
  primary: Color
  accent: Color
  background: Color
  text: Color
  textNight: Color
  contrastText: string
  accentBlack: string
}

// eslint-disable-next-line typescript/explicit-function-return-type
function makeMapperPalette() {
  const theme = {
    palette: {
      primary: makeMaterialPalette('#555555'), // app icons and text
      accent: makeMaterialPalette('#F8C632'),
      background: makeMaterialPalette('#F0F0F0'),
      text: makeMaterialPalette('#00000070'),
      textNight: makeMaterialPalette('#FFFFFF'),
      contrastText: '#dedede',
      accentBlack: '#242930',
    } as IThemePalette,
  }
  const {palette} = theme

  return {
    palette: {
      primary: {
        light: palette.primary.A200,
        main: palette.primary.A400,
        dark: palette.primary.A700,
      },
      secondary: {
        light: palette.accent.A200,
        main: palette.accent.A400,
        dark: palette.accent.A700,
      },
      type: 'dark',
    },
    typography: {
      useNextVariants: true,
      fontFamily: 'AvenirNext',
      fontWeightLight: 300,
      fontWeightRegular: 400,
      fontWeightMedium: 500,
    },
  } as any
}
