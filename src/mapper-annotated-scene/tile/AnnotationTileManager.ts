/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import {TileManager} from "@/mapper-annotated-scene/tile/TileManager"
import {UtmCoordinateSystem} from "@/mapper-annotated-scene/UtmCoordinateSystem"
import {SuperTile} from "@/mapper-annotated-scene/tile/SuperTile"
import {MapperTileServiceClient} from "@/mapper-annotated-scene/tile/TileServiceClient"
import config from "@/config"
import {CoordinateFrameType} from "@/mapper-annotated-scene/geometry/CoordinateFrame"
import {TileIndex} from "@/mapper-annotated-scene/tile-model/TileIndex"
import {AnnotationSuperTile} from "@/mapper-annotated-scene/tile/AnnotationSuperTile"
import {UtmTile} from "@/mapper-annotated-scene/tile/UtmTile"
import {TileInstance} from "@/mapper-annotated-scene/tile-model/TileInstance"
import {AnnotationTileContents} from "@/mapper-annotated-scene/tile-model/TileContents"
import {AnnotationUtmTile} from "@/mapper-annotated-scene/tile/AnnotationUtmTile"
import {AnnotationManager} from "@/mapper-annotated-scene/AnnotationManager.tsx"
import {ScaleProvider} from "@/mapper-annotated-scene/tile/ScaleProvider"
import {EventEmitter} from "events"
import StatusWindowActions from "@/mapper-annotated-scene/StatusWindowActions"
import {StatusKey} from "@/mapper-annotated-scene/src/models/StatusKey"

export class AnnotationTileManager extends TileManager {
	constructor(
		scaleProvider: ScaleProvider,
		utmCoordinateSystem: UtmCoordinateSystem,
		tileServiceClient: MapperTileServiceClient,
        channel: EventEmitter,
		private annotationManager: AnnotationManager,
	) {
		super(
			scaleProvider,
			utmCoordinateSystem,
			tileServiceClient,
			channel,
		)
		this.config = {
			layerId: 'anot1', // a layer which contains miniature annotator JSON files
			initialSuperTilesToLoad: parseInt(config['tile_manager.initial_super_tiles_to_load'], 10) || 4,
			maximumSuperTilesToLoad: parseInt(config['tile_manager.maximum_super_tiles_to_load'], 10) || 10000,
			maximumObjectsToLoad: parseInt(config['tile_manager.maximum_annotations_to_load'], 10) || 1000,
		}
	}

	protected constructSuperTile(index: TileIndex, coordinateFrame: CoordinateFrameType, utmCoordinateSystem: UtmCoordinateSystem): SuperTile {
		return new AnnotationSuperTile(index, coordinateFrame, utmCoordinateSystem)
	}

    /**
     * Calculate annotations loaded and dispatch an action
     */
    protected setStatsMessage() {
		if (!this.enableTileManagerStats) return

        let annotations = 0
        this.superTiles.forEach(st => annotations += st!.objectCount)

        const message = `Loaded ${this.superTiles.size} annotation tiles; ${annotations} annotations`
        new StatusWindowActions().setMessage(StatusKey.TILE_MANAGER_ANNOTATION_STATS, message)
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
				// TODO JOE take AnnotationManager reference out of here. Emit a
				// tile load event that outside code can react to.
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
}
