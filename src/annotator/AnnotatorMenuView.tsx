/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as React from 'react'
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
import {mergeClasses} from '@mapperai/mapper-themes'
import {withStyles, createStyles, Theme, WithStyles} from '@material-ui/core'
import {
  menuItemSpacing,
  menuMargin,
  menuTopPosition,
  panelBorderRadius,
  btnColor,
  btnTextColor,
  jQueryAccordionItemHeight,
} from './styleVars'
type Annotator = import('./Annotator').Annotator

interface AnnotatorMenuViewProps extends WithStyles<typeof styles> {
  uiMenuVisible: boolean
  layerStatus?: LayerStatusMap
  selectedAnnotation?: Annotation | null
  onSaveAnnotationsJson(): void
  onSaveAnnotationsKML(): void
  annotator: Annotator
}

interface AnnotatorMenuViewState {}

@typedConnect(toProps(AnnotatedSceneState, 'layerStatus'))
class AnnotatorMenuView extends React.Component<AnnotatorMenuViewProps, AnnotatorMenuViewState> {
  constructor(props: AnnotatorMenuViewProps) {
    super(props)
  }

  private onClickDeleteAnnotation = () => {
    this.props.annotator.uiDeleteActiveAnnotation()
  }

  private onClickAddLane = () => {
    this.props.annotator.uiAddAnnotation(AnnotationType.LANE)
  }

  private onClickAddTrafficDevice = () => {
    this.props.annotator.uiAddAnnotation(AnnotationType.TRAFFIC_DEVICE)
  }

  render(): JSX.Element {
    const {classes} = this.props
    return (
      <div id="menu" className={mergeClasses(classes.menu, this.props.uiMenuVisible ? '' : 'hidden')}>
        <menu id="annotationMenu" className="menu">
          {this.props.layerStatus && (
            <LayerManager layerStatus={this.props.layerStatus} useCheckboxes={true} isDraggable={false} />
          )}
          <div id="tools" className={classes.btnGroup}>
            <button className={classes.btn} onClick={this.onClickAddLane}>
              New Lane
            </button>
            <button className={classes.btn} onClick={this.onClickAddTrafficDevice}>
              New Traffic Device
            </button>
            <button className={classes.btn} onClick={this.onClickDeleteAnnotation}>
              Delete Annotation
            </button>
            <button onClick={this.props.onSaveAnnotationsKML} className={classes.btn}>
              Save Annotations as KML
            </button>
            <button onClick={this.props.onSaveAnnotationsJson} className={classes.btn}>
              Save Annotations as JSON
            </button>
          </div>
          <Inspector selectedAnnotation={this.props.selectedAnnotation} />
          <Help />
        </menu>
      </div>
    )
  }
}

export default withStyles(styles)(AnnotatorMenuView)

// eslint-disable-next-line typescript/explicit-function-return-type
function styles(_theme: Theme) {
  return createStyles({
    menu: {
      position: 'absolute',
      right: menuMargin,
      maxHeight: `calc(100% - ${menuTopPosition}px - ${menuMargin}px)`,
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

      '& $btn': {
        width: '100%',
        marginTop: menuItemSpacing,
        height: jQueryAccordionItemHeight,
        textDecoration: 'none',
        outline: 0,
        color: btnTextColor.toHexString(),
        backgroundColor: btnColor.toHexString(),
        border: 0,
        borderRadius: panelBorderRadius,
        fontSize: '12px',
        '&:active': {
          backgroundColor: btnColor
            .clone()
            .darken(5)
            .toHexString(),
          borderColor: btnColor
            .clone()
            .lighten(20)
            .toHexString(),
        },
        '&:hover': {
          backgroundColor: btnColor
            .clone()
            .lighten(5)
            .toHexString(),
          borderColor: btnColor
            .clone()
            .lighten(20)
            .toHexString(),
        },
      },
      '& $btnGroup': {
        textAlign: 'center',
      },
    },
    btn: {},
    btnGroup: {},
  })
}
