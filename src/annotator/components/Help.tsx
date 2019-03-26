/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as React from 'react'

export default class Help extends React.Component<{}, {}> {
  render(): JSX.Element {
    return (
      <p className="div_help">
        <strong>Point cloud</strong>
        <br />R - Reset tilt and compass
        <br />V - Toggle perspective/orthographic view
        <br />h - Hide super tiles/point cloud/annotations
        <br />Shift-click - load an image file
        <br />
        <strong>Annotations</strong>
        <br />X - Cycle through available transformation modes (translate, rotate, scale) for the selected annotation
        <br />Delete/Backspace - Delete active annotation
        <br />c - Hold to add lane connection; click on the lane to connect
        <br />j - Hold to join two annotations; click on the annotation to join
        <br />f - Hold to add front lane neighbor; click on the front neighbor
        <br />l - Hold to add left lane neighbor; click on the left neighbor
        <br />r - Hold to add right lane neighbor; click on the right neighbor
        <br />F - Flip/Reverse current lane or boundary direction
        <br />q - Hold and click to add/remove a traffic device to/from a connection
        <br />
        <strong>Annotation Markers</strong>
        <br />n - Create new lane
        <br />N - Create new lane with same attributes as last lane
        <br />b - Create new boundary
        <br />B - Create new boundary with same attributes as last boundary
        <br />t - Create new traffic device
        <br />T - Create new traffic device with same attributes as last traffic device
        <br />p - Create new annotator polygon
        <br />P - Create new annotator polygon with same attributes as last polygon
        <br />a - Hold and click mouse to add annotation markers
        <br />d - Delete last marker
        <br />1-9 - Hold when highlighting a marker to move its neighbors too
        <br />
        <strong>Images</strong>
        <br />Shift-LeftClick - load an image into a new window
        <br />RightClick - unload image from clicked screen
        <br />
      </p>
    )
  }
}
