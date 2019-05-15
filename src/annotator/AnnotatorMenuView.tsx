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
  StatusWindowActions,
  AnnotatedSceneActions,
} from '@mapperai/mapper-annotated-scene'
import ImageLightbox from './annotator-image-lightbox/ImageLightbox'
import Help from '../annotator/components/Help'
import {Inspector} from './components/Inspector'
import {mergeClasses} from '@mapperai/mapper-themes'
import {withStyles, createStyles, Theme, WithStyles, Button} from '@material-ui/core'
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

interface AnnotatorMenuViewState {
  windowOpen: boolean
}

@typedConnect(toProps(AnnotatedSceneState, 'layerStatus'))
class AnnotatorMenuView extends React.Component<AnnotatorMenuViewProps, AnnotatorMenuViewState> {
  state = {
    windowOpen: false,
  }

  private statusWindowActions = new StatusWindowActions()
  private sceneActions = new AnnotatedSceneActions()

  private onClickDeleteAnnotation = () => {
    this.props.annotator.uiDeleteActiveAnnotation()
  }

  private onClickAddLane = () => {
    this.props.annotator.uiAddAnnotation(AnnotationType.LANE)
  }

  private onClickAddTrafficDevice = () => {
    this.props.annotator.uiAddAnnotation(AnnotationType.TRAFFIC_DEVICE)
  }

  private onPublishClick = () => {
    this.props.annotator.state.annotationManager!.publish().then()
  }

  private onStatusWindowClick = () => {
    this.statusWindowActions.toggleEnabled()
  }

  private onMenuClick = () => {
    this.sceneActions.toggleUIMenuVisible()
  }

  render(): JSX.Element {
    const {classes} = this.props
    return (
      <>
        <div className={classes.menuControl}>
          <Button
            variant="contained"
            color="primary"
            onClick={this.onPublishClick}
            classes={{root: classes.publishButton!}}
          >
            Publish
          </Button>
          <Button variant="contained" color="primary" onClick={this.onStatusWindowClick}>
            &#x2139;
          </Button>
          <Button variant="contained" color="primary" onClick={this.onMenuClick}>
            &#9776;
          </Button>
        </div>
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
              <button className={classes.btn} onClick={this.props.onSaveAnnotationsKML}>
                Save Annotations as KML
              </button>
              <button className={classes.btn} onClick={this.props.onSaveAnnotationsJson}>
                Save Annotations as JSON
              </button>
            </div>
            <Inspector selectedAnnotation={this.props.selectedAnnotation} />
            <ImageLightbox windowed={false} />
            <Help />
          </menu>
        </div>
      </>
    )
  }
}

export default withStyles(styles)(AnnotatorMenuView)

const numberOfButtons = 3

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

    menuControl: {
      backgroundColor: 'transparent',
      position: 'absolute',
      zIndex: 1,
      top: menuMargin,
      right: menuMargin,
      height: '32px',
      display: 'flex',
      justifyContent: 'space-between',

      '& > *': {
        width: `calc(${100 / numberOfButtons}% - ${menuMargin / 2}px)`,
        '& span': {
          fontSize: '1.5rem',
          lineHeight: '1.5rem',
        },
        '&$publishButton': {
          '& span': {
            fontSize: '1rem',
            lineHeight: '1rem',
          },
        },
      },
    },

    btn: {},
    btnGroup: {},
    publishButton: {},
  })
}
