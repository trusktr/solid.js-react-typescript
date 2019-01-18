/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

//import SaffronSessionDataPersistenceProvider from './SaffronSessionDataPersistenceProvider'
import * as React from 'react'
import {
  IThemedProperties,
  withStatefulStyles,
  FillHeight,
  FillWidth,
  mergeStyles,
  PositionAbsolute
} from '@mapperai/mapper-themes'
import {
  SessionPicker,
  SessionPickerHeight,
  ISessionInfo,
  StatusWindowActions,
  AnnotatedSceneActions,
  DataProviderFactory,
  AnnotationManager,
  getLogger
} from '@mapperai/mapper-annotated-scene'
import { makeSaffronDataProviderFactory } from './SaffronDataProviderFactory'
import Annotator from '../annotator/Annotator'
import createStyles from '@material-ui/core/styles/createStyles'
import { ActivityTracker } from './ActivityTracker'

const log = getLogger(__filename)

interface IActivityTrackingInfo {
  numberOfAnnotations: number
}

export interface AppProps extends IThemedProperties {}

export interface AppState {
  dataProviderFactories: Array<DataProviderFactory>
  dataProviderFactory: DataProviderFactory | null
  session: ISessionInfo | null
  env: string
  reset: boolean
  isSaffron: boolean
  annotationManager: AnnotationManager | null
}

@withStatefulStyles(styles)
export class App extends React.Component<AppProps, AppState> {
  private static createDataProviderFactory(
    sessionId: string | null = null
  ): DataProviderFactory {
    return makeSaffronDataProviderFactory(sessionId)
  }

  private statusWindowActions = new StatusWindowActions()
  private sceneActions = new AnnotatedSceneActions()
  private activityTracker?: ActivityTracker<IActivityTrackingInfo>

  constructor(props: AppProps) {
    super(props)

    // noinspection PointlessBooleanExpressionJS
    this.state = {
      dataProviderFactories: [App.createDataProviderFactory()],
      dataProviderFactory: null,
      session: null,
      env: 'prod',
      reset: false,
      isSaffron: window.isSaffron === true,
      annotationManager: null
    }
  }

  private makeOnStatusWindowClick = () => () => {
    this.statusWindowActions.toggleEnabled()
  }

  private makeOnMenuClick = () => () => {
    this.sceneActions.toggleUIMenuVisible()
  }

  /**
   * Update session
   */
  private onSessionSelected = (factory: DataProviderFactory, session: ISessionInfo) =>
    this.setState({
      session,
      dataProviderFactory: factory.forSessionId(session.id),//App.createDataProviderFactory(session.id),
      reset: true
    })

  private getAnnotationManagerRef = (annotationManager: AnnotationManager | null) => {
    this.setState({ annotationManager })
  }

  onTrackActivity = (): IActivityTrackingInfo => {
    const annotationManager = this.state.annotationManager

    if (!annotationManager) {
      throw new Error('scene not ready')
    }

    return {
      numberOfAnnotations: annotationManager.allAnnotations().length
    }
  }

  componentDidUpdate(
    _prevProps: Readonly<AppProps>,
    prevState: Readonly<AppState>,
    _snapshot?: any
  ): void {
    if (this.state.reset) {
      this.setState({ reset: false })
    }

    if (this.state.session !== prevState.session) {
      this.activityTracker && this.activityTracker.stop()
      delete this.activityTracker

      if (this.state.session && this.state.session.id) {
        this.activityTracker = new ActivityTracker(this.state.session.id, this.onTrackActivity)
        this.activityTracker.start()
      } else {
        log.info('no session, not tracking activity')
      }
    }
  }

  componentWillUnmount() {
    this.activityTracker && this.activityTracker.stop()
    delete this.activityTracker
  }

  /**
   * Render annotator
   *
   * @returns {any}
   */
  private AnnotatorUI = (): JSX.Element => {
    const { dataProviderFactory } = this.state

    return (
      <>
        <Annotator getAnnotationManagerRef={this.getAnnotationManagerRef} dataProviderFactory={dataProviderFactory!} />
        <div id="menu_control">
          <button
            id="status_window_control_btn"
            className="menu_btn"
            onClick={this.makeOnStatusWindowClick()}
          >
            {' '}
            &#x2139;{' '}
          </button>
          <button
            id="menu_control_btn"
            className="menu_btn"
            onClick={this.makeOnMenuClick()}
          >
            {' '}
            &#9776;{' '}
          </button>
        </div>
      </>
    )
  }

  render(): JSX.Element {
    const { classes } = this.props,
      {
        reset,
        session,
        dataProviderFactory,
        dataProviderFactories
      } = this.state

    return (
      <div className={classes!.root}>
        {dataProviderFactories && (
          <>
            {/*this.SetupForm()*/}
            <SessionPicker
              onSessionSelected={this.onSessionSelected}
              session={session}
              dataProviderFactories={dataProviderFactories}
            />
            <div className="annotatorPane">
              {!reset && dataProviderFactory && this.AnnotatorUI()}
            </div>
          </>
        )}
      </div>
    )
  }
}

// return type disabled here because it is dynamically generated by the call to createStyles.
// SO in this case we must hover on `styles` to see the return type.
// eslint-disable-next-line typescript/explicit-function-return-type
function styles(theme) {

  const menuTopPosition = 40

  // accounts for height of the widget that shows LLA and UTM coordinates at
  // bottom right of the screen
  const coordinatesWidgetHeight = 50

  return createStyles(
    mergeStyles({
      root: [
        FillWidth,
        FillHeight,
        {
          '& > .annotatorPane': [
            PositionAbsolute,
            {
              backgroundColor: theme.palette.primary['800'],
              top: SessionPickerHeight,
              bottom: 0,
              left: 0,
              right: 0
            }
          ]
        }
      ],

      '@global': {
        '.annotated-scene-container': {
          height: '100%',
          maxHeight: '100%',
          minHeight: '100%',
          border: 0,
          padding: 0,
          margin: 0,
          width: '100%',
          maxWidth: '100%',
          minWidth: '100%',
          fontFamily: 'Verdana, Geneva, sans-serif',
          overflowX: 'hidden',
          overflowY: 'hidden',

          '& canvas.annotated-scene-canvas': {
            width: '100%',
            height: '100%'
          },

          '& .hidden': {
            display: 'none'
          },

          '&, & *, & *::after, & *::before': {
            boxSizing: 'border-box'
          }
        },

        '#logo': {
          position: 'absolute',
          zIndex: 2,
          bottom: 0,
          left: 0,
          backgroundColor: 'transparent',
          paddingBottom: 0,
          paddingLeft: '12px'
        },

        '#menu.hidden': {
          display: 'none'
        },

        '#menu': {
          position: 'absolute',
          right: 0,
          height: `calc(100% - ${menuTopPosition}px - ${coordinatesWidgetHeight}px)`,
          width: '250px',
          zIndex: 1,
          top: menuTopPosition,
          backgroundColor: 'transparent',
          overflowX: 'visible', // visible, but don't scroll
          overflowY: 'auto', // scroll if necessary
          paddingTop: 0,
          paddingRight: '5px',

          '& menu': {
            overflow: '',
            overflowY: 'auto',
          },

          '& *': {
            pointerEvents: 'auto'
          },

          '&, & *, & *::after, & *::before': {
            boxSizing: 'border-box'
          },

          '& .statusOk': {
            color: '#0a0'
          },
          '& .statusWarning': {
            color: '#ffd260'
          },
          '& .statusError': {
            color: '#a00'
          },
          '& button': {
            width: '100%',
            textDecoration: 'none',
            outline: 0,
            color: '#fff',
            backgroundColor: '#4caf50',
            border: 0,
            borderRadius: '15px',
            '&.laneBtn': {
              width: '30px'
            },
            '&:active': {
              backgroundColor: '#3e8e41',
              transform: 'translateY(4px)'
            },
            '&:hover': {
              backgroundColor: '#3e8e41'
            }
          },
          '& .fieldset_content_style': {
            width: '100%',
            height: '100%',
            marginTop: '2px',
            textAlign: 'center'
          },
          '& .div_buttons_group': {
            marginTop: '2px',
            textAlign: 'center'
          },
          '& .div_properties': {
            marginTop: '2px',
            textAlign: 'center'
          },
          '& .div_glue, & .div_help': {
            marginTop: '2px',
            textAlign: 'left',
            fontSize: 'x-small'
          },
          '& .div_help': {
            marginTop: 0
          },
          '& .ui-btn': {
            fontSize: '12px'
          },
          '& .label_style, & .select_style': {
            textAlign: 'left',
            padding: 0,
            margin: 0,
            float: 'left',
            fontSize: 'x-small'
          },
          '& .label_style': {
            border: 0,
            backgroundColor: 'transparent',
            width: '60%'
          },
          '& .select_style': {
            width: '40%'
          },
          '& .accordion': {
            outline: 0,
            borderRadius: '10px',
            marginBottom: '2px',
            backgroundColor: '#f4511e',
            border: 0,
            color: '#fff',
            textAlign: 'left',
            fontSize: '15px',
            padding: 0,
            width: 'auto',
            cursor: 'pointer'
          },
          '& .dropdown_head': {
            margin: '3px',
            padding: '2px',
            fontSize: '12px',
            '&:after': {
              content: "'\\02795'", // TODO? it was '\02795' in the CSS
              fontSize: '10px',
              paddingRight: '5px',
              paddingTop: '2px',
              float: 'right'
            },
            '&:active': {
              '&:after': {
                content: "'-'"
              }
            }
          },
          '& .dropdown_body': {
            height: 'auto',
            padding: '5px',
            borderRadius: '5px',
            backgroundColor: '#faebd7',
            color: '#000',
            display: 'none',
            overflow: 'auto'
          }
        },

        '#status_window': {
          position: 'absolute',
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(255, 255, 255, 0.5)',
          padding: '5px',
          zIndex: 3
        },

        '#menu_control': {
          backgroundColor: 'transparent',
          position: 'absolute',
          zIndex: 1,
          top: 0,
          right: 0,
          paddingRight: '5px',
          textAlign: 'right',
          visibility: 'hidden',
          height: '50px',
          width: '150px'
        },

        'button.menu_btn': {
          backgroundColor: 'transparent',
          height: '40px',
          width: '40px',
          fontSize: 'x-large',
          border: 0,
          color: 'white',

          '&:hover': {
            fontSize: 'xx-large',
            backgroundColor: 'transparent'
          },
          '&:active': {
            fontSize: 'xx-large'
          }
        }
      }
    })
  )
}