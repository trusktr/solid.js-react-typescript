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
  PositionAbsolute,
} from '@mapperai/mapper-themes'
import {
  SessionPicker,
  SessionPickerHeight,
  ISessionInfo,
  DataProviderFactory,
  AnnotationManager,
} from '@mapperai/mapper-annotated-scene'
import {makeSaffronDataProviderFactory} from './SaffronDataProviderFactory'
import Annotator from '../annotator/Annotator'
import createStyles from '@material-ui/core/styles/createStyles'
import {ActivityTracker} from './ActivityTracker'
import getLogger from 'util/Logger'

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
  private static createDataProviderFactory(sessionId: string | null = null): DataProviderFactory {
    return makeSaffronDataProviderFactory(sessionId, false)
  }

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
      annotationManager: null,
    }
  }

  /**
   * Update session
   */
  private onSessionSelected = (factory: DataProviderFactory, session: ISessionInfo) =>
    this.setState({
      session,
      dataProviderFactory: factory.forSessionId(session.id), //App.createDataProviderFactory(session.id),
      reset: true,
    })

  private getAnnotationManagerRef = (annotationManager: AnnotationManager | null) => {
    this.setState({annotationManager})
  }

  onTrackActivity = (): IActivityTrackingInfo | false => {
    const annotationManager = this.state.annotationManager

    if (!annotationManager) return false

    return {
      numberOfAnnotations: annotationManager.allAnnotations.length,
    }
  }

  componentDidUpdate(_prevProps: Readonly<AppProps>, prevState: Readonly<AppState>, _snapshot?: any): void {
    if (this.state.reset) {
      this.setState({reset: false})
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

  render(): JSX.Element {
    const {classes} = this.props
    const {reset, session, dataProviderFactory, dataProviderFactories} = this.state

    return (
      <div className={classes!.root}>
        {dataProviderFactories && (
          <React.Fragment>
            <SessionPicker
              onSessionSelected={this.onSessionSelected}
              session={session}
              dataProviderFactories={dataProviderFactories}
            />
            <div className="annotatorPane">
              {!reset && dataProviderFactory && (
                <Annotator
                  getAnnotationManagerRef={this.getAnnotationManagerRef}
                  dataProviderFactory={dataProviderFactory!}
                />
              )}
            </div>
          </React.Fragment>
        )}
      </div>
    )
  }
}

// return type disabled here because it is dynamically generated by the call to createStyles.
// SO in this case we must hover on `styles` to see the return type.
// eslint-disable-next-line typescript/explicit-function-return-type
function styles(theme) {
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
              right: 0,
            },
          ],
        },
      ],
    })
  )
}
