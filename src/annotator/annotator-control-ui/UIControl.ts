/**
 *  Copyright 2017 Mapper Inc. Part of the mapper-annotator project.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import {
  ConnectionType,
  BoundaryType,
  BoundaryColor,
  TrafficDeviceType,
  LaneType,
  LaneLineType,
  LaneLineColor,
} from '@mapperai/mapper-annotated-scene'

export default function initUIControl(): void {
  // Get html elements
  /// ////////////////////////////////////////////////////////////////////////////
  const boundaryProp = document.getElementById('boundary_prop')
  const laneProp = document.getElementById('lane_prop_1')
  const trafficDeviceProp = document.getElementById('traffic_device_prop_1')
  const connectionProp = document.getElementById('connection_prop')
  // Define new elements
  /// ////////////////////////////////////////////////////////////////////////////
  const bpLabelsText = ['Boundary Type:', 'Boundary Color']
  const bpLabelsId = ['bp_type', 'bp_color']
  const bpLabels: Array<HTMLElement> = []

  for (const i in bpLabelsText) {
    if (bpLabelsText.hasOwnProperty(i)) {
      const e = document.createElement('text')

      e.textContent = bpLabelsText[i]
      e.id = bpLabelsId[i]
      e.className = 'label_style'
      bpLabels.push(e)
    }
  }

  const bpSelectsId = ['bp_select_type', 'bp_select_color']
  const bpSelectsText = [
    [
      'UNKNOWN',
      'CURB',
      'SOLID',
      'DASHED',
      'DOUBLE_SOLID',
      'DOUBLE_DASHED',
      'SOLID_DASHED',
      'DASHED_SOLID',
      'OTHER'
    ],
    ['UNKNOWN', 'NONE', 'WHITE', 'YELLOW', 'RED', 'BLUE', 'GREEN', 'OTHER']
  ]
  const bpSelectsValue = [
    [
      BoundaryType.UNKNOWN.toString(),
      BoundaryType.CURB.toString(),
      BoundaryType.SOLID.toString(),
      BoundaryType.DASHED.toString(),
      BoundaryType.DOUBLE_SOLID.toString(),
      BoundaryType.DOUBLE_DASHED.toString(),
      BoundaryType.SOLID_DASHED.toString(),
      BoundaryType.DASHED_SOLID.toString(),
      BoundaryType.OTHER.toString()
    ],
    [
      BoundaryColor.UNKNOWN.toString(),
      BoundaryColor.NONE.toString(),
      BoundaryColor.WHITE.toString(),
      BoundaryColor.YELLOW.toString(),
      BoundaryColor.RED.toString(),
      BoundaryColor.BLUE.toString(),
      BoundaryColor.GREEN.toString(),
      BoundaryColor.OTHER.toString()
    ]
  ]
  const bpSelects: Array<HTMLElement> = []

  for (const i in bpSelectsId) {
    if (bpSelectsId.hasOwnProperty(i)) {
      const element = document.createElement('select')

      element.id = bpSelectsId[i]
      element.className = 'select_style'

      for (let j = 0; j < bpSelectsText[i].length; ++j) {
        const option = document.createElement('option')

        option.value = bpSelectsValue[i][j]
        option.text = bpSelectsText[i][j]
        element.appendChild(option)
      }

      bpSelects.push(element)
    }
  }

  // ------------------------------------------------------------------------------------------------------------------
  const lpLabelsText = [
    'Lane Width:',
    'Type:',
    'Left Line Type:',
    'Left Line Color:',
    'Right Line Type:',
    'Right Line Color',
  ]
  const lpLabelsId = [
    'lp_width',
    'lp_lane_type',
    'lp_left_line',
    'lp_left_color',
    'lp_right_line',
    'lp_right_color',
  ]
  const lpLabels: Array<HTMLElement> = []

  for (const i in lpLabelsText) {
    if (lpLabelsText.hasOwnProperty(i)) {
      const elm = document.createElement('text')

      elm.textContent = lpLabelsText[i]
      elm.id = lpLabelsId[i]
      elm.className = 'label_style'
      lpLabels.push(elm)
    }
  }

  const lpSelectsId = [
    'lp_select_type',
    'lp_select_left_type',
    'lp_select_left_color',
    'lp_select_right_type',
    'lp_select_right_color',
  ]
  const lpSelectsText = [
    [
      'UNKNOWN',
      'ALL_VEHICLES',
      'MOTOR_VEHICLES',
      'CAR_ONLY',
      'TRUCK_ONLY',
      'BUS_ONLY',
      'BIKE_ONLY',
      'PEDESTRIAN_ONLY',
      'PARKING',
      'CROSSWALK',
      'TRACKED_VEHICLES',
      'OTHER'
    ],
    ['UNKNOWN', 'NONE', '––––––––––––', '–  –  –  –  –  –  –', 'CURB', 'ROAD_EDGE'],
    ['UNKNOWN', 'WHITE', 'YELLOW', 'RED', 'BLUE', 'OTHER'],
    ['UNKNOWN', 'NONE', '––––––––––––', '–  –  –  –  –  –  –', 'CURB', 'ROAD_EDGE'],
    ['UNKNOWN', 'WHITE', 'YELLOW', 'RED', 'BLUE', 'OTHER'],
  ]
  const lpSelectValue = [
    [
      LaneType.UNKNOWN.toString(),
      LaneType.ALL_VEHICLES.toString(),
      LaneType.MOTOR_VEHICLES.toString(),
      LaneType.CAR_ONLY.toString(),
      LaneType.TRUCK_ONLY.toString(),
      LaneType.BUS_ONLY.toString(),
      LaneType.BIKE_ONLY.toString(),
      LaneType.PEDESTRIAN_ONLY.toString(),
      LaneType.PARKING.toString(),
      LaneType.CROSSWALK.toString(),
      LaneType.TRACKED_VEHICLES.toString(),
      LaneType.OTHER.toString()
    ],
    [
      LaneLineType.UNKNOWN.toString(),
      LaneLineType.NONE.toString(),
      LaneLineType.SOLID.toString(),
      LaneLineType.DASHED.toString(),
      LaneLineType.CURB.toString(),
      LaneLineType.ROAD_EDGE.toString()
    ],
    [
      LaneLineColor.UNKNOWN.toString(),
      LaneLineColor.WHITE.toString(),
      LaneLineColor.YELLOW.toString(),
      LaneLineColor.RED.toString(),
      LaneLineColor.BLUE.toString(),
      LaneLineColor.OTHER.toString()
    ],
    [
      LaneLineType.UNKNOWN.toString(),
      LaneLineType.NONE.toString(),
      LaneLineType.SOLID.toString(),
      LaneLineType.DASHED.toString(),
      LaneLineType.CURB.toString(),
      LaneLineType.ROAD_EDGE.toString()
    ],
    [
      LaneLineColor.UNKNOWN.toString(),
      LaneLineColor.WHITE.toString(),
      LaneLineColor.YELLOW.toString(),
      LaneLineColor.RED.toString(),
      LaneLineColor.BLUE.toString(),
      LaneLineColor.OTHER.toString()
    ],
  ]
  const lpSelects: Array<HTMLElement> = []

  const eLaneWidth = document.createElement('text')

  eLaneWidth.textContent = 'UNKNOWN'
  eLaneWidth.id = 'lp_width_value'
  eLaneWidth.className = 'select_style'
  lpSelects.push(eLaneWidth)

  for (const i in lpSelectsId) {
    if (lpSelectsId.hasOwnProperty(i)) {
      const element = document.createElement('select')

      element.id = lpSelectsId[i]
      element.className = 'select_style'

      for (let j = 0; j < lpSelectsText[i].length; ++j) {
        const option = document.createElement('option')

        option.value = lpSelectValue[i][j]
        option.text = lpSelectsText[i][j]
        element.appendChild(option)
      }

      lpSelects.push(element)
    }
  }

  // ------------------------------------------------------------------------------------------------------------------
  const cpLabelsText = [
    'Connection ID',
    'Type:',
    'Left Line Type:',
    'Left Line Color:',
    'Right Line Type:',
    'Right Line Color'
  ]
  const cpLabelsId = [
    'cp_id',
    'cp_type',
    'cp_left_line',
    'cp_left_color',
    'cp_right_line',
    'cp_right_color'
  ]
  const cpLabels: Array<HTMLElement> = []

  for (const i in cpLabelsText) {
    if (cpLabelsText.hasOwnProperty(i)) {
      const element = document.createElement('text')

      element.textContent = cpLabelsText[i]
      element.id = cpLabelsId[i]
      element.className = 'label_style'
      cpLabels.push(element)
    }
  }

  const cpSelectsId = [
    'cp_select_type',
    'cp_select_left_type',
    'cp_select_left_color',
    'cp_select_right_type',
    'cp_select_right_color'
  ]
  // prettier-ignore
  const cpSelectsText = [
    [
      'UNKNOWN',
      'ALL_VEHICLES',
      'MOTOR_VEHICLES',
      'CAR_ONLY',
      'TRUCK_ONLY',
      'BUS_ONLY',
      'BIKE_ONLY',
      'PEDESTRIAN_ONLY',
      'PARKING',
      'CROSSWALK',
      'TRACKED_VEHICLES',
      'OTHER'
    ],
    ['UNKNOWN', 'NONE', '––––––––––––', '–  –  –  –  –  –  –', 'CURB', 'ROAD_EDGE'],
    ['UNKNOWN', 'WHITE', 'YELLOW', 'RED', 'BLUE', 'OTHER'],
    ['UNKNOWN', 'NONE', '––––––––––––', '–  –  –  –  –  –  –', 'CURB', 'ROAD_EDGE'],
    ['UNKNOWN', 'WHITE', 'YELLOW', 'RED', 'BLUE', 'OTHER'],
  ]
  const cpSelectsValue = [
    [
      ConnectionType.UNKNOWN.toString(),
      ConnectionType.ALL_VEHICLES.toString(),
      ConnectionType.MOTOR_VEHICLES.toString(),
      ConnectionType.CAR_ONLY.toString(),
      ConnectionType.TRUCK_ONLY.toString(),
      ConnectionType.BUS_ONLY.toString(),
      ConnectionType.BIKE_ONLY.toString(),
      ConnectionType.PEDESTRIAN_ONLY.toString(),
      ConnectionType.PARKING.toString(),
      ConnectionType.CROSSWALK.toString(),
      ConnectionType.TRACKED_VEHICLES.toString(),
      ConnectionType.OTHER.toString()
    ],
    [
      LaneLineType.UNKNOWN.toString(),
      LaneLineType.NONE.toString(),
      LaneLineType.SOLID.toString(),
      LaneLineType.DASHED.toString(),
      LaneLineType.CURB.toString(),
      LaneLineType.ROAD_EDGE.toString()
    ],
    [
      LaneLineColor.UNKNOWN.toString(),
      LaneLineColor.WHITE.toString(),
      LaneLineColor.YELLOW.toString(),
      LaneLineColor.RED.toString(),
      LaneLineColor.BLUE.toString(),
      LaneLineColor.OTHER.toString()
    ],
    [
      LaneLineType.UNKNOWN.toString(),
      LaneLineType.NONE.toString(),
      LaneLineType.SOLID.toString(),
      LaneLineType.DASHED.toString(),
      LaneLineType.CURB.toString(),
      LaneLineType.ROAD_EDGE.toString()
    ],
    [
      LaneLineColor.UNKNOWN.toString(),
      LaneLineColor.WHITE.toString(),
      LaneLineColor.YELLOW.toString(),
      LaneLineColor.RED.toString(),
      LaneLineColor.BLUE.toString(),
      LaneLineColor.OTHER.toString()
    ]
  ]
  const cpSelects: Array<HTMLElement> = []
  const eConnectionId = document.createElement('text')

  eConnectionId.textContent = 'UNKNOWN'
  eConnectionId.id = 'cp_id_value'
  eConnectionId.className = 'select_style'
  cpSelects.push(eConnectionId)

  for (const i in cpSelectsId) {
    if (cpSelectsId.hasOwnProperty(i)) {
      const element = document.createElement('select')

      element.id = cpSelectsId[i]
      element.className = 'select_style'

      for (let j = 0; j < cpSelectsText[i].length; ++j) {
        const option = document.createElement('option')

        option.value = cpSelectsValue[i][j]
        option.text = cpSelectsText[i][j]
        element.appendChild(option)
      }

      cpSelects.push(element)
    }
  }

  // ------------------------------------------------------------------------------------------------------------------
  const tpLabelsText = ['Type:']
  const tpLabelsId = ['tp_type']
  const tpLabels: Array<HTMLElement> = []

  for (const i in tpLabelsText) {
    if (tpLabelsText.hasOwnProperty(i)) {
      const element = document.createElement('text')

      element.textContent = tpLabelsText[i]
      element.id = tpLabelsId[i]
      element.className = 'select_style'
      tpLabels.push(element)
    }
  }

  const tpSelectsId = ['tp_select_type']
  const tpSelectsText = [
    ['UNKNOWN', 'STOP', 'YIELD', 'RYG_LIGHT', 'RYG_LEFT_ARROW_LIGHT', 'OTHER']
  ]
  const tpSelectsValue = [
    [
      TrafficDeviceType.UNKNOWN.toString(),
      TrafficDeviceType.STOP.toString(),
      TrafficDeviceType.YIELD.toString(),
      TrafficDeviceType.RYG_LIGHT.toString(),
      TrafficDeviceType.RYG_LEFT_ARROW_LIGHT.toString(),
      TrafficDeviceType.OTHER.toString()
    ]
  ]
  const tpSelects: Array<HTMLElement> = []

  for (const i in tpSelectsId) {
    if (tpSelectsId.hasOwnProperty(i)) {
      const element = document.createElement('select')

      element.id = tpSelectsId[i]
      element.className = 'select_style'

      for (let j = 0; j < tpSelectsText[i].length; ++j) {
        const option = document.createElement('option')

        option.value = tpSelectsValue[i][j]
        option.text = tpSelectsText[i][j]
        element.appendChild(option)
      }

      tpSelects.push(element)
    }
  }

  // Add elements to the menu panel
  /// ////////////////////////////////////////////////////////////////////////////
  if (boundaryProp) {
    for (const i in bpSelects) {
      if (bpSelects.hasOwnProperty(i)) {
        boundaryProp.appendChild(bpLabels[i])
        boundaryProp.appendChild(bpSelects[i])
      }
    }
  }

  if (laneProp) {
    for (const i in lpSelects) {
      if (lpSelects.hasOwnProperty(i)) {
        laneProp.appendChild(lpLabels[i])
        laneProp.appendChild(lpSelects[i])
      }
    }
  }

  if (connectionProp) {
    for (const i in cpSelects) {
      if (cpSelects.hasOwnProperty(i)) {
        connectionProp.appendChild(cpLabels[i])
        connectionProp.appendChild(cpSelects[i])
      }
    }
  }

  if (trafficDeviceProp) {
    for (const i in tpSelects) {
      if (tpSelects.hasOwnProperty(i)) {
        trafficDeviceProp.appendChild(tpLabels[i])
        trafficDeviceProp.appendChild(tpSelects[i])
      }
    }
  }

  const accordionOptions = {
    collapsible: true,
    active: false,
    heightStyle: 'content'
  }
  const menuIds = [
    '#menu_boundary',
    '#menu_help',
    '#menu_lane',
    '#menu_connection',
    '#menu_polygon',
    '#menu_traffic_device'
  ]

  menuIds.forEach(domId => $(domId).accordion(accordionOptions))
}