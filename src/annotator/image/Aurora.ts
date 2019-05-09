/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as AsyncFile from 'async-file'
import {AuroraCameraParameters} from './CameraParameters'
import {UtmCoordinateSystem} from '@mapperai/mapper-annotated-scene'
import config from 'annotator-config'

// Convenience functions for Aurora data

const screenDistanceFromOrigin: number = parseFloat(config['image_manager.image.distance_from_camera']) || 1.0

// todo export to json in ImageRegistration app? or just get on read from S3?
const imageWidth = 1920
const imageHeight = 1208

interface AuroraImageMetadata {
  tileId: string
  translation: number[]
  rotation: number[]
}

// Assume we are looking for Aurora data in the form of images and metadata files, sitting
// nearby on the local filesystem.
export function readImageMetadataFile(
  imagePath: string,
  utmCoordinateSystem: UtmCoordinateSystem
): Promise<AuroraCameraParameters> {
  const metadataPath = imagePathToCameraDataPath(imagePath)

  return AsyncFile.readFile(metadataPath, 'ascii').then(text => {
    const metadata = JSON.parse(text) as AuroraImageMetadata

    return new AuroraCameraParameters(
      utmCoordinateSystem,
      screenDistanceFromOrigin,
      imageWidth,
      imageHeight,
      metadata.translation,
      metadata.rotation
    )
  })
}

function imagePathToCameraDataPath(imagePath: string): string {
  return imagePath.replace(/_image\.png$/, '_tile_from_camera.json')
}
