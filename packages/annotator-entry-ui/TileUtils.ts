/**
 *  Copyright 2017 Mapper Inc. Part of the mapper-annotator project.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
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
export function readFile(filename : string) : Promise<Buffer> {
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
			colors[i] = 1
			colors[i+1] = 1
			colors[i+2] = 1
		}

		geometry.addAttribute('position', new THREE.BufferAttribute(positions, 3));
		geometry.addAttribute('color', new THREE.BufferAttribute(colors, 3));
		geometry.computeBoundingBox();
	
		const material = new THREE.PointsMaterial( { size: 0.05, vertexColors: THREE.VertexColors } )
		let particles = new THREE.Points( geometry, material )
		
		return particles
}
