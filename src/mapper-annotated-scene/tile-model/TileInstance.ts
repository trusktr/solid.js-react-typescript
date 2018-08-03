/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import {TileIndex} from './TileIndex'
import {LayerId} from '../../types/TypeAlias'

export class TileInstance {
	constructor(
		public tileIndex: TileIndex,
		public layerId: LayerId,
		public url: string
	) { }
}
