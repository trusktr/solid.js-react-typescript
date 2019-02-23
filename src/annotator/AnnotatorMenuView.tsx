/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as React from 'react'
import initUIControl from './annotator-control-ui/UIControl'
import {Annotation, LayerManager, typedConnect, toProps, AnnotatedSceneState, LayerStatusMap} from '@mapperai/mapper-annotated-scene'
import Help from '../annotator/components/Help'
import { Inspector } from './components/Inspector'
import {
  IThemedProperties,
  withStatefulStyles,
  mergeStyles,
  mergeClasses,
} from '@mapperai/mapper-themes'
import {
  menuSpacing,
  menuTopPosition,
  panelBorderRadius,
} from './styleVars'

interface AnnotatorMenuViewProps extends IThemedProperties {
  uiMenuVisible: boolean
  layerStatus?: LayerStatusMap
  selectedAnnotation?: Annotation | null
  onSaveAnnotationsJson(): void
  onSaveWaypointsKML(): void
}

interface AnnotatorMenuViewState {}

@typedConnect(toProps(
  AnnotatedSceneState,
  'layerStatus'
))
@withStatefulStyles(styles)
export default class AnnotatorMenuView extends React.Component<
  AnnotatorMenuViewProps,
  AnnotatorMenuViewState
> {
  constructor(props: AnnotatorMenuViewProps) {
    super(props)
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
            <button
              id="tools_add_lane"
              className="ui-btn ui-icon-plus ui-btn-icon-left"
            >
              {' '}
              New Lane{' '}
            </button>
            <button
              id="tools_add_traffic_device"
              className="ui-btn ui-icon-plus ui-btn-icon-left"
            >
              {' '}
              New Traffic Device{' '}
            </button>
            <button
              id="tools_delete"
              className="ui-btn ui-icon-minus ui-btn-icon-left"
            >
              {' '}
              Delete Annotation{' '}
            </button>
            <button
              id="tools_load_images"
              className="ui-btn ui-icon-camera ui-btn-icon-left"
            >
              {' '}
              Load Images{' '}
            </button>
            <button
              id="tools_load_annotation"
              className="ui-btn ui-icon-edit ui-btn-icon-left"
            >
              {' '}
              Load Annotations{' '}
            </button>
            <button
              onClick={this.props.onSaveWaypointsKML}
              className="ui-btn ui-icon-location ui-btn-icon-left"
            >
              Save Lane Waypoints as KML
            </button>
            <button
              onClick={this.props.onSaveAnnotationsJson}
              className="ui-btn ui-icon-location ui-btn-icon-left"
            >
              Save Annotations as JSON
            </button>
          </div>

          <div id="menu_boundary" className="accordion">
            <h3 id="exp_head_1" className="dropdown_head">
              {' '}
              Boundary Properties{' '}
            </h3>
            <div id="exp_body_1" className="dropdown_body">
              <div id="boundary_prop" className="fieldset_content_style" />
            </div>
          </div>

          <div id="menu_lane" className="accordion">
            <h3 id="exp_head_2" className="dropdown_head">
              {' '}
              Lane Properties{' '}
            </h3>
            <div id="exp_body_2" className="dropdown_body">
              <div id="lane_prop" className="fieldset_content_style">
                <div id="lane_prop_1" className="div_properties" />
                <div id="lane_prop_2" className="div_glue">
                  {' '}
                  Add Neighbor:{' '}
                </div>
                <div id="lane_prop_3" className="div_buttons_group">
                  <button className="laneBtn" id="lp_add_forward">
                    {' '}
                    &uarr;{' '}
                  </button>
                </div>
                <div id="lane_prop_4" className="div_buttons_group">
                  <button className="laneBtn" id="lp_add_left_opposite">
                    {' '}
                    &darr;{' '}
                  </button>
                  <button className="laneBtn" id="lp_add_left_same">
                    {' '}
                    &uarr;{' '}
                  </button>
                  <button className="laneBtn" id="lp_current" disabled>
                    {' '}
                    C{' '}
                  </button>
                  <button className="laneBtn" id="lp_add_right_same">
                    {' '}
                    &uarr;{' '}
                  </button>
                  <button className="laneBtn" id="lp_add_right_opposite">
                    {' '}
                    &darr;{' '}
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div id="menu_connection" className="accordion">
            <h3 id="exp_head_3" className="dropdown_head">
              {' '}
              Connection Properties{' '}
            </h3>
            <div id="exp_body_3" className="dropdown_body">
              <div id="connection_prop" className="fieldset_content_style" />
            </div>
          </div>
          <div id="menu_traffic_device" className="accordion">
            <h3 id="exp_head_4" className="dropdown_head">
              {' '}
              Traffic Device Properties{' '}
            </h3>
            <div id="exp_body_4" className="dropdown_body">
              <div
                id="traffic_device_prop_1"
                className="fieldset_content_style"
              />
              <div
                id="traffic_device_prop_2"
                className="fieldset_content_style"
              />
            </div>
          </div>
          <div id="menu_polygon" className="accordion">
            <h3 id="menu_head_polygon" className="dropdown_head">
              Polygon Properties
            </h3>
            <div id="menu_body_polygon" className="dropdown_body">
              {/* nothing in the panel at the moment */}
            </div>
          </div>
          <div id="menu_help" className="accordion">
            <h3 id="exp_head_6" className="dropdown_head">
              {' '}
              Help{' '}
            </h3>
            <div id="exp_body_6" className="dropdown_body">
              <Help />
            </div>
          </div>
          <Inspector selectedAnnotation={this.props.selectedAnnotation} />
        </menu>
      </div>
    )
  }

  componentDidMount(): void {
    initUIControl()
  }
}

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
        display: 'none'
      },

      '& menu': {
        padding: 0,
        margin: 0,
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
      },
    },
  })
}