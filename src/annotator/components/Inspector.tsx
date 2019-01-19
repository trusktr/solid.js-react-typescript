// TODO
// - Split TagSelector to separate module.
// - Place inspector widgets in here (from outside modules) based on annotation selection

import * as React from 'react'
import * as _ from 'lodash'
import { Creatable } from 'react-select'
import { Annotation, typedConnect, toProps, AnnotatedSceneState } from '@mapperai/mapper-annotated-scene'
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
const defaultTags: string[] = [
  // TODO get default tags from a file provided by the user
]

const allTagOptions: SelectOptions = []

defaultTags.forEach(tag =>
  allTagOptions.push({
    value: tag,
    label: tag
  })
)

export interface IInspectorProps extends IThemedProperties {
  selectedAnnotation?: Annotation | null
  allAnnotationTags?: string[]
}

type SelectOption = { value: string, label: string }

export interface IInspectorState {
  availableTags: SelectOption[]
}

@withStatefulStyles(styles)
@typedConnect(toProps(
  AnnotatedSceneState,
  'allAnnotationTags',
))
export class Inspector extends React.Component<
  IInspectorProps,
  IInspectorState
> {
  constructor(props: IInspectorProps) {
    super(props)

    this.state = {
      availableTags: []
    }
  }

  private tagSelectRef = React.createRef<Creatable>()

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

  private checkTagIsValid = (inputValue: string) => {
    return !!inputValue.match(/^[A-Za-z0-9_-]+$/)
  }

  componentDidUpdate(oldProps: IInspectorProps) {
    if (oldProps.allAnnotationTags !== this.props.allAnnotationTags) {
      const availableTags = Array.from(new Set(defaultTags.concat(
        (this.props.allAnnotationTags || [])
      )))
        .map(tag => ({ value: tag, label: tag }))

      this.setState({ availableTags })
    }
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
          <Creatable
            isMulti
            ref={this.tagSelectRef}
            className={classes!.select}
            placeholder="Tags..."
            defaultValue={currentTags}
            options={this.state.availableTags}
            menuPlacement="auto"
            closeMenuOnSelect={false}
            onChange={this.onTagChange}
            onMenuClose={this.onSelectMenuClosed}
            onKeyDown={this.onSelectKeyDown}
            isValidNewOption={this.checkTagIsValid}
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