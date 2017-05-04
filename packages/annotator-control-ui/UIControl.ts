/**
 *  Copyright 2017 Mapper Inc. Part of the mapper-annotator project.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import {LaneSideType, LaneEntryExitType} from 'annotator-entry-ui/LaneAnnotation'


// Get html elements
///////////////////////////////////////////////////////////////////////////////
let menu = $("#menu");
let lane_prop = document.getElementById('lane_prop_1');
let lane_conn = document.getElementById('lane_conn');
let tools = document.getElementById('tools');

// Define new elements
///////////////////////////////////////////////////////////////////////////////
let lp_labels_text = [ 'Lane ID:', 'Lane Width', 'Left Side:', 'Right Side:', 'Entry Type:', 'Exit Type:'];
let lp_labels_id = ['lp_id', 'lp_width', 'lp_left_side', 'lp_right_side', 'lp_entry', 'lp_exit'];
let lp_labels = [];
for (let i in lp_labels_text) {
    let elm = document.createElement('text');
    elm.textContent = lp_labels_text[i];
    elm.id = lp_labels_id[i];
    elm.className = 'label_style';
    lp_labels.push(elm);
}

let lp_selects_id = ['lp_select_left', 'lp_select_right', 'lp_select_entry', 'lp_select_exit'];
let lp_selects_text = [
    ['unknown', '––––––––––––', '–  –  –  –  –  –  –'],
    ['unknown', '––––––––––––', '–  –  –  –  –  –  –'],
    ['unknown', 'continue ––»»»––', 'stop ––||––'],
    ['unknown', 'continue ––»»»––', 'stop ––||––']];
let lp_select_value = [
    [LaneSideType.UNKNOWN.toString(), LaneSideType.SOLID.toString(), LaneSideType.BROKEN.toString()],
    [LaneSideType.UNKNOWN.toString(), LaneSideType.SOLID.toString(), LaneSideType.BROKEN.toString()],
    [LaneEntryExitType.UNKNOWN.toString(), LaneEntryExitType.CONTINUE.toString(), LaneEntryExitType.STOP.toString()],
    [LaneEntryExitType.UNKNOWN.toString(), LaneEntryExitType.CONTINUE.toString(), LaneEntryExitType.STOP.toString()]];

let lp_selects = [];
let elm = document.createElement('text');
elm.textContent = 'UNKNOWN';
elm.id = 'lp_id_value';
elm.className = 'select_style';
lp_selects.push(elm);
let elm_width = document.createElement('text')
elm_width.textContent = 'UNKNOWN'
elm_width.id = 'lp_width_value'
elm_width.className = 'select_style'
lp_selects.push(elm_width)

for (let i in lp_selects_id) {
    let elm = document.createElement('select');
    elm.id = lp_selects_id[i];
    elm.className = 'select_style';
    for (let j = 0; j < lp_selects_text[i].length; ++j) {
        let option = document.createElement("option");
        option.value = lp_select_value[i][j];
        option.text = lp_selects_text[i][j];
        elm.appendChild(option);
    }
    lp_selects.push(elm);
}

let lc_labels_text = ['From Lane:', 'To Lane:', 'Relation:'];
let lc_labels_id = ['lc_from', 'lc_to', 'lc_relation'];
let lc_labels = [];
for (let i in lc_labels_text) {
    let elm = document.createElement('text');
    elm.textContent = lc_labels_text[i];
    elm.id = lc_labels_id[i];
    elm.className = 'label_style';
    lc_labels.push(elm);
}

let lc_selects_id = ['lc_select_from', 'lc_select_to', 'lc_select_relation'];
let lc_selects_items = [
    [],//getIds(),
    [],//getIds(),
    ['left', 'left reverse', 'right', 'front', 'back']];
let lc_selects = [];
for (let i in lc_selects_id) {
    let elm = document.createElement('select');
    elm.id = lc_selects_id[i];
    elm.className = 'select_style';
    for (let j in lc_selects_items[i]) {
        let option = document.createElement("option");
        option.value = lc_selects_items[i][j];
        option.text = lc_selects_items[i][j];
        elm.appendChild(option);
    }
    lc_selects.push(elm);
}

// Add elements to the menu panel
///////////////////////////////////////////////////////////////////////////////
for (let i in lp_selects) {
    lane_prop.appendChild(lp_labels[i]);
    lane_prop.appendChild(lp_selects[i]);
}

for (let i in lc_selects) {
    lane_conn.appendChild(lc_labels[i]);
    lane_conn.appendChild(lc_selects[i]);
}

let icons = {
    header: "ui-icon-circle-arrow-e",
    activeHeader: "ui-icon-circle-arrow-s"
};
$('#menu_1').accordion({collapsible : true, heightStyle : "content"})
$('#menu_2').accordion({collapsible : true, heightStyle : "content"})
$('#menu_3').accordion({collapsible : true, heightStyle : "content"})
$('#menu_4').accordion({collapsible : true, heightStyle : "content"})
