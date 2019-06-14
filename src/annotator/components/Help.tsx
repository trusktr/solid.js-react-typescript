/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as React from 'react'
import $ = require('jquery')
import {withStyles, createStyles, Theme, WithStyles} from '@material-ui/core'
import {panelBorderRadius, btnColor, btnTextColor, triangle} from '../styleVars'

interface Props extends WithStyles<typeof styles> {}

class Help extends React.Component<Props, {}> {
  componentDidMount() {
    $('.' + this.props.classes.accordion).accordion({
      active: false,
      collapsible: true,
    })
  }

  componentWillUnmount() {
    $('.' + this.props.classes.accordion).accordion('destroy')
  }

  render(): JSX.Element {
    const {classes} = this.props

    return (
      <div id="menu_help" className={classes.accordion}>
        <h3 id="exp_head_6" className={classes.dropdownHead}>
          <div className={classes.triangle} />
          <span className={classes.headerText}>Help</span>
        </h3>
        <div id="exp_body_6" className={classes.dropdownBody}>
          <p className={classes.help}>
            <strong>Point cloud</strong>
            <br />
            <code>R</code> - Reset tilt and compass
            <br />
            <code>V</code> - Toggle perspective and orthographic view
            <br />
            <code>h</code> - Alternately hide the point cloud and annotations
            <br />
            <strong>Annotations</strong>
            <br />
            <code>X</code> - Cycle through available transformation modes (translate, rotate, scale) for the selected
            traffic device
            <br />
            <code>delete/backspace</code> - Delete active annotation
            <br />
            <code>c</code> - Hold to add a connecting lane segment; click on the lane segment to connect
            <br />
            <code>j</code> - Hold to join two annotations; click on the annotation to join
            <br />
            <code>x</code> - Hold and click a marker on a lane segment or boundary to cut it in two
            <br />
            <code>f</code> - Hold to add forward lane neighbor; click on the forward neighbor
            <br />
            <code>l</code> - Hold to add left lane neighbor; click on the left neighbor
            <br />
            <code>r</code> - Hold to add right lane neighbor; click on the right neighbor
            <br />
            <code>F</code> - Flip/Reverse direction of current lane segment, polygon, or boundary
            <br />
            <code>q</code> - Hold and click to add/remove a traffic device to/from a lane segment
            <br />
            <strong>Annotation Markers</strong>
            <br />
            <code>n</code> - Create new lane segment
            <br />
            <code>N</code> - Create new lane segment with same attributes as last lane segment
            <br />
            <code>b</code> - Create new boundary
            <br />
            <code>B</code> - Create new boundary with same attributes as last boundary
            <br />
            <code>t</code> - Create new traffic device
            <br />
            <code>T</code> - Create new traffic device with same attributes as last traffic device
            <br />
            <code>p</code> - Create new polygon
            <br />
            <code>P</code> - Create new polygon with same attributes as last polygon
            <br />
            <code>a</code> - Hold and click to add annotation markers to the end of an annotation
            <br />
            <code>shift-a</code> - Hold and click the edge of a lane segment or boundary to add a marker at that point
            <br />
            <code>alt-a</code> - Hold and click a marker to delete the marker
            <br />
            <code>d</code> - Delete the marker at the end of an annotation
            <br />
            <code>1-9</code> - Hold when highlighting a marker to move its neighbors too
            <br />
            <strong>Images</strong>
            <br />
            <code>shift-click</code> - load an image into a new window
            <br />
            <code>right-click</code> - unload image from clicked screen
            <br />
          </p>
        </div>
      </div>
    )
  }
}

export default withStyles(styles)(Help)

// eslint-disable-next-line typescript/explicit-function-return-type
function styles(_theme: Theme) {
  return createStyles({
    // disable some jQuery UI styles. The only place we're using jQuery UI is in
    // the Help menu accordion.
    '@global': {
      '.ui-state-default, .ui-state-hover': {
        border: 'unset !important' as 'unset',
        background: 'unset !important' as 'unset',
        fontWeight: 'unset !important' as 'unset',
        color: 'unset !important' as 'unset',
      },
    },

    accordion: {
      borderRadius: panelBorderRadius,
      marginBottom: 2,
      backgroundColor: btnColor.toHexString(),
      border: 0,
      color: btnTextColor.toHexString(),
      textAlign: 'left',
      fontSize: 15,
      padding: 0,
      width: 'auto',
      cursor: 'pointer',
    },
    dropdownHead: {
      margin: 3,
      padding: 2,
      fontSize: 12,
      outline: 'none',
      position: 'relative',

      '& $headerText': {
        paddingLeft: 10,
      },

      // get rid of jQuery UI's triangle icon because it is a background image
      // (which means we can't configure its color, size, etc)
      '& .ui-accordion-header-icon': {
        display: 'none!important',
      },

      '& $triangle': {
        ...triangle({size: 4, color: btnTextColor.toHexString()}).right,
        position: 'absolute',
        top: '50%',
        transformOrigin: '30% center',
        transform: 'translate(0%, -50%)',
        transition: 'transform 0.5s',
      },

      '&.ui-state-active': {
        '& $triangle': {
          transform: 'translate(0%, -50%) rotate(90deg)',
        },
      },
    },
    dropdownBody: {
      height: 'auto',
      padding: 5,
      borderRadius: 5,
      backgroundColor: '#faebd7',
      color: '#000',
      display: 'none',
      overflow: 'auto',
    },
    help: {
      marginTop: 2,
    },
    headerText: {},
    triangle: {},
  })
}
