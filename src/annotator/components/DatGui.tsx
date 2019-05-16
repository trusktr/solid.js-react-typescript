import * as React from 'react'
import {AnnotatedSceneActions, AnnotatedSceneConfig} from '@mapperai/mapper-annotated-scene'
import {withStyles, createStyles, Theme, WithStyles} from '@material-ui/core'
import Paper from '@material-ui/core/Paper/Paper'
import {Typography} from '@material-ui/core'
import * as Dat from 'dat.gui'
import DatGuiContext from './DatGuiContext'

const dat: typeof Dat = (Dat as any).default as typeof Dat

export type GuiState = {
  lockBoundaries: boolean
  lockLanes: boolean
  lockPolygons: boolean
  lockTrafficDevices: boolean
  bezierScaleFactor: number
  maxSuperTilesToLoad: number
  maxPointDensity: number
  roadPointsIntensityScale: number
  imageScreenOpacity: number
  showPerfStats: boolean
}

export interface Props extends WithStyles<typeof styles> {
  initialState?: GuiState
  config?: AnnotatedSceneConfig
  onUpdate?: (prop: string, guiState: GuiState) => void
}

export interface State {}

export class DatGui extends React.Component<Props, State> {
  static contextType = DatGuiContext

  private datContainer = React.createRef<HTMLDivElement>()
  private sceneActions = new AnnotatedSceneActions()
  private gui?: dat.GUI

  // This is readonly, but because we pass it to dat.GUI, it can get written
  // there, and users of this class can only read values (which is what we want
  // to allow).
  readonly guiState: GuiState = {...(this.props.initialState || this.context.initialState)} as GuiState

  // Create a UI widget to adjust application settings on the fly.
  private createControlsGui(): void {
    if (
      // FIXME, this option is missing.
      (this.props.config && !this.props.config['startup.show_control_panel']) ||
      !this.context.config['startup.show_control_panel']
    ) {
      // ...
    }

    const gui = (this.gui = new dat.GUI({
      hideable: false,
      closeOnTop: true,
      autoPlace: false,
    }))

    this.datContainer.current!.appendChild(gui.domElement)

    /*
    gui
      .addColor(this.guiState, 'background')
      .name('Background')
      .onChange(() => {
        this.forceUpdate()
      })
      */

    this.sceneActions.setLockBoundaries(this.guiState.lockBoundaries)
    this.sceneActions.setLockLanes(this.guiState.lockLanes)
    this.sceneActions.setLockPolygons(this.guiState.lockPolygons)
    this.sceneActions.setLockTrafficDevices(this.guiState.lockTrafficDevices)

    const folderLock = gui.addFolder('Lock Annotations')

    folderLock
      .add(this.guiState, 'lockBoundaries')
      .name('Boundaries')
      .onChange(() => this.guiUpdate('lockBoundaries'))

    folderLock
      .add(this.guiState, 'lockLanes')
      .name('Lanes')
      .onChange(() => this.guiUpdate('lockLanes'))

    folderLock
      .add(this.guiState, 'lockPolygons')
      .name('Polygons')
      .onChange(() => this.guiUpdate('lockPolygons'))

    folderLock
      .add(this.guiState, 'lockTrafficDevices')
      .name('Traffic Devices')
      .onChange(() => this.guiUpdate('lockTrafficDevices'))

    folderLock.open()

    const folderConnection = gui.addFolder('Connections')

    folderConnection
      .add(this.guiState, 'bezierScaleFactor', 1, 50)
      .step(1)
      .name('Curvature')
      .onChange(() => this.guiUpdate('bezierScaleFactor'))

    folderConnection.open()

    const tileFolder = gui.addFolder('Point Cloud')

    tileFolder
      .add(this.guiState, 'maxSuperTilesToLoad', 1, 3000)
      .step(1)
      .name('Max tiles')
      .onChange(() => this.guiUpdate('maxSuperTilesToLoad'))

    tileFolder
      .add(this.guiState, 'maxPointDensity', 1, 1000)
      .step(1)
      .name('Max density')
      .onChange(() => this.guiUpdate('maxPointDensity'))

    tileFolder
      .add(this.guiState, 'roadPointsIntensityScale', 1, 50)
      .step(1)
      .name('Road contrast')
      .onChange(() => this.guiUpdate('roadPointsIntensityScale'))

    tileFolder.open()

    const imagesFolder = gui.addFolder('Images')

    imagesFolder
      .add(this.guiState, 'imageScreenOpacity', 0, 1)
      .name('Image Opacity')
      .onChange(() => this.guiUpdate('imageScreenOpacity'))

    imagesFolder.open()

    const sceneOptions = gui.addFolder('Scene')

    sceneOptions
      .add(this.guiState, 'showPerfStats')
      .name('Show stats')
      .onChange(() => this.guiUpdate('showPerfStats'))

    sceneOptions.open()
  }

  private destroyControlsGui(): void {
    if (!this.gui) return
    this.gui.destroy()
    this.gui.domElement.remove()
    this.datContainer.current!.remove()
  }

  private guiUpdate(prop: string) {
    if (this.props.onUpdate) this.props.onUpdate(prop, this.guiState)
    else if (this.context.onUpdate) this.context.onUpdate(prop, this.guiState)
  }

  componentDidMount() {
    this.createControlsGui()
  }

  componentWillUnmount() {
    this.destroyControlsGui()
  }

  render() {
    const {classes} = this.props

    return (
      <Paper className={classes.root}>
        <Typography variant="h5" gutterBottom>
          Settings
        </Typography>

        <div ref={this.datContainer} />
      </Paper>
    )
  }
}

// const _DatGui = withStyles(styles)(DatGui)
// export type _DatGui = typeof _DatGui & DatGui
// export default _DatGui as _DatGui
export default withStyles(styles)(DatGui)

// eslint-disable-next-line typescript/explicit-function-return-type
function styles(_theme: Theme) {
  return createStyles({
    root: {
      padding: '10px',

      '& .dg.main': {
        width: 'auto!important',
        background: 'rgba(0,0,0,0.5)',
        padding: 10,

        '& .close-button': {
          width: 'auto!important',
          marginBottom: 5,
          cursor: 'pointer',
        },
      },
    },
  })
}
