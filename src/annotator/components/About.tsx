/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as React from 'react'
import {withStyles, createStyles, Theme, WithStyles} from '@material-ui/core'
import Accordion from './Accordion'

interface Props extends WithStyles<typeof styles> {}

class About extends React.Component<Props, {}> {
  render(): JSX.Element {
    const {classes} = this.props

    return (
      <Accordion headerText={`About ${process.env.APP_NAME}`}>
        {process.env.isDev ? (
          <p className={classes.paragraph}>
            <strong>Development environment</strong>
          </p>
        ) : (
          <div />
        )}
        <p className={classes.paragraph}>
          {process.env.APP_NAME} version {process.env.APP_VERSION}
        </p>
        <p className={classes.paragraph}>{process.env.APP_DESCRIPTION}</p>
      </Accordion>
    )
  }
}

export default withStyles(styles)(About)

// eslint-disable-next-line typescript/explicit-function-return-type
function styles(_theme: Theme) {
  return createStyles({
    paragraph: {
      marginTop: 2,
    },
  })
}
