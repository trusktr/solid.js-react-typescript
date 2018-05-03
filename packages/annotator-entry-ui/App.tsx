import * as React from 'react'
import * as ReactDOM from 'react-dom'
import './style.scss'

export default
class App extends React.Component<{}, {}> {

	render() {
		return <React.Fragment>

			<div id="logo">
				<img
					src={__CWD + "/packages/annotator-assets/images/signature_with_arrow_white.png"}
					height="30px"
					width="auto"
				/>
			</div>

			<div id="status_window"></div>

			<div id="menu_control">
				<button id="status_window_control_btn" className="menu_btn"> &#x2139; </button>
				<button id="live_location_control_btn" className="menu_btn"> &#x2388; </button>
				<button id="menu_control_btn" className="menu_btn"> &#9776; </button>
			</div>

			<div id="menu">

				<menu id="annotationMenu" className="menu">

					<div id="tools" className="div_buttons_group">
						<button id="tools_add_lane" className="ui-btn ui-icon-plus ui-btn-icon-left"> New Lane </button>
						<button id="tools_add_traffic_device" className="ui-btn ui-icon-plus ui-btn-icon-left"> New Traffic Device </button>
						<button id="tools_delete" className="ui-btn ui-icon-minus ui-btn-icon-left"> Delete Annotation </button>
						<button id="tools_load" className="ui-btn ui-icon-grid ui-btn-icon-left"> Load Tiles </button>
						<button id="tools_load_trajectory" className="ui-btn ui-icon-grid ui-btn-icon-left"> Load Trajectory </button>
						<button id="tools_load_images" className="ui-btn ui-icon-camera ui-btn-icon-left"> Load Images </button>
						<button id="tools_load_annotation" className="ui-btn ui-icon-edit ui-btn-icon-left"> Load Annotation </button>
						<button id="tools_save" className="ui-btn ui-icon-check ui-btn-icon-left"> Save Annotation </button>
						<button id="tools_export_kml" className="ui-btn ui-icon-location ui-btn-icon-left"> Export KML </button>
					</div>

					<div id="menu_boundary" className="accordion">
						<h3 id="exp_head_1" className="dropdown_head"> Boundary Properties </h3>
						<div id="exp_body_1" className="dropdown_body">
							<div id="boundary_prop" className="fieldset_content_style"></div>
						</div>
					</div>

					<div id="menu_lane" className="accordion">
						<h3 id="exp_head_2" className="dropdown_head"> Lane Properties </h3>
						<div id="exp_body_2" className="dropdown_body">
							<div id="lane_prop" className="fieldset_content_style">
								<div id="lane_prop_1" className="div_properties"></div>
								<div id="lane_prop_2" className="div_glue"> Add Neighbor: </div>
								<div id="lane_prop_3" className="div_buttons_group">
									<button id="lp_add_forward"> &uarr; </button>
								</div>
								<div id="lane_prop_4" className="div_buttons_group">
									<button id="lp_add_left_opposite"> &darr; </button>
									<button id="lp_add_left_same"> &uarr; </button>
									<button id="lp_current" disabled> C </button>
									<button id="lp_add_right_same"> &uarr; </button>
									<button id="lp_add_right_opposite"> &darr; </button>
								</div>
							</div>
						</div>
					</div>
					<div id="menu_connection" className="accordion">
						<h3 id="exp_head_3" className="dropdown_head"> Connection Properties </h3>
						<div id="exp_body_3" className="dropdown_body">
							<div id="connection_prop" className="fieldset_content_style"></div>
						</div>
					</div>
					<div id="menu_traffic_device" className="accordion">
						<h3 id="exp_head_4" className="dropdown_head"> Traffic Device Properties </h3>
						<div id="exp_body_4" className="dropdown_body">
							<div id="traffic_device_prop_1" className="fieldset_content_style"></div>
							<div id="traffic_device_prop_2" className="fieldset_content_style"></div>
						</div>
					</div>
					<div id="menu_territory" className="accordion">
						<h3 id="menu_head_territory" className="dropdown_head"> Territory Properties </h3>
						<div id="menu_body_territory" className="dropdown_body">
							<div id="property_1_territory" className="fieldset_content_style">
								<span className="label_style"> Label </span>
								<input id="input_label_territory" />
							</div>
						</div>
					</div>
					<div id="menu_trajectory" className="accordion">
						<h3 id="exp_head_5" className="dropdown_head"> Trajectory </h3>
						<div id="exp_body_5" className="dropdown_body">
							<div id="trajectory_1" className="fieldset_content_style">
								<span id="tr_add_text" className="label_style"> Add to trajectory </span>
								<button id="tr_add" className="button_inline"> Add </button>
							</div>
							<div id="trajectory_2" className="fieldset_content_style">
								<span id="tr_show_text" className="label_style"> Show trajectory </span>
								<button id="tr_show" className="button_inline"> Show </button>
							</div>
							<div id="trajectory_3" className="fieldset_content_style">
								<button id="save_path" className="button_inline"> Save To File </button>
							</div>
						</div>
					</div>
					<div id="menu_help" className="accordion">
						<h3 id="exp_head_6" className="dropdown_head"> Help </h3>
						<div id="exp_body_6" className="dropdown_body">
							<p className="div_help">
								<strong>Point cloud</strong><br />
								C - Center the camera on the tiles<br />
								R - Reset tilt and compass<br />
								V - Toggle perspective/orthographic view<br />
								h - Hide super tiles/point cloud/annotations<br />
								Shift-click - load points in a super tile; or load an image file<br />
								U - Unload the point cloud<br />
								L - Load all super tiles in point cloud<br />

								<strong>Annotations</strong><br />
								s - Save annotations JSON file as UTM<br />
								S - Save annotations JSON file as Lat/Lon<br />
								m - Save road network waypoints to KML file<br />
								A - Delete all annotations<br />
								X - Toggle translation/rotation editing of traffic devices<br />
								Delete/Backspace - Delete active annotation<br />
								c - Hold to add lane connection; click on the lane to connect<br />
								j - Hold to join two annotations; click on the annotation to join<br />
								f - Hold to add front lane neighbor; click on the front neighbor<br />
								l - Hold to add left lane neighbor; click on the left neighbor<br />
								r - Hold to add right lane neighbor; click on the right neighbor<br />
								F - Flip/Reverse current lane direction<br />
								q - Hold and click to add/remove a conflict or device to/from a connection<br />

								<strong>Annotation Markers</strong><br />
								n - Create new lane<br />
								b - Create new boundary<br />
								t - Create new traffic device<br />
								T - Create new annotator territory<br />
								a - Hold to add annotation markers<br />
								d - Delete last marker<br />
								1-9 - Hold when highlighting a marker to move its neighbors too<br />

								<strong>Images</strong><br />
								Shift-LeftClick - load an image into a new window<br />
								RightClick - unload image from clicked screen<br />

								<strong>Live Mode</strong><br />
								O - Listen/stop listening for live location data<br />
							</p>
						</div>
					</div>
				</menu>

				<menu id="flyThroughMenu" className="menu hidden">
					<button id="pause" className="mdc-button mdc-button--raised">
						<span> Pause </span>
						<i className="material-icons mdc-button__icon" aria-hidden="true"> pause </i>
					</button>
				</menu>

			</div>
		</React.Fragment>
	}

}
