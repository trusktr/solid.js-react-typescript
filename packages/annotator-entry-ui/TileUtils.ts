/**
 * Created by alonso on 4/9/17.
 */

import * as Fs from 'fs'
import * as Path from 'path'
import * as AsyncFile from 'async-file'
import * as THREE from 'three'
import * as MapperProtos from '@mapperai/mapper-models'
import Models = MapperProtos.com.mapperai.models

/**
 * This opens a binary file for reading
 * @param filename
 * @returns {Promise<Buffer>}
 */
function readFile(filename : string) : Promise<Buffer> {
	return AsyncFile.readFile(filename)
}


/**
 * Load a point cloud tile message from a proto binary file
 * @param filename
 * @returns {Promise<com.mapperai.models.PointCloudTileMessage>}
 */
export async function loadTile(filename : string) :  Promise<Models.PointCloudTileMessage> {
	let buffer = await readFile(filename)
	
	let tile_message = Models.PointCloudTileMessage.decode(buffer as any)
	
	return tile_message
}

const TranslateAndSamplePoints = (points : Array<number>, offset : Array<number>, step : number) : Array<number> => {
	let point_step = step * 3
	let transformed_points : Array<number> = []
	for (let i=0; i < points.length; i+=point_step) {
		transformed_points.push(points[i]-offset[0])
		transformed_points.push(points[i+1]-offset[1])
		transformed_points.push(points[i+2]-offset[2])
	}
	
	return transformed_points
}

/**
 * Given a path to a dataset it loads all PointCloudTiles computed for display and
 * merges them into a single tile.
 * @param dataset_path
 * @returns {Array<number>}
 */
export async function loadFullDataset(dataset_path : string) : Promise<Array<number>> {
	let all_points : Array<number> = []

	let files = Fs.readdirSync(dataset_path)
	let map_origin : Array<number> = []
	let tile_message
	let total_active_tiles = 5000
	
	for (let i=0; i < files.length; i++) {
		if (i >= total_active_tiles) {
			break
		}
		
		if (files[i] != 'tile_index.md' && files[i] != '.DS_Store') {
			tile_message  = await loadTile(Path.join(dataset_path, files[i]))
			
			if (map_origin.length == 0) {
				map_origin = [tile_message.originX, tile_message.originY, tile_message.originZ]
			}
			
			let new_points = TranslateAndSamplePoints(tile_message.points, map_origin, 15)
			all_points = all_points.concat(new_points)
		}
		
	}
	
	return all_points
}


/**
 * Convert tile message to Points object
 * @param tile_message
 * @returns {THREE.Points}
 */
export function generatePointCloudFromRawData(points : Array<number>) : THREE.Points {
		let geometry = new THREE.BufferGeometry()
		let points_size = points.length
		let positions = new Float32Array(points_size)
		let colors = new Float32Array(points_size)
	
		let base_point : Array<number> = [points[0], points[1], points[2]]
		
		for (let i=0; i < points_size; i+=3) {
			const x = points[i] - base_point[0]
			const y = points[i+1] - base_point[1]
			const z = points[i+2] - base_point[2]
			positions[i] = -y
			positions[i+1] = z
			positions[i+2] = -x
			colors[i] = 0
			colors[i+1] = 0
			colors[i+2] = 1
		}

		geometry.addAttribute('position', new THREE.BufferAttribute(positions, 3));
		geometry.addAttribute('color', new THREE.BufferAttribute(colors, 3));
		geometry.computeBoundingBox();
	
		const material = new THREE.PointsMaterial( { size: 0.05, vertexColors: THREE.VertexColors } )
		let particles = new THREE.Points( geometry, material )
		
		return particles
}

// const generatePointCloudGeometry = (points) => {
// 	log.info('Starting point cloud render particles')
//
//
// 	let geometry = new THREE.BufferGeometry();
// 	let num_points = points.size()
// 	let positions = new Float32Array(num_points * 3)
// 	let colors = new Float32Array(num_points * 3)
//
//
// 	const base_point = Object.assign({},scanPoints.get(0)),
// 			{x: xOffset, y: yOffset, z: zOffset} = basePoint
//
// 		adjustedPoints = scanPoints.map(point => new ScanPoint(Object.assign({}, point, {
// 			x: point.x - xOffset,
// 			y: point.y - yOffset,
// 			z: point.z - zOffset
// 		}))) as List<ScanPoint>
//
// 		const
// 			{min, max} = adjustedPoints.reduce(({min, max}, {z}) => ({
// 				min: Math.min(z, min),
// 				max: Math.max(z, max)
// 			}), {min: Number.MAX_SAFE_INTEGER, max: Number.MIN_SAFE_INTEGER}),
// 			heightRange = max - min
//
// 		adjustedPoints.forEach((point, index) => {
// 			const
// 				{x, y, z} = point,
// 				zColorAdjustment = (z - min) / heightRange,
// 				rgb = hsvConvert((1.0 - (zColorAdjustment)) * 360,1,1)
//
// 			positions[index * 3] = -y
// 			positions[index * 3 + 1] = z
// 			positions[index * 3 + 2] = -x
//
// 			const
// 				rgbColor = [rgb[0] / 255,rgb[1] / 255,rgb[2] / 255],
// 				pointColor = new (THREE.Color as any)(...rgbColor)
// 			pointColor.toArray(colors as any,index * 3)
//
//
// 		})
//
// 		geometry.addAttribute('position', new THREE.BufferAttribute(positions, 3));
// 		geometry.addAttribute('color', new THREE.BufferAttribute(colors, 3));
// 		geometry.computeBoundingBox();
// 	}
//
// 	const
// 		outPoints = adjustedPoints && adjustedPoints.toArray()
//
// 	//log.info(`adjusted points`,outPoints,colors)
// 	return {geometry,colors,positions,basePoint: outPoints && outPoints[0],points: outPoints};
// }
//
// /**
//  * Render the cloud geometry
//  *
//  * @param points
//  * @param scene
//  * @param camera
//  */
// renderPoints = (points = this.props.points,scene = this.state.scene,camera = this.state.camera) => {
//
// 	//log.debug(`Render points`,points,scene)
// 	if (!points || !scene) {
// 		return
// 	}
//
// 	const
// 		{geometry,points:adjustedPoints,basePoint} = this.generatePointCloudGeometry(points),
// 		material = new THREE.PointsMaterial( { size: 0.05, vertexColors: THREE.VertexColors } ),
// 		particles = new THREE.Points( geometry, material );
//
// 	camera.applyMatrix( new THREE.Matrix4().makeTranslation( 0,0,60 ) );
// 	camera.applyMatrix( new THREE.Matrix4().makeRotationX( -0.26 ) )
// 	scene.add( particles );
//
// 	return {geometry,basePoint}
// }