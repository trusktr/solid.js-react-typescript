/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as React from 'react'
import $ = require('jquery')
import {withStyles, createStyles, Theme, WithStyles} from '@material-ui/core'
import {panelBorderRadius, btnColor, btnTextColor, triangle} from '../styleVars'

interface Props extends WithStyles<typeof styles> {
  headerText: string
}

class About extends React.Component<Props, {}> {
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
      <div id="menu_about" className={classes.accordion}>
        <h3 className={classes.dropdownHead}>
          <div className={classes.triangle} />
          <span className={classes.headerText}>{this.props.headerText}</span>
        </h3>
        <div className={classes.dropdownBody}>
          {/* Render (i.e. distribute or transclude) children of the Accordion component here. */}
          {this.props.children}
        </div>
      </div>
    )
  }
}

export default withStyles(styles)(About)

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
    headerText: {},
    triangle: {},
  })
}
