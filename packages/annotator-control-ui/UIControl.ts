/**
 *  Copyright 2017 Mapper Inc. Part of the mapper-annotator project.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import {LaneType, LaneLineType, LaneLineColor, LaneEntryExitType} from 'annotator-entry-ui/annotations/Lane'
import {TrafficSignType} from 'annotator-entry-ui/annotations/TrafficSign'

// Get html elements
///////////////////////////////////////////////////////////////////////////////
const laneProp = document.getElementById('lane_prop_1')
const trafficSignProp = document.getElementById('traffic_sign_prop_1')
const laneConn = document.getElementById('lane_conn')

// Define new elements
///////////////////////////////////////////////////////////////////////////////
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
const elm = document.createElement('text')
elm.textContent = 'UNKNOWN'
elm.id = 'lp_id_value'
elm.className = 'select_style'
lpSelects.push(elm)
const elementWidth = document.createElement('text')
elementWidth.textContent = 'UNKNOWN'
elementWidth.id = 'lp_width_value'
elementWidth.className = 'select_style'
lpSelects.push(elementWidth)

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

const lcLabelsText = ['From Lane:', 'To Lane:', 'Relation:']
const lcLabelsId = ['lc_from', 'lc_to', 'lc_relation']
const lcLabels: Array<HTMLElement> = []
for (const i in lcLabelsText) {
	if (lcLabelsText.hasOwnProperty(i)) {
		const element = document.createElement('text')
		element.textContent = lcLabelsText[i]
		element.id = lcLabelsId[i]
		element.className = 'label_style'
		lcLabels.push(element)
	}
}

const lcSelectsId = ['lc_select_from', 'lc_select_to', 'lc_select_relation']
const lcSelectsItems = [
	[],
	[],
	['left', 'left reverse', 'right', 'front', 'back']]
const lcSelects: Array<HTMLSelectElement> = []
for (const i in lcSelectsId) {
	if (lcSelectsId.hasOwnProperty(i)) {
		const element = document.createElement('select')
		element.id = lcSelectsId[i]
		element.className = 'select_style'
		for (const j in lcSelectsItems[i]) {
			if (lcSelectsItems[i].hasOwnProperty(j)) {
				const option = document.createElement("option")
				option.value = lcSelectsItems[i][j]
				option.text = lcSelectsItems[i][j]
				element.appendChild(option)
			}
		}
		lcSelects.push(element)
	}
}

const tpLabelsText = ["Traffic sign ID:", "Type:"]
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
const tpSelectsText = [ ['UNKNOWN', 'TRAFFIC_LIGHT', 'STOP', 'YIELD', 'OTHER']]
const tpSelectsValue = [ [TrafficSignType.UNKNOWN.toString(), TrafficSignType.TRAFFIC_LIGHT.toString(),
						 TrafficSignType.STOP.toString(), TrafficSignType.YIELD.toString(), TrafficSignType.OTHER.toString()]]

const tpSelects: Array<HTMLElement> = []

const elementTrafficSignId = document.createElement('text')
elementTrafficSignId.textContent = 'UNKNOWN'
elementTrafficSignId.id = 'tp_id_value'
elementTrafficSignId.className = 'select_style'
tpSelects.push(elementTrafficSignId)

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
if (laneProp)
	for (const i in lpSelects) {
		if (lpSelects.hasOwnProperty(i)) {
			laneProp.appendChild(lpLabels[i])
			laneProp.appendChild(lpSelects[i])
		}
	}

if (laneConn)
	for (const i in lcSelects) {
		if (lcSelects.hasOwnProperty(i)) {
			laneConn.appendChild(lcLabels[i])
			laneConn.appendChild(lcSelects[i])
		}
	}

if (trafficSignProp)
	for (const i in tpSelects) {
		if (tpSelects.hasOwnProperty(i)) {
			trafficSignProp.appendChild(tpLabels[i])
			trafficSignProp.appendChild(tpSelects[i])
		}
	}

$('#menu_1').accordion({collapsible: true, heightStyle: "content"})
$('#menu_2').accordion({collapsible: true, heightStyle: "content"})
$('#menu_3').accordion({collapsible: true, heightStyle: "content"})
$('#menu_4').accordion({collapsible: true, heightStyle: "content"})
$('#menu_5').accordion({collapsible: true, heightStyle: "content"})
