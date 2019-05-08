/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import {CameraParameters} from './CameraParameters'
import {ImageScreen} from './ImageScreen'

export interface LightboxImage {
  path: string
  imageScreen: ImageScreen
  parameters: CameraParameters
  active: boolean
}
