/**
 *  Copyright 2017 Mapper Inc. Part of the mapper-annotator project.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import {LaneType, LaneLineType, LaneLineColor, LaneEntryExitType} from 'annotator-entry-ui/annotations/Lane'
import {TrafficDeviceType} from 'annotator-entry-ui/annotations/TrafficDevice'
import {BoundaryType, BoundaryColor} from 'annotator-entry-ui/annotations/Boundary'
import {ConnectionType} from "annotator-entry-ui/annotations/Connection";

// Get html elements
///////////////////////////////////////////////////////////////////////////////
const boundaryProp = document.getElementById('boundary_prop')
const laneProp = document.getElementById('lane_prop_1')
const trafficDeviceProp = document.getElementById('traffic_device_prop_1')
const connectionProp = document.getElementById('connection_prop')

// Define new elements
///////////////////////////////////////////////////////////////////////////////
const bpLabelsText = ['Boundary ID:', 'Boundary Type:', 'Boundary Color']
const bpLabelsId = ['bp_id', 'bp_type', 'bp_color']
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
	['UNKNOWN', 'CURB', 'SOLID', 'DASHED', 'DOUBLE_SOLID', 'DOUBLE_DASHED', 'SOLID_DASHED', 'DASHED_SOLID', 'OTHER'],
	['UNKNOWN', 'NONE', 'WHITE', 'YELLOW', 'RED', 'BLUE', 'GREEN', 'OTHER']]
const bpSelectsValue = [
	[BoundaryType.UNKNOWN.toString(), BoundaryType.CURB.toString(), BoundaryType.SOLID.toString(),
		BoundaryType.DASHED.toString(), BoundaryType.DOUBLE_SOLID.toString(), BoundaryType.DOUBLE_DASHED.toString(),
		BoundaryType.SOLID_DASHED.toString(), BoundaryType.DASHED_SOLID.toString(), BoundaryType.OTHER.toString()],
	[BoundaryColor.UNKNOWN.toString(), BoundaryColor.NONE.toString(), BoundaryColor.WHITE.toString(),
		BoundaryColor.YELLOW.toString(), BoundaryColor.RED.toString(), BoundaryColor.BLUE.toString(),
		BoundaryColor.GREEN.toString(), BoundaryColor.OTHER.toString()]]

const bpSelects: Array<HTMLElement> = []
const eBoundaryId = document.createElement('text')
eBoundaryId.textContent = 'UNKNOWN'
eBoundaryId.id = 'bp_id_value'
eBoundaryId.className = 'select_style'
bpSelects.push(eBoundaryId)

for (const i in bpSelectsId) {
	if (bpSelectsId.hasOwnProperty(i)) {
		const element = document.createElement('select')
		element.id = bpSelectsId[i]
		element.className = 'select_style'
		for (let j = 0; j < bpSelectsText[i].length; ++j) {
			const option = document.createElement("option")
			option.value = bpSelectsValue[i][j]
			option.text = bpSelectsText[i][j]
			element.appendChild(option)
		}
		bpSelects.push(element)
	}
}

// ------------------------------------------------------------------------------------------------------------------
const lpLabelsText = ['Lane ID:', 'Lane Width:', 'Type:', 'Left Line Type:', 'Left Line Color:',
	'Right Line Type:', 'Right Line Color', 'Entry Type:', 'Exit Type:']
const lpLabelsId = ['lp_id', 'lp_width', 'lp_lane_type', 'lp_left_line', 'lp_left_color',
	'lp_right_line', 'lp_right_color', 'lp_entry', 'lp_exit']

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

const lpSelectsId = ['lp_select_type', 'lp_select_left_type', 'lp_select_left_color',
	'lp_select_right_type', 'lp_select_right_color', 'lp_select_entry', 'lp_select_exit']
const lpSelectsText = [
	['UNKNOWN', 'ALL_VEHICLES', 'MOTOR_VEHICLES', 'CAR_ONLY', 'TRUCK_ONLY', 'BUS_ONLY', 'BIKE_ONLY', 'PEDESTRIAN_ONLY', 'PARKING', 'CROSSWALK', 'OTHER'],
	['UNKNOWN', '––––––––––––', '–  –  –  –  –  –  –'],
	['UNKNOWN', 'WHITE', 'YELLOW', 'RED', 'BLUE', 'OTHER'],
	['UNKNOWN', '––––––––––––', '–  –  –  –  –  –  –'],
	['UNKNOWN', 'WHITE', 'YELLOW', 'RED', 'BLUE', 'OTHER'],
	['UNKNOWN', 'continue ––»»»––', 'stop ––||––'],
	['UNKNOWN', 'continue ––»»»––', 'stop ––||––']]
const lpSelectValue = [
	[LaneType.UNKNOWN.toString(), LaneType.ALL_VEHICLES.toString(), LaneType.MOTOR_VEHICLES.toString(), LaneType.CAR_ONLY.toString(),
	LaneType.TRUCK_ONLY.toString(), LaneType.BUS_ONLY.toString(), LaneType.BIKE_ONLY.toString(), LaneType.PEDESTRIAN_ONLY.toString(),
	LaneType.PARKING.toString(), LaneType.CROSSWALK.toString(), LaneType.OTHER.toString()],
	[LaneLineType.UNKNOWN.toString(), LaneLineType.SOLID.toString(), LaneLineType.DASHED.toString()],
	[LaneLineColor.UNKNOWN.toString(), LaneLineColor.WHITE.toString(), LaneLineColor.YELLOW.toString(),
		LaneLineColor.RED.toString(), LaneLineColor.BLUE.toString(), LaneLineColor.OTHER.toString()],
	[LaneLineType.UNKNOWN.toString(), LaneLineType.SOLID.toString(), LaneLineType.DASHED.toString()],
	[LaneLineColor.UNKNOWN.toString(), LaneLineColor.WHITE.toString(), LaneLineColor.YELLOW.toString(),
		LaneLineColor.RED.toString(), LaneLineColor.BLUE.toString(), LaneLineColor.OTHER.toString()],
	[LaneEntryExitType.UNKNOWN.toString(), LaneEntryExitType.CONTINUE.toString(), LaneEntryExitType.STOP.toString()],
	[LaneEntryExitType.UNKNOWN.toString(), LaneEntryExitType.CONTINUE.toString(), LaneEntryExitType.STOP.toString()]]

const lpSelects: Array<HTMLElement> = []
const eLaneId = document.createElement('text')
eLaneId.textContent = 'UNKNOWN'
eLaneId.id = 'lp_id_value'
eLaneId.className = 'select_style'
lpSelects.push(eLaneId)
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
			const option = document.createElement("option")
			option.value = lpSelectValue[i][j]
			option.text = lpSelectsText[i][j]
			element.appendChild(option)
		}
		lpSelects.push(element)
	}
}

// ------------------------------------------------------------------------------------------------------------------
const cpLabelsText = ['Connection ID', 'Type:', "Traffic Device:"]
const cpLabelsId = ['cp_id', 'cp_type', 'cp_device']
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

const cpSelectsId = ['cp_select_type', 'cp_select_device']
const cpSelectsText = [
	['UNKNOWN', 'YIELD', 'ALTERNATE', 'RYG_LIGHT', 'RYG_LEFT_ARROW_LIGHT', 'OTHER'],
	['UNKNOWN', 'STOP', 'YIELD', 'RYG_LIGHT', 'RYG_LIGHT_LEFT_ARROW', 'OTHER']]
const cpSelectsValue = [
	[ConnectionType.UNKNOWN.toString(), ConnectionType.YIELD.toString(), ConnectionType.ALTERNATE.toString(),
		ConnectionType.RYG_LIGHT.toString(), ConnectionType.RYG_LEFT_ARROW_LIGHT.toString(), ConnectionType.OTHER.toString()],
	[TrafficDeviceType.UNKNOWN.toString(), TrafficDeviceType.STOP.toString(), TrafficDeviceType.YIELD.toString(),
		TrafficDeviceType.RYG_LIGHT.toString(), TrafficDeviceType.RYG_LEFT_ARROW_LIGHT.toString(),
		TrafficDeviceType.OTHER.toString()]]

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
			const option = document.createElement("option")
			option.value = cpSelectsValue[i][j]
			option.text = cpSelectsText[i][j]
			element.appendChild(option)
		}
		cpSelects.push(element)
	}
}

// ------------------------------------------------------------------------------------------------------------------
const tpLabelsText = ["Traffic device ID:", "Type:"]
const tpLabelsId = ["tp_id", "tp_type"]
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
const tpSelectsText = [ ['UNKNOWN', 'STOP', 'YIELD', 'RYG_LIGHT', 'RYG_LEFT_ARROW_LIGHT', 'OTHER']]
const tpSelectsValue = [
	[TrafficDeviceType.UNKNOWN.toString(), TrafficDeviceType.STOP.toString(), TrafficDeviceType.YIELD.toString(),
		TrafficDeviceType.RYG_LIGHT.toString(), TrafficDeviceType.RYG_LEFT_ARROW_LIGHT.toString(),
		TrafficDeviceType.OTHER.toString()]]

const tpSelects: Array<HTMLElement> = []

const elementTrafficDeviceId = document.createElement('text')
elementTrafficDeviceId.textContent = 'UNKNOWN'
elementTrafficDeviceId.id = 'tp_id_value'
elementTrafficDeviceId.className = 'select_style'
tpSelects.push(elementTrafficDeviceId)

for (const i in tpSelectsId) {
	if (tpSelectsId.hasOwnProperty(i)) {
		const element = document.createElement('select')
		element.id = tpSelectsId[i]
		element.className = 'select_style'
		for (let j = 0; j < tpSelectsText[i].length; ++j) {
			const option = document.createElement("option")
			option.value = tpSelectsValue[i][j]
			option.text = tpSelectsText[i][j]
			element.appendChild(option)
		}
		tpSelects.push(element)
	}
}

// Add elements to the menu panel
///////////////////////////////////////////////////////////////////////////////
if (boundaryProp)
	for (const i in bpSelects) {
		if (bpSelects.hasOwnProperty(i)) {
			boundaryProp.appendChild(bpLabels[i])
			boundaryProp.appendChild(bpSelects[i])
		}
	}

if (laneProp)
	for (const i in lpSelects) {
		if (lpSelects.hasOwnProperty(i)) {
			laneProp.appendChild(lpLabels[i])
			laneProp.appendChild(lpSelects[i])
		}
	}

if (connectionProp)
	for (const i in cpSelects) {
		if (cpSelects.hasOwnProperty(i)) {
			connectionProp.appendChild(cpLabels[i])
			connectionProp.appendChild(cpSelects[i])
		}
	}

if (trafficDeviceProp)
	for (const i in tpSelects) {
		if (tpSelects.hasOwnProperty(i)) {
			trafficDeviceProp.appendChild(tpLabels[i])
			trafficDeviceProp.appendChild(tpSelects[i])
		}
	}

const accordionOptions = {collapsible: true, active: false, heightStyle: "content"}
const menuIds = [
	'#menu_boundary',
	'#menu_help',
	'#menu_lane',
	'#menu_connection',
	'#menu_territory',
	'#menu_traffic_device',
	'#menu_trajectory',
]
menuIds.forEach(domId => $(domId).accordion(accordionOptions))
