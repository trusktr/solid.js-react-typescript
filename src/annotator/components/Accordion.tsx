import * as React from 'react'
import {withStyles, createStyles, Theme, WithStyles} from '@material-ui/core'

export interface IdProps extends WithStyles<typeof styles> {}

export interface IdState {}

class Id extends React.Component<IdProps, IdState> {
  render() {
    const {classes} = this.props

    return (
      <div className={classes.root}>
        <span className={classes.label}>ID:</span>
      </div>
    )
  }
}

export default withStyles(styles)(Id)

// eslint-disable-next-line typescript/explicit-function-return-type
function styles(_theme: Theme) {
  return createStyles({
    root: {
      color: 'white',
    },
    label: {
      fontWeight: 'bold',
    },
    id: {
      background: 'rgba(0, 0, 0, 0.2)',
    },
  })
}
