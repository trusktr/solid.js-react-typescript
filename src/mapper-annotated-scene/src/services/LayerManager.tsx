/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as React from "react"
import * as lodash from "lodash";
import Logger from "@/util/log";
import AnnotatedSceneActions from "@/mapper-annotated-scene/src/store/actions/AnnotatedSceneActions";
import {v4 as UUID} from 'uuid'
import EventEmitter from 'events'
import {Events} from "@/mapper-annotated-scene/src/models/Events";

const log = Logger(__filename)

// map of enum to human-readble layer names
export const Layer = {
	POINT_CLOUD: 'Point Cloud',
	ANNOTATIONS: 'Annotations',
	GROUND_PLANES: 'Ground Planes',
}

export type LayerToggle = (visible: boolean) => void

export interface LayerManagerProps {
	channel: EventEmitter
}

export interface LayerManagerState {
}

export default class LayerManager extends React.Component<LayerManagerProps, LayerManagerState> {
	private layerToggles = new Map<string, LayerToggle>()

	// TODO JOE Also make a more generic setLayerVisible action

	addLayer(layerName:string, toggle:LayerToggle): void {
		if (this.layerToggles.has(layerName)) throw new Error('layer already exists')
		this.layerToggles.set(layerName, toggle)
	}

	removeLayer( layerName: string ): void {
		this.layerToggles.delete( layerName )
	}

	// Ensure that some layers of the model are visible. Optionally hide the other layers.
	setLayerVisibility(layerKeysToShow: string[], hideOthers: boolean = false): void {
		layerKeysToShow.forEach(key => {
			if (this.layerToggles.has(key)) {
				// tslint:disable-next-line:no-unused-expression <-- work around a tslint bug
				this.layerToggles.get(key)!( true )
			}
			else
				log.error(`missing visibility toggle for ${key}`)
		})

		if (hideOthers) {
			const hide = lodash.difference(Array.from(this.layerToggles.keys()), layerKeysToShow)
			hide.forEach(key => {
				if (this.layerToggles.has(key)) {
					// tslint:disable-next-line:no-unused-expression <-- work around a tslint bug
					this.layerToggles.get(key)!( false )
				}
				else
					log.error(`missing visibility toggle for ${key}`)
			})
		}

		this.props.channel.emit(Events.SCENE_SHOULD_RENDER)
	}

	toggleLayerVisibility( layer: string ): void {
		console.log( layer )
		// TODO JOE toggle visibility of a specific layer by name/id
		// This will replace the `h` key of Annotator to cycle between layers
	}

	getLayerNames(): Array<string> {
		return Array.from( this.layerToggles.keys() )
	}

	render(): JSX.Element | null {
		return null
	}
}
