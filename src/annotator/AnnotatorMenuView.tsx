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
import About from './components/About'
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
import DatGui from './components/DatGui'
import {DragDropContext, Draggable, Droppable} from 'react-beautiful-dnd'

import getLogger from '../util/Logger'

const log = getLogger(__filename)

type Annotator = import('./Annotator').Annotator

type TabName = 'Layers' | 'Properties' | 'Actions'

// this controls the order of the tabs
// prettier-ignore
const AvailableTabs: TabName[] = [
  'Layers',
  'Properties',
  'Actions'
]

interface AnnotatorMenuViewProps extends WithStyles<typeof styles> {
  uiMenuVisible: boolean
  layerStatus?: LayerStatusMap
  selectedAnnotation?: Annotation | null
  onSaveAnnotationsJson(): void
  onSaveAnnotationsGeoJSON(): void
  onSaveAnnotationsKML(): void
  annotator: Annotator
}

interface AnnotatorMenuViewState {
  windowOpen: boolean
  selectedTab: number
}

@typedConnect(toProps(AnnotatedSceneState, 'layerStatus'))
class AnnotatorMenuView extends React.Component<AnnotatorMenuViewProps, AnnotatorMenuViewState> {
  state = {
    windowOpen: false,
    selectedTab: AvailableTabs.indexOf('Layers'), // Layers tab open by default
  }

  setTab(tabName: TabName) {
    this.setState({selectedTab: AvailableTabs.indexOf(tabName)})
  }

  private statusWindowActions = new StatusWindowActions()
  private sceneActions = new AnnotatedSceneActions()

  private onClickAddBoundary = () => {
    this.props.annotator.uiAddAnnotation(AnnotationType.Boundary)
  }

  private onClickAddLaneSegment = () => {
    this.props.annotator.uiAddAnnotation(AnnotationType.LaneSegment)
  }

  private onClickAddPolygon = () => {
    this.props.annotator.uiAddAnnotation(AnnotationType.Polygon)
  }

  private onClickAddTrafficDevice = () => {
    this.props.annotator.uiAddAnnotation(AnnotationType.TrafficDevice)
  }

  private onClickAddBox = () => {
    this.props.annotator.uiAddAnnotation(AnnotationType.Box)
  }

  private onPublishClick = () => {
    this.props.annotator.state.annotationManager!.publish().then()
  }

  private onStatusWindowClick = () => {
    this.statusWindowActions.toggleEnabled()
  }

  private onMenuToggle = () => {
    this.sceneActions.toggleUIMenuVisible()
  }

  private onTabChange = (_, selectedTab: number) => {
    this.setState({selectedTab})
  }

  private jumpToLocationHelpText = 'Jump to a coordinate or annotation'

  private onJumpToLocationFocus = (event: React.FocusEvent<HTMLInputElement>) => {
    const target = event.target as HTMLInputElement
    if (target.value === this.jumpToLocationHelpText) target.value = ''
  }

  private onJumpToLocationBlur = (event: React.FocusEvent<HTMLInputElement>) => {
    const target = event.target as HTMLInputElement
    if (!target.value) target.value = this.jumpToLocationHelpText
  }

  private onJumpToLocation = (event: React.KeyboardEvent<HTMLInputElement>) => {
    // TODO This event has already been handled by Annotator.setKeys() which we don't want. Figure out how push this handler to the front of the queue; and don't propagate to others.

    if (event.key !== 'Enter') return

    const target = event.target as HTMLInputElement
    const location = target.value
    if (!location) return

    if (this.props.annotator.jumpTo(location)) {
      // On success, reset the <input> field to its default state.
      target.value = this.jumpToLocationHelpText
      target.blur()
    } else {
      log.info(`can't jump to "${location}"`)
    }
  }

  private onDragEnd = () => {}

  render(): JSX.Element {
    const {classes: c} = this.props
    const {selectedTab} = this.state

    return (
      <div className={c.menu}>
        <div className={c.tabBar}>
          <AppBar color="default" className={c.tabs}>
            <Tabs
              value={selectedTab}
              onChange={this.onTabChange}
              indicatorColor="primary"
              textColor="primary"
              variant="fullWidth"
              // scrollable={true}
              scrollButtons="on"
              classes={{...pick(c, 'indicator')}}
            >
              {AvailableTabs.map(tabName => (
                <Tab key={tabName} classes={{...pick(c, 'label', 'selected')}} className={c.tab} label={tabName} />
              ))}
            </Tabs>
          </AppBar>
          <Button variant="contained" color="primary" onClick={this.onMenuToggle} className={c.menuToggle}>
            &#9776;
          </Button>
        </div>
        <DragDropContext onDragStart={() => {}} onDragEnd={this.onDragEnd} onDragUpdate={() => {}}>
          <div className={classNames(!this.props.uiMenuVisible && c.hidden, c.menuContent)}>
            {AvailableTabs[selectedTab] === 'Properties' ? (
              <Droppable droppableId={'0'}>
                {provided => (
                  <div {...provided.droppableProps} ref={provided.innerRef}>
                    <Draggable draggableId={'inspector'} index={0}>
                      {provided => (
                        <div {...provided.draggableProps} {...provided.dragHandleProps} ref={provided.innerRef}>
                          <Inspector selectedAnnotation={this.props.selectedAnnotation} />
                        </div>
                      )}
                    </Draggable>
                    <Draggable draggableId={'lightbox'} index={1}>
                      {provided => (
                        <div {...provided.draggableProps} {...provided.dragHandleProps} ref={provided.innerRef}>
                          <ImageLightbox
                          // windowed={false}
                          />
                        </div>
                      )}
                    </Draggable>
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            ) : null}

            {AvailableTabs[selectedTab] === 'Layers' && this.props.layerStatus ? (
              <>
                <LayerManager
                  classes={{root: c.layerManager}}
                  layerStatus={this.props.layerStatus}
                  useCheckboxes={true}
                  isDraggable={false}
                />
                <DatGui classes={{root: c.datGui}} />
              </>
            ) : null}

            {AvailableTabs[selectedTab] === 'Actions' ? (
              <>
                <div id="tools" className={c.btnGroup}>
                  <About />
                  <button className={c.btn} onClick={this.onClickAddLaneSegment}>
                    New Lane Segment
                  </button>
                  <button className={c.btn} onClick={this.onClickAddTrafficDevice}>
                    New Traffic Device
                  </button>
                  <button className={c.btn} onClick={this.onClickAddBoundary}>
                    New Boundary
                  </button>
                  <button className={c.btn} onClick={this.onClickAddPolygon}>
                    New Polygon
                  </button>
                  <button className={c.btn} onClick={this.onClickAddBox}>
                    New Box
                  </button>
                  <input
                    className={c.input}
                    size={36}
                    defaultValue={this.jumpToLocationHelpText}
                    onFocus={this.onJumpToLocationFocus}
                    onBlur={this.onJumpToLocationBlur}
                    onKeyUp={this.onJumpToLocation}
                  />
                  <button className={c.btn} onClick={this.props.onSaveAnnotationsJson}>
                    Export Annotations as JSON (UTM)
                  </button>
                  <button className={c.btn} onClick={this.props.onSaveAnnotationsGeoJSON}>
                    Export Annotations as GeoJSON (LLA)
                  </button>
                  <button className={c.btn} onClick={this.props.onSaveAnnotationsKML}>
                    Export Annotations as KML
                  </button>
                  <button className={c.btn} onClick={this.onPublishClick}>
                    Publish to Meridian
                  </button>
                  <button className={c.btn} onClick={this.onStatusWindowClick}>
                    Toggle Info Panel
                  </button>
                </div>
                <Help />
              </>
            ) : null}
          </div>
        </DragDropContext>
      </div>
    )
  }
}

export type AnnotatorMenuViewInner = AnnotatorMenuView

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

    layerManager: {
      marginTop: menuItemSpacing,
    },

    datGui: {
      marginTop: menuItemSpacing,
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
    input: {},
  })
}
