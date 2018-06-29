/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import {TileManager} from "@/annotator-entry-ui/tile/TileManager"
import {UtmCoordinateSystem} from "@/annotator-entry-ui/UtmCoordinateSystem"
import {SuperTile} from "@/annotator-entry-ui/tile/SuperTile"
import {TileServiceClient} from "@/annotator-entry-ui/tile/TileServiceClient"
import config from "@/config"
import {CoordinateFrameType} from "@/annotator-entry-ui/geometry/CoordinateFrame"
import {TileIndex} from "@/annotator-entry-ui/model/TileIndex"
import {AnnotationSuperTile} from "@/annotator-entry-ui/tile/AnnotationSuperTile"
import {UtmTile} from "@/annotator-entry-ui/tile/UtmTile"
import {TileInstance} from "@/annotator-entry-ui/model/TileInstance"
import {AnnotationTileContents} from "@/annotator-entry-ui/model/TileContents"
import {AnnotationUtmTile} from "@/annotator-entry-ui/tile/AnnotationUtmTile"
import {AnnotationManager} from "@/annotator-entry-ui/AnnotationManager"
import {ScaleProvider} from "@/annotator-entry-ui/tile/ScaleProvider"

export class AnnotationTileManager extends TileManager {
	constructor(
		scaleProvider: ScaleProvider,
		utmCoordinateSystem: UtmCoordinateSystem,
		onSuperTileLoad: (superTile: SuperTile) => void,
		onSuperTileUnload: (superTile: SuperTile) => void,
		tileServiceClient: TileServiceClient,
		private annotationManager: AnnotationManager,
	) {
		super(
			scaleProvider,
			utmCoordinateSystem,
			onSuperTileLoad,
			onSuperTileUnload,
			tileServiceClient,
		)
		this.config = {
			layerId: 'anot1', // a layer which contains miniature annotator JSON files
			initialSuperTilesToLoad: parseInt(config.get('tile_manager.initial_super_tiles_to_load'), 10) || 4,
			maximumSuperTilesToLoad: parseInt(config.get('tile_manager.maximum_super_tiles_to_load'), 10) || 10000,
			maximumObjectsToLoad: parseInt(config.get('tile_manager.maximum_annotations_to_load'), 10) || 1000,
		}
	}

	protected constructSuperTile(index: TileIndex, coordinateFrame: CoordinateFrameType, utmCoordinateSystem: UtmCoordinateSystem): SuperTile {
		return new AnnotationSuperTile(index, coordinateFrame, utmCoordinateSystem)
	}

	protected tileInstanceToUtmTile(tileInstance: TileInstance, coordinateFrame: CoordinateFrameType): UtmTile {
		return new AnnotationUtmTile(
			tileInstance.tileIndex,
			this.annotationFileLoader(tileInstance, coordinateFrame),
		)
	}

	// Get data from a file. Prepare it to instantiate a UtmTile.
	// AnnotationManager checks CoordinateFrameType against its copy of UtmCoordinateSystem,
	// so we don't have to do it here.
	private annotationFileLoader(tileInstance: TileInstance, _: CoordinateFrameType): () => Promise<AnnotationTileContents> {
		return (): Promise<AnnotationTileContents> =>
			this.loadTile(tileInstance)
				.then(obj => new AnnotationTileContents(this.annotationManager.objectToAnnotations(obj)))
	}

	// Load an annotations JSON object from a file.
	private loadTile(tileInstance: TileInstance): Promise<Object> {
		if (tileInstance.layerId === this.config.layerId)
			return this.tileServiceClient.getTileContents(tileInstance.url)
				.then(buffer => JSON.parse(String.fromCharCode.apply(null, buffer)))
		else
			return Promise.reject(Error('unknown tileInstance.layerId: ' + tileInstance.layerId))
	}

    protected updateTileManagerStats(): void {
        if ( !this.settings.enableAnnotationTileManager ) return
		super.updateTileManagerStats()
	}
}
