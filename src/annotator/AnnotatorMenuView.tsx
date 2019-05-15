/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as React from 'react'
import {pick} from 'lodash'
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
import {mergeClasses as classNames} from '@mapperai/mapper-themes'
import ImageLightbox from './annotator-image-lightbox/ImageLightbox'
import Help from '../annotator/components/Help'
import {Inspector} from './components/Inspector'
import {withStyles, createStyles, Theme, WithStyles, Button, AppBar, Tabs, Tab} from '@material-ui/core'
import {
  menuItemSpacing,
  menuMargin,
  panelBorderRadius,
  btnColor,
  btnTextColor,
  colors,
  jQueryAccordionItemHeight,
  tabBarHeight,
  headerHeight,
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
  tab: number
}

@typedConnect(toProps(AnnotatedSceneState, 'layerStatus'))
class AnnotatorMenuView extends React.Component<AnnotatorMenuViewProps, AnnotatorMenuViewState> {
  state = {
    windowOpen: false,
    tab: 0,
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

  private onTabChange = (_event, tab: number) => {
    this.setState({tab})
  }

  render(): JSX.Element {
    const {classes: c} = this.props
    const {tab} = this.state
    return (
      <div className={c.menu}>
        <div className={c.tabBar}>
          <AppBar color="default" className={c.tabs}>
            <Tabs
              value={tab}
              onChange={this.onTabChange}
              indicatorColor="primary"
              textColor="primary"
              variant="fullWidth"
              // scrollable={true}
              scrollButtons="on"
              classes={{...pick(c, 'indicator')}}
            >
              <Tab classes={{...pick(c, 'label', 'selected')}} className={c.tab} label="Properties" />
              <Tab classes={{...pick(c, 'label', 'selected')}} className={c.tab} label="Layers" />
              <Tab classes={{...pick(c, 'label', 'selected')}} className={c.tab} label="Actions" />
            </Tabs>
          </AppBar>
          <Button variant="contained" color="primary" onClick={this.onMenuClick} className={c.menuToggle}>
            &#9776;
          </Button>
        </div>
        <div className={classNames(this.props.uiMenuVisible && c.hidden, c.menuContent)}>
          {tab === 0 && (
            <>
              <Inspector selectedAnnotation={this.props.selectedAnnotation} />
              <ImageLightbox windowed={false} />
            </>
          )}
          {tab === 1 && this.props.layerStatus && (
            <LayerManager layerStatus={this.props.layerStatus} useCheckboxes={true} isDraggable={false} />
          )}
          {tab === 2 && (
            <>
              <div id="tools" className={c.btnGroup}>
                <button className={c.btn} onClick={this.onClickAddLane}>
                  New Lane
                </button>
                <button className={c.btn} onClick={this.onClickAddTrafficDevice}>
                  New Traffic Device
                </button>
                <button className={c.btn} onClick={this.onClickDeleteAnnotation}>
                  Delete Annotation
                </button>
                <button className={c.btn} onClick={this.props.onSaveAnnotationsKML}>
                  Save Annotations as KML
                </button>
                <button className={c.btn} onClick={this.props.onSaveAnnotationsJson}>
                  Save Annotations as JSON
                </button>
                <button className={c.btn} onClick={this.onPublishClick}>
                  Publish
                </button>
                <button className={c.btn} onClick={this.onStatusWindowClick}>
                  Toggle Info Panel
                </button>
              </div>
              <Help />
            </>
          )}
        </div>
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
      maxHeight: `calc(100vh - ${headerHeight}px - ${menuMargin * 2}px)`,
      width: '250px',
      zIndex: 1,
      top: menuMargin,
      backgroundColor: 'transparent',
      overflow: 'hidden',
      paddingTop: 0,
      borderRadius: panelBorderRadius,

      '& $menuContent': {
        padding: 0,
        margin: 0,
        maxHeight: `calc(100vh - ${headerHeight}px - ${menuMargin * 2}px - ${tabBarHeight}px)`,
        overflowX: 'visible', // visible, but don't scroll
        overflowY: 'auto', // scroll if necessary
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

    tabBar: {
      display: 'flex',

      '& $tabs': {
        width: 'calc(100% - 40px)',
        position: 'static',

        '& $tab': {
          // make tabs smaller than they are designed to be.
          minWidth: 40,
          color: btnTextColor
            .clone()
            .darken(50)
            .toHexString(),

          '&$selected': {
            color: btnTextColor.toHexString(),
          },

          '& $label': {
            // center the tab text in the smaller tabs.
            display: 'inline-block',
            marginLeft: '50%',
            transform: 'translateX(-50%)',
          },
        },

        '& $indicator': {
          backgroundColor: colors.saffron.toHexString(),
        },
      },

      '& $menuToggle': {
        width: 40,
        minWidth: 40,
        borderRadius: 0,
      },
    },

    hidden: {
      display: 'none',
    },

    menuContent: {},
    menuToggle: {},
    tabs: {},
    tab: {},
    selected: {},
    label: {},
    indicator: {},
    btn: {},
    btnGroup: {},
  })
}
