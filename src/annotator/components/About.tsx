/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as React from 'react'
import {withStyles, createStyles, Theme, WithStyles} from '@material-ui/core'
import Accordion from './Accordion'

// relative to dist/package/src/annotator/components/About.tsx
import pkgJson = require('../../../../../package.json')

const isDev = process.env.NODE_ENV !== 'production'

interface Props extends WithStyles<typeof styles> {}

class About extends React.Component<Props, {}> {
  render(): JSX.Element {
    const {classes} = this.props

    return (
      <Accordion headerText={`About ${pkgJson.appName}`}>
        {isDev ? (
          <p className={classes.paragraph}>
            <strong>Development environment</strong>
          </p>
        ) : (
          <div />
        )}
        <p className={classes.paragraph}>
          {pkgJson.appName} version {pkgJson.version}
        </p>
        <p className={classes.paragraph}>{pkgJson.description}</p>
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
