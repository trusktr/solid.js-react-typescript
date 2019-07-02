import * as React from 'react'
import * as _ from 'lodash'
import {Annotation} from '@mapperai/mapper-annotated-scene'
import {withStyles, createStyles, Theme, WithStyles} from '@material-ui/core'
import Paper from '@material-ui/core/Paper/Paper'
import {Typography} from '@material-ui/core'
import {menuItemSpacing} from '../styleVars'
// import Windowable from '../components/Windowable'

export interface IInspectorProps extends WithStyles<typeof styles> {
  selectedAnnotation?: Annotation | null
}

export interface IInspectorState {}

class Inspector extends React.Component<IInspectorProps, IInspectorState> {
  render() {
    const {classes, selectedAnnotation} = this.props
    const PropertiesUI = selectedAnnotation && selectedAnnotation.PropertiesUI

    return (
      <Paper className={classes.root}>
        <Typography variant="h5" gutterBottom>
          {(selectedAnnotation && selectedAnnotation.constructor.name) || 'Inspector'}
        </Typography>

        {!selectedAnnotation ? (
          <Typography variant="body1">Nothing is selected.</Typography>
        ) : (
          <div>
            {PropertiesUI ? (
              <PropertiesUI annotation={selectedAnnotation} />
            ) : (
              <div>No properties for the selected annotation</div>
            )}
          </div>
        )}
      </Paper>
    )
  }
}

// TODO fix Windowable types, it should pass all props, and expose a ref
// const _Inspector = Windowable(withStyles(styles)(Inspector))
const _Inspector = withStyles(styles)(Inspector)

export default _Inspector
export {_Inspector as Inspector}

// eslint-disable-next-line typescript/explicit-function-return-type
function styles(_theme: Theme) {
  const fullWidth = {width: '100%'}

  return createStyles({
    root: {
      ...fullWidth,
      padding: '10px',
      marginTop: menuItemSpacing,
    },
  })
}
