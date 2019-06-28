/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as React from 'react'
import {withStyles, createStyles, Theme, WithStyles} from '@material-ui/core'
import Accordion from './Accordion'

interface Props extends WithStyles<typeof styles> {}

class Help extends React.Component<Props, {}> {
  render(): JSX.Element {
    const {classes} = this.props

    return (
      <Accordion headerText="Help">
        <p className={classes.paragraph}>
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
      </Accordion>
    )
  }
}

export default withStyles(styles)(Help)

// eslint-disable-next-line typescript/explicit-function-return-type
function styles(_theme: Theme) {
  return createStyles({
    paragraph: {
      marginTop: 2,
    },
  })
}
