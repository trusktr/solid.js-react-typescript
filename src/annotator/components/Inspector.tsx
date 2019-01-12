// TODO
// - Split TagSelector to separate module.
// - Place inspector widgets in here (from outside modules) based on annotation selection

import * as React from 'react'
import * as _ from 'lodash'
import Select from 'react-select'
import { Annotation } from '@mapperai/mapper-annotated-scene'
import {
  IThemedProperties,
  ITheme,
  withStatefulStyles
} from '@mapperai/mapper-themes'
import Paper from '@material-ui/core/Paper/Paper'
import { Typography } from '@material-ui/core'
import getLogger from '../../util/Logger'

const log = getLogger(__filename)
log.info('Inspector module')

type SelectOptions = Array<{
  value: string
  label: string
}>

// prettier-ignore
const allTags = [
  'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen',
  'eighteen',
]

const allTagOptions: SelectOptions = []

allTags.forEach(tag =>
  allTagOptions.push({
    value: tag,
    label: tag
  })
)

export interface IInspectorProps extends IThemedProperties {
  selectedAnnotation?: Annotation | null
}

export interface IInspectorState {}

@withStatefulStyles(styles)
export class Inspector extends React.Component<
  IInspectorProps,
  IInspectorState
> {
  constructor(props: IInspectorProps, context: any) {
    super(props, context)
    this.state = {}
  }

  private tagSelectRef = React.createRef<Select>()

  private onTagChange = (options: SelectOptions, _): void => {
    const annotation = this.props.selectedAnnotation
    if (!annotation) return

    annotation.tags = options.map((option: SelectOptions[0]) => {
      return option.value
    })

    annotation.checkDirty()
  }

  private onSelectMenuClosed = () => {
    if (!this.tagSelectRef.current) return
    this.tagSelectRef.current.blur()
  }

  private onSelectKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void | false => {
    // prevent keys from triggerering scene events while focused on the select
    // box (f.e. f.e. pressing arrow keys to select options won't move the scene
    // camera, pressing escape the first time closes the select box, pressing
    // escape the second time after the select box is unfocused unselects the
    // current annotation)
    event.nativeEvent.stopImmediatePropagation()
  }

  render() {
    const { classes, selectedAnnotation } = this.props

    const currentTags: SelectOptions = []

    if (selectedAnnotation) {
      selectedAnnotation.tags.forEach(tag =>
        currentTags.push({
          value: tag,
          label: tag
        })
      )
    }

    return (
      <Paper className={classes!.root}>
        <Typography variant="h4" gutterBottom>Inspector</Typography>
        <br/>
        {!selectedAnnotation ? (
          <Typography variant="h5">Nothing is selected.</Typography>
        ) : (
          <Select
            isMulti
            ref={this.tagSelectRef}
            className={classes!.select}
            placeholder="Tags..."
            defaultValue={currentTags}
            options={allTagOptions}
            menuPlacement="auto"
            closeMenuOnSelect={false}
            onChange={this.onTagChange}
            onMenuClose={this.onSelectMenuClosed}
            onKeyDown={this.onSelectKeyDown}
          />
        )}
      </Paper>
    )
  }
}

export default Inspector

function styles(_theme: ITheme) {
  const fullWidth = { width: '100%' }

  return {
    root: {
      ...fullWidth,
      padding: '10px',
    },
    select: {
      ...fullWidth
    }
  }
}