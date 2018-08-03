/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import {Annotation} from '../annotations/AnnotationBase'

export interface TileContents {}
export class NullTileContents implements TileContents {}
export class PointCloudTileContents implements TileContents {
	constructor(
		public points: number[],
		public colors: number[],
	) {}
}
export class AnnotationTileContents implements TileContents {
	constructor(
		public annotations: Annotation[],
	) {}
}
