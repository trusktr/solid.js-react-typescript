/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as THREE from "three"

// The points are assumed to be in TileManager's coordinate system,
// which for now is some form of UTM.
export interface RangeSearch {
	minPoint: THREE.Vector3,
	maxPoint: THREE.Vector3,
}
