/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as THREE from "three"
import {TileContents} from "@/mapper-annotated-scene/tile-model/TileContents"

export class TileMessage {
	constructor(
		public origin: THREE.Vector3,
		public utmZoneNumber: number,
		public utmZoneNorthernHemisphere: boolean,
		public contents: TileContents,
	) {}
}
