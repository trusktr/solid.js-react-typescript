/**
 *  Copyright 2019 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as THREE from 'three'
import {Coordinate, CoordinateFrame} from '@mapperai/mapper-annotated-scene'

// matches the output of AnnotatedSceneController.updateCurrentLocationStatusMessage()
// example: 563371 E 4183781 N 5.0 alt
const utmRe = /^\s*([\d.]+)\s*E\s*([\d.]+)\s*N\s*([\d.]+)\s*alt\s*$/i

// matches the output of AnnotatedSceneController.updateCurrentLocationStatusMessage()
// example: -122.2803 E 37.7994 N 5.0 alt
const llaRe = /^\s*([+-]?[\d.]+)\s*E\s*([+-]?[\d.]+)\s*N\s*([+-]?[\d.]+)\s*alt\s*$/i

// Google Maps URL
// example: https://www.google.com/maps/@37.7976845,-122.2765837,16.46z
const gmapsRe = /maps\/@([+-]?[\d.]+),([+-]?[\d.]+)/

// OSM URL
// example: https://www.openstreetmap.org/#map=18/37.79589/-122.27284
// example: http://geojson.io/#map=18/37.79458/-122.27310
const osmRe = /#map=\d+\/([+-]?[\d.]+)\/([+-]?[\d.]+)/

// TODO would be nice to get an approximate value based on any objects that are already loaded in the scene
const unknownAltitude = 0

function xyzMatchToVector(match: RegExpMatchArray): THREE.Vector3 {
  return new THREE.Vector3(Number.parseFloat(match[1]), Number.parseFloat(match[2]), Number.parseFloat(match[3]))
}

function latLonMatchToVector(match: RegExpMatchArray): THREE.Vector3 {
  return new THREE.Vector3(Number.parseFloat(match[2]), Number.parseFloat(match[1]), unknownAltitude)
}

export function parseLocationString(str: string): Coordinate | null {
  let match: RegExpMatchArray | null

  match = str.match(utmRe)
  if (match)
    return {
      frame: CoordinateFrame.UTM,
      position: xyzMatchToVector(match),
    }

  match = str.match(llaRe)
  if (match)
    return {
      frame: CoordinateFrame.LLA,
      position: xyzMatchToVector(match),
    }

  match = str.match(gmapsRe)
  if (match)
    return {
      frame: CoordinateFrame.LLA,
      position: latLonMatchToVector(match),
    }

  match = str.match(osmRe)
  if (match)
    return {
      frame: CoordinateFrame.LLA,
      position: latLonMatchToVector(match),
    }

  return null
}
