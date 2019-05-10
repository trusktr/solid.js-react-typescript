/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as React from 'react'
import * as Electron from 'electron'
import {
  Annotation,
  LayerManager,
  typedConnect,
  toProps,
  AnnotatedSceneState,
  LayerStatusMap,
  AnnotationType,
} from '@mapperai/mapper-annotated-scene'
import Help from '../annotator/components/Help'
import {Inspector} from './components/Inspector'
import {IThemedProperties, withStatefulStyles, mergeStyles, mergeClasses} from '@mapperai/mapper-themes'
import {menuSpacing, menuTopPosition, panelBorderRadius} from './styleVars'
import loadAnnotations from '../util/loadAnnotations'
import getLogger from 'util/Logger'
type Annotator = import('./Annotator').default

const log = getLogger(__filename)
const dialog = Electron.remote.dialog

interface AnnotatorMenuViewProps extends IThemedProperties {
  uiMenuVisible: boolean
  layerStatus?: LayerStatusMap
  selectedAnnotation?: Annotation | null
  onSaveAnnotationsJson(): void
  onSaveAnnotationsKML(): void
  annotator: Annotator
}

interface AnnotatorMenuViewState {}

@typedConnect(toProps(AnnotatedSceneState, 'layerStatus'))
@withStatefulStyles(styles)
export default class AnnotatorMenuView extends React.Component<AnnotatorMenuViewProps, AnnotatorMenuViewState> {
  constructor(props: AnnotatorMenuViewProps) {
    super(props)
  }

  componentDidMount() {
    $('#menu_help').accordion({
      active: false,
      collapsible: true,
    })

    const toolsDelete = $('#tools_delete')

    toolsDelete.on('click', () => {
      this.props.annotator.uiDeleteActiveAnnotation()
    })

    const toolsAddLane = $('#tools_add_lane')

    toolsAddLane.on('click', () => {
      this.props.annotator.uiAddAnnotation(AnnotationType.LANE)
    })

    const toolsAddTrafficDevice = $('#tools_add_traffic_device')

    toolsAddTrafficDevice.on('click', () => {
      this.props.annotator.uiAddAnnotation(AnnotationType.TRAFFIC_DEVICE)
    })

    const toolsLoadImages = $('#tools_load_images')

    toolsLoadImages.on('click', () => {
      this.props.annotator.imageManager
        .loadImagesFromOpenDialog()
        .catch(err => log.warn('loadImagesFromOpenDialog failed: ' + err.message))
    })

    const toolsLoadAnnotation = $('#tools_load_annotation')

    toolsLoadAnnotation.on('click', () => {
      const options: Electron.OpenDialogOptions = {
        message: 'Load Annotations File',
        properties: ['openFile'],
        filters: [{name: 'json', extensions: ['json']}],
      }

      const handler = async (paths: string[]): Promise<void> => {
        if (paths && paths.length) {
          try {
            await loadAnnotations.call(
              this.props.annotator,
              paths[0],
              this.props.annotator.state.annotatedSceneController!
            )
          } catch (err) {
            log.warn('loadAnnotations failed: ' + err.message)
          }
        }
      }

      dialog.showOpenDialog(options, handler)
    })
  }

  componentWillUnmount() {
    $('#menu_help').accordion('destroy')
    $('#tools_add_lane').off()
    $('#tools_add_traffic_device').off()
    $('#tools_load_images').off()
    $('#tools_load_annotation').off()
  }

  render(): JSX.Element {
    const {classes} = this.props
    return (
      <div id="menu" className={mergeClasses(classes!.menu!, this.props.uiMenuVisible ? '' : 'hidden')}>
        <menu id="annotationMenu" className="menu">
          {this.props.layerStatus && (
            <LayerManager layerStatus={this.props.layerStatus} useCheckboxes={true} isDraggable={false} />
          )}
          <div id="tools" className="div_buttons_group">
            <button id="tools_add_lane" className="ui-btn ui-icon-plus ui-btn-icon-left">
              New Lane
            </button>
            <button id="tools_add_traffic_device" className="ui-btn ui-icon-plus ui-btn-icon-left">
              New Traffic Device
            </button>
            <button id="tools_delete" className="ui-btn ui-icon-minus ui-btn-icon-left">
              Delete Annotation
            </button>
            {/*
            <button
              id="tools_load_images"
              className="ui-btn ui-icon-camera ui-btn-icon-left"
            >
              Load Images
            </button>
            <button
              id="tools_load_annotation"
              className="ui-btn ui-icon-edit ui-btn-icon-left"
            >
              Load Annotations
            </button>
            */}
            <button onClick={this.props.onSaveAnnotationsKML} className="ui-btn ui-icon-location ui-btn-icon-left">
              Save Annotations as KML
            </button>
            <button onClick={this.props.onSaveAnnotationsJson} className="ui-btn ui-icon-location ui-btn-icon-left">
              Save Annotations as JSON
            </button>
          </div>

          <Inspector selectedAnnotation={this.props.selectedAnnotation} />

          <div id="menu_help" className="accordion">
            <h3 id="exp_head_6" className="dropdown_head">
              Help
            </h3>
            <div id="exp_body_6" className="dropdown_body">
              <Help />
            </div>
          </div>
        </menu>
      </div>
    )
  }
}

// eslint-disable-next-line typescript/explicit-function-return-type
function styles() {
  return mergeStyles({
    menu: {
      position: 'absolute',
      right: menuSpacing,
      height: `calc(100% - ${menuTopPosition}px - ${menuSpacing}px)`,
      width: '250px',
      zIndex: 1,
      top: menuTopPosition,
      backgroundColor: 'transparent',
      overflowX: 'visible', // visible, but don't scroll
      overflowY: 'auto', // scroll if necessary
      paddingTop: 0,
      borderRadius: panelBorderRadius,

      '&.hidden': {
        display: 'none',
      },

      '& menu': {
        padding: 0,
        margin: 0,
      },

      '& *': {
        pointerEvents: 'auto',
      },

      '&, & *, & *::after, & *::before': {
        boxSizing: 'border-box',
      },

      '& .statusOk': {
        color: '#0a0',
      },
      '& .statusWarning': {
        color: '#ffd260',
      },
      '& .statusError': {
        color: '#a00',
      },
      '& button': {
        width: '100%',
        textDecoration: 'none',
        outline: 0,
        color: '#fff',
        backgroundColor: '#4caf50',
        border: 0,
        borderRadius: '15px',
        '&:active': {
          backgroundColor: '#3e8e41',
          transform: 'translateY(4px)',
        },
        '&:hover': {
          backgroundColor: '#3e8e41',
        },
      },
      '& .fieldset_content_style': {
        width: '100%',
        height: '100%',
        marginTop: '2px',
        textAlign: 'center',
      },
      '& .div_buttons_group': {
        marginTop: '2px',
        textAlign: 'center',
      },
      '& .div_properties': {
        marginTop: '2px',
        textAlign: 'center',
      },
      '& .div_glue, & .div_help': {
        marginTop: '2px',
        textAlign: 'left',
        fontSize: 'x-small',
      },
      '& .div_help': {
        marginTop: 0,
      },
      '& .ui-btn': {
        fontSize: '12px',
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
        cursor: 'pointer',
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
          float: 'right',
        },
        '&:active': {
          '&:after': {
            content: "'-'",
          },
        },
      },
      '& .dropdown_body': {
        height: 'auto',
        padding: '5px',
        borderRadius: '5px',
        backgroundColor: '#faebd7',
        color: '#000',
        display: 'none',
        overflow: 'auto',
      },
    },
  })
}
