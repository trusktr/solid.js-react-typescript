/**
 *  Copyright 2017 Mapper Inc. Part of the mapper-annotator project.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import {LaneSideType, LaneEntryExitType} from 'annotator-entry-ui/LaneAnnotation'

// Get html elements
///////////////////////////////////////////////////////////////////////////////
const laneProp = document.getElementById('lane_prop_1')
const laneConn = document.getElementById('lane_conn')

// Define new elements
///////////////////////////////////////////////////////////////////////////////
const lpLabelsText = ['Lane ID:', 'Lane Width', 'Left Side:', 'Right Side:', 'Entry Type:', 'Exit Type:']
const lpLabelsId = ['lp_id', 'lp_width', 'lp_left_side', 'lp_right_side', 'lp_entry', 'lp_exit']
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

const lpSelectsId = ['lp_select_left', 'lp_select_right', 'lp_select_entry', 'lp_select_exit']
const lpSelectsText = [
	['unknown', '––––––––––––', '–  –  –  –  –  –  –'],
	['unknown', '––––––––––––', '–  –  –  –  –  –  –'],
	['unknown', 'continue ––»»»––', 'stop ––||––'],
	['unknown', 'continue ––»»»––', 'stop ––||––']]
const lpSelectValue = [
	[LaneSideType.UNKNOWN.toString(), LaneSideType.SOLID.toString(), LaneSideType.BROKEN.toString()],
	[LaneSideType.UNKNOWN.toString(), LaneSideType.SOLID.toString(), LaneSideType.BROKEN.toString()],
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
			if (lcSelectsItems.hasOwnProperty(j)) {
				const option = document.createElement("option")
				option.value = lcSelectsItems[i][j]
				option.text = lcSelectsItems[i][j]
				element.appendChild(option)
			}
		}
		lcSelects.push(element)
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

$('#menu_1').accordion({collapsible: true, heightStyle: "content"})
$('#menu_2').accordion({collapsible: true, heightStyle: "content"})
$('#menu_3').accordion({collapsible: true, heightStyle: "content"})
$('#menu_4').accordion({collapsible: true, heightStyle: "content"})
