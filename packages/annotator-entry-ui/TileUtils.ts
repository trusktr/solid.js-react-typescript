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
import * as TypeLogger from 'typelogger'

TypeLogger.setLoggerOutput(console as any)
const log = TypeLogger.getLogger(__filename)

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
async function loadTile(filename : string) :  Promise<Models.PointCloudTileMessage> {
	let buffer = await readFile(filename)
	return Models.PointCloudTileMessage.decode(buffer as any)
}

const sampleData = (msg : Models.PointCloudTileMessage, step : number) => {
	if (step <= 0) {
		log.error("Can't sample data. Step should be > 0.")
		return
	}
	
	
	let sampledPoints : Array<number> = []
	let sampledColors : Array<number> = []
	let stride = step * 3
	for (let i=0; i < msg.points.length; i+=stride) {
		sampledPoints.push(msg.points[i])
		sampledPoints.push(msg.points[i+1])
		sampledPoints.push(msg.points[i+2])
		sampledColors.push(msg.colors[i])
		sampledColors.push(msg.colors[i+1])
		sampledColors.push(msg.colors[i+2])
	}
	return [sampledPoints, sampledColors]
}

export class SuperTile {
	
	origin : THREE.Vector3
	pointCloud : THREE.Points
	maxTilesToLoad : number
	samplingStep : number
	
	constructor() {
		this.maxTilesToLoad = 2000
		this.samplingStep = 15
		this.origin = new THREE.Vector3()
	}
	
	/**
	 * Given a path to a dataset it loads all PointCloudTiles computed for display and
	 * merges them into a single super tile.
	 * @param dataset_path
	 */
	async loadFromDataset( datasetPath : string) {
		let points : Array<number> = []
		let colors : Array<number> = []
		let files = Fs.readdirSync(datasetPath)
		let count = 0
		
		for (let i=0; i < files.length; i++) {
			if (count >= this.maxTilesToLoad) {
				break
			}
			
			if (files[i] === 'tile_index.md' || files[i] === '.DS_Store') {
				continue
			}
			
			let msg  = await loadTile(Path.join(datasetPath, files[i]))
			
			if (msg.points.length === 0) {
				continue
			}
			if (count === 0) {
				this.origin.set(msg.originX, msg.originY, msg.originZ)
			}
			
			let [sampledPoints, sampledColors] = sampleData(msg, this.samplingStep)
			
			points = points.concat(sampledPoints)
			colors = colors.concat(sampledColors)
			count++
		}
		
		this.generatePointCloudFromRawData(points, colors)
	}
	
	/**
	 * Convert array of 3d points into a THREE.Point object
	 * @param tile_message
	 */
	generatePointCloudFromRawData(points : Array<number>, inputColors : Array<number>) {
		let geometry = new THREE.BufferGeometry()
		let points_size = points.length
		let positions = new Float32Array(points_size)
		let colors = new Float32Array(inputColors)
		
		for (let i=0; i < points_size; i+=3) {
			let p = this.utmToThreejs(points[i], points[i+1], points[i+2])
			positions[i] = p.x
			positions[i+1] = p.y
			positions[i+2] = p.z
		}
		
		geometry.addAttribute('position', new THREE.BufferAttribute(positions, 3));
		geometry.addAttribute('color', new THREE.BufferAttribute(colors, 3));
		geometry.computeBoundingBox();
		
		const material = new THREE.PointsMaterial( { size: 0.05, vertexColors: THREE.VertexColors } )
		this.pointCloud = new THREE.Points( geometry, material )
	}
	
	
	
	threejsToUtm(point : THREE.Vector3) : THREE.Vector3 {
		let utmPoint = new THREE.Vector3(-point.z, -point.x, point.y)
		 utmPoint.add(this.origin)
		return utmPoint
	}
	
	utmToThreejs(x:number, y:number, z:number) : THREE.Vector3 {
		let tmp = new THREE.Vector3(x, y, z)
		tmp.sub(this.origin)
		return new THREE.Vector3(-tmp.y, tmp.z, -tmp.x)
	}
	
	
	
}




