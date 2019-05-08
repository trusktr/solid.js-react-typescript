// TODO
// - Split TagSelector to separate module.
// - Place inspector widgets in here (from outside modules) based on annotation selection

import * as React from 'react'
import * as _ from 'lodash'
import {Annotation} from '@mapperai/mapper-annotated-scene'
import {IThemedProperties, ITheme, withStatefulStyles} from '@mapperai/mapper-themes'
import Paper from '@material-ui/core/Paper/Paper'
import {Typography} from '@material-ui/core'

export interface IInspectorProps extends IThemedProperties {
  selectedAnnotation?: Annotation | null
}

export interface IInspectorState {}

// TODO, don't define this here?
type PropertiesUIProps = {
  annotation: Annotation
}

@withStatefulStyles(styles)
export class Inspector extends React.Component<IInspectorProps, IInspectorState> {
  render() {
    const {classes, selectedAnnotation} = this.props

    // TODO fix type
    const PropertiesUI = (selectedAnnotation && (selectedAnnotation.constructor as any).PropertiesUI) as
      | React.ComponentType<PropertiesUIProps>
      | undefined

    return (
      <Paper className={classes!.root}>
        <Typography variant="h4" gutterBottom>
          Inspector
        </Typography>
        <br />
        {!selectedAnnotation ? (
          <Typography variant="h5">Nothing is selected.</Typography>
        ) : (
          <div>
            {PropertiesUI ? (
              <PropertiesUI annotation={selectedAnnotation} />
            ) : (
              <div>No properties for selected annotation</div>
            )}
          </div>
        )}
      </Paper>
    )
  }
}

export default Inspector

// eslint-disable-next-line typescript/explicit-function-return-type
function styles(_theme: ITheme) {
  const fullWidth = {width: '100%'}

  return {
    root: {
      ...fullWidth,
      padding: '10px',
    },
  }
}
