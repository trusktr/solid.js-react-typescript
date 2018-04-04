/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as AsyncFile from "async-file"
import {AuroraCameraParameters} from "./CameraParameters"
import {UtmInterface} from "../UtmInterface";

// Convenience functions for Aurora data

interface AuroraImageMetadata {
	'tileId': string
	'translation': number[]
	'rotation': number[]
}

// Assume we are looking for Aurora data in the form of images and metadata files, sitting
// nearby on the local filesystem.
export function readImageMetadataFile(imagePath: string, utmInterface: UtmInterface): Promise<AuroraCameraParameters> {
	const metadataPath = imagePathToCameraDataPath(imagePath)
	return AsyncFile.readFile(metadataPath, 'ascii')
		.then(text => {
			const metadata = JSON.parse(text) as AuroraImageMetadata
			return new AuroraCameraParameters(
				utmInterface,
				metadata.tileId,
				metadata.translation,
				metadata.rotation
			)
		})
}

function imagePathToCameraDataPath(imagePath: string): string {
	return imagePath.replace(/_image\.png$/, '_tile_from_camera.json')
}
