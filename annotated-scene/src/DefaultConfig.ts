type BoundingBox = [number, number, number, number, number, number]
type Vector3 = [number, number, number]
type FPS = 'device' | number

class AnnotatedSceneDefaultConfig {

	// application initialization
	'startup.point_cloud_bounding_box': BoundingBox = [0, 0, 0, 0, 0, 0]
	'startup.camera_offset': Vector3 = [0, 400, 200]
	'startup.render.fps': FPS = 'device' // 'device' means maximum for the device. Specify a number for custom fps.
	'startup.background_color': string = '#444444'
	'startup.show_stats_module': boolean = true
	'startup.show_status_panel': boolean = true

	// parameters for loading a tile
	'tile_manager.utm_tile_scale': Vector3 = [8, 8, 8] // conversion from tile index numbers to physical dimensions
	'tile_manager.super_tile_scale': Vector3 = [16, 8, 16] // ditto; must contain multiples of utm_tile_scale
	'tile_manager.initial_super_tiles_to_load': number = 8
	'tile_manager.maximum_super_tiles_to_load': number = 10000
	'tile_manager.maximum_points_to_load': number = 1000000
	'tile_manager.maximum_point_density': number | null = null // points per meter; null or 0 for infinite density
	'tile_manager.trim_points_above_ground.height': number | null = null // discard points above a given height; null to keep all points
	'tile_manager.sampling_step': number = 1
	'tile_manager.stats_display.enable': boolean = false
	'tile_manager.maximum_annotations_to_load': number = 1000 // …when loading tiled annotations

	// retrieving tiles from a remote service
	'tile_client.service.health_check.interval.seconds': number = 3
	'tile_client.service.host': string = 'localhost'
	'tile_client.service.port': number = 30123

	// annotator controls
	'annotator.add_points_to_estimated_ground_plane': boolean = true
	'annotator.ground_plane_opacity_on_hover': number = 0.0 // [0.0 .. 1.0] display the invisible ground plane while interacting with it
	'annotator.draw_bounding_box': boolean = false
	'annotator.axes_helper_length': number = 10
	'annotator.compass_rose_length': number = 50
	'annotator.point_render_size': number = 1.0
	'annotator.area_of_interest.enable': boolean = false
	'annotator.area_of_interest.size': Vector3 = [50, 50, 50]
	'annotator.grid_size': number = 1000
	'annotator.grid_unit': number = 100

}

export default new AnnotatedSceneDefaultConfig()
