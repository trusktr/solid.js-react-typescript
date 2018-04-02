/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as THREE from 'three'

export interface CameraParameters {
	screenPosition: THREE.Vector3,
	cameraOrigin: THREE.Vector3,
}

export interface ImaginaryCameraParameters extends CameraParameters {}

export interface AuroraCameraParameters extends CameraParameters {}
