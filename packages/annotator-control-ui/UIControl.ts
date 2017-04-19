/**
 * Created by andrei on 4/17/17.
 */

import * as $ from 'jquery'

// Get html elements
///////////////////////////////////////////////////////////////////////////////
let menu = $("#menu");
let lane_prop = document.getElementById('lane_prop');
let lane_conn = document.getElementById('lane_conn');
let tools = document.getElementById('tools');

// Define new elements
///////////////////////////////////////////////////////////////////////////////
let lp_labels_text = ['Left Side:', 'Right Side:', 'Entry Type:', 'Exit Type:', 'Lane ID:'];
let lp_labels_id = ['lp_left_side', 'lp_right_side', 'lp_entry', 'lp_exit', 'lp_id'];
let lp_labels = [];
for (let i in lp_labels_text) {
    let elm = document.createElement('text');
    elm.textContent = lp_labels_text[i];
    elm.id = lp_labels_id[i];
    elm.className = 'label_style';
    lp_labels.push(elm);
}

let lp_selects_id = ['lp_select_left', 'lp_select_right', 'lp_select_entry', 'lp_select_exit'];
let lp_selects_items = [
    ['unknown', '––––––––––––', '–  –  –  –  –  –  –', '• • • • • • •'],
    ['unknown', '––––––––––––', '–  –  –  –  –  –  –', '• • • • • • •'],
    ['unknown', 'continue ––»»»––', 'stop ––||––'],
    ['unknown', 'continue ––»»»––', 'stop ––||––']];
let lp_selects = [];
for (let i in lp_selects_id) {
    let elm = document.createElement('select');
    elm.id = lp_selects_id[i];
    elm.className = 'select_style';
    for (let j in lp_selects_items[i]) {
        let option = document.createElement("option");
        option.value = lp_selects_items[i][j];
        option.text = lp_selects_items[i][j];
        elm.appendChild(option);
    }
    lp_selects.push(elm);
}
let elm = document.createElement('text');
elm.textContent = 'UNKNOWN';
elm.id = 'lp_id_value';
elm.className = 'select_style';
lp_selects.push(elm);


let lp_discard = document.createElement('button');
lp_discard.textContent = 'Discard';
lp_discard.id = 'lp_discard';
lp_discard.className = 'button_style';

let lp_save = document.createElement('button');
lp_save.id = 'lp_save';
lp_save.textContent = 'Save';
lp_save.className = 'button_style';

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

let lc_selects_id = ['lc_select_from', 'lc_select_tp', 'lc_select_relation'];
let lc_selects_items = [
    [],//getIds(),
    [],//getIds(),
    ['left', 'right', 'front', 'back']];
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

let lc_cancel = document.createElement('button');
lc_cancel.textContent = 'Cancel';
lc_cancel.id = 'lc_cancel';
lc_cancel.className = 'button_style';

let lc_add = document.createElement('button');
lc_add.id = 'lp_add';
lc_add.textContent = 'Add';
lc_add.className = 'button_style';

let tools_new_lane = document.createElement('text');
tools_new_lane.textContent = 'New Lane:';
tools_new_lane.id = 'tools_new_lane';
tools_new_lane.className = 'label_style';

let tools_direction = document.createElement('text');
tools_direction.textContent = 'Reverse Direction:';
tools_direction.id = 'tools_direction';
tools_direction.className = 'label_style';

let tools_select_new_lane = document.createElement('select');
tools_select_new_lane.id = 'tools_select_new_lane';
tools_select_new_lane.className = 'select_style';
for (let option of []) {
    let elm = document.createElement("option");
    elm.value = option;
    elm.text = option;
    tools_select_new_lane.appendChild(elm);
}

let tools_direction_box = document.createElement('input');
tools_direction_box.className = 'select_style';
tools_direction_box.type = 'checkbox';
tools_direction_box.id = 'tools_direction_box';

let tools_add = document.createElement('button');
tools_add.id = 'tools_add';
tools_add.textContent = 'Add';
tools_add.className = 'button_style';

// Add elements to the menu panel
///////////////////////////////////////////////////////////////////////////////
for (let i in lp_selects) {
    lane_prop.appendChild(lp_labels[i]);
    lane_prop.appendChild(lp_selects[i]);
}
lane_prop.appendChild(lp_discard);
lane_prop.appendChild(lp_save);

for (let i in lc_selects) {
    lane_conn.appendChild(lc_labels[i]);
    lane_conn.appendChild(lc_selects[i]);
}
lane_conn.appendChild(lc_cancel);
lane_conn.appendChild(lc_add);

tools.appendChild(tools_new_lane);
tools.appendChild(tools_select_new_lane);
tools.appendChild(tools_direction);
tools.appendChild(tools_direction_box);
tools.appendChild(tools_add);