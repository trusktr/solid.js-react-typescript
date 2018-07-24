/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as React from "react"
import LayerToggle from "@/mapper-annotated-scene/src/models/LayerToggle";
import * as lodash from "lodash";
import Logger from "@/util/log";
import AnnotatedSceneActions from "@/mapper-annotated-scene/src/store/actions/AnnotatedSceneActions";
import {v4 as UUID} from 'uuid'

const log = Logger(__filename)

export const Layer = {
	POINT_CLOUD: UUID(),
	ANNOTATIONS: UUID(),
}

export interface LayerManagerProps {}

export interface LayerManagerState {
	layerToggles: Map<string, LayerToggle>
}

export default class LayerManager extends React.Component<LayerManagerProps, LayerManagerState> {

	constructor(props: LayerManagerProps) {
		super(props)

		// TODO JOE WEDNESDAY the toggles will be passed in by AnnotatedSceneController

		const pointCloudLayerToggle = visible => {
			new AnnotatedSceneActions().setIsPointCloudVisible( visible )
		}

		// TODO JOE remove
		// const imageScreensLayerToggle = visible => {
		// 	new AnnotatedSceneActions().setIsImageScreensVisible(false)
		// }

		const annotationLayerToggle = visible => {
			new AnnotatedSceneActions().setIsAnnotationsVisible(visible)
		}

		this.state = {
			layerToggles: new Map([
				[Layer.POINT_CLOUD, pointCloudLayerToggle],
				// [Layer.IMAGE_SCREENS, imageScreensLayerToggle],
				[Layer.ANNOTATIONS, annotationLayerToggle]
			])
		}
	}

	addLayerToggle(layerName:string, toggle:LayerToggle) {
		const layerToggles = this.state.layerToggles
		layerToggles.set(layerName, toggle)
		this.setState({layerToggles})
	}

	// Ensure that some layers of the model are visible. Optionally hide the other layers.
	setLayerVisibility(layerKeysToShow: string[], hideOthers: boolean = false): void {
		layerKeysToShow.forEach(key => {
			if (this.state.layerToggles.has(key)) {
				// tslint:disable-next-line:no-unused-expression <-- work around a tslint bug
				this.state.layerToggles.get(key)!( true )
			}
			else
				log.error(`missing visibility toggle for ${key}`)
		})

		if (hideOthers) {
			const hide = lodash.difference(Array.from(this.state.layerToggles.keys()), layerKeysToShow)
			hide.forEach(key => {
				if (this.state.layerToggles.has(key)) {
					// tslint:disable-next-line:no-unused-expression <-- work around a tslint bug
					this.state.layerToggles.get(key)!( false )
				}
				else
					log.error(`missing visibility toggle for ${key}`)
			})
		}

		new AnnotatedSceneActions().setVisibleLayers(layerKeysToShow)
	}

	// TODO JOE WEDNESDAY toggle visibility of a specific layer by name/id
	// This will replace the `h` key of Annotator to cycle between layers (point
	// cloud, annotations, or both)
	toggleLayerVisibility( layer: string ): void {
		console.log( layer )
		// todo
	}

	getLayerNames(): Array<string> {
		return Array.from(this.state.layerToggles.keys())
	}

	render(): JSX.Element | null {
		return null
	}
}
