/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as AsyncFile from "async-file"
import * as sizeOf from 'image-size'
import {AuroraCameraParameters} from "./CameraParameters"
import {UtmInterface} from "../UtmInterface";

// Convenience functions for Aurora data

interface AuroraImageMetadata {
	'tileId': string
	'translation': number[]
	'rotation': number[]
}

interface ImageInfo { // 'image-size' shamefully doesn't export this
	width: number
	height: number
	type: string
}

// Assume we are looking for Aurora data in the form of images and metadata files, sitting
// nearby on the local filesystem.
export function readImageMetadataFile(imagePath: string, utmInterface: UtmInterface): Promise<AuroraCameraParameters> {
	const metadataPath = imagePathToCameraDataPath(imagePath)
	return new Promise((resolve: (imageInfo: ImageInfo) => void, reject: (reason?: Error) => void): void => {
		sizeOf(imagePath, function (err: Error, dimensions: ImageInfo): void {
			if (err)
				reject(err)
			else
				resolve(dimensions)
		})
	}).then(imageInfo => {
		return AsyncFile.readFile(metadataPath, 'ascii')
			.then(text => {
				const metadata = JSON.parse(text) as AuroraImageMetadata
				return new AuroraCameraParameters(
					utmInterface,
					metadata.tileId,
					imageInfo.width,
					imageInfo.height,
					metadata.translation,
					metadata.rotation
				)
			})
	})
}

function imagePathToCameraDataPath(imagePath: string): string {
	return imagePath.replace(/_image\.png$/, '_tile_from_camera.json')
}
