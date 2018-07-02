import * as React from "react"
import LayerToggle from "@/annotator-z-hydra-shared/src/models/LayerToggle";
import * as lodash from "lodash";
import Logger from "@/util/log";
import {createStructuredSelector} from "reselect";
import {typedConnect} from "@/annotator-z-hydra-shared/src/styles/Themed";
import AnnotatedSceneState from "@/annotator-z-hydra-shared/src/store/state/AnnotatedSceneState";
import AnnotatedSceneActions from "AnnotatedSceneActions.ts";

const log = Logger(__filename)


export enum Layer {
	POINT_CLOUD,
	IMAGE_SCREENS,
	ANNOTATIONS,
}

export interface LayerManagerProps {
	onRenender: () => void
}

export interface LayerManagerState {
	layerToggles: Map<string, LayerToggle>

}

export default class LayerManager extends React.Component<LayerManagerProps, LayerManagerState> {

	constructor(props) {
		super(props)

		// TODO JOE WEDNESDAY the toggles will be passed in by AnnotatedSceneController

		const pointCloudLayerToggle = new LayerToggle({
			show: () => {new AnnotatedSceneActions().setIsPointCloudVisible(true)},
			hide: () => {new AnnotatedSceneActions().setIsPointCloudVisible(false)}
		})

		const imageScreensLayerToggle = new LayerToggle({
			show: () => {new AnnotatedSceneActions().setIsImageScreensVisible(false)},
			hide: () => {new AnnotatedSceneActions().setIsImageScreensVisible(false)}
		})

		const annotationLayerToggle = new LayerToggle({
			show: () => {new AnnotatedSceneActions().setIsAnnotationsVisible(true)},
			hide: () => {new AnnotatedSceneActions().setIsAnnotationsVisible(false)}
		})

		this.state = {
			layerToggles: new Map([
				[Layer.POINT_CLOUD.toString(), pointCloudLayerToggle],
				[Layer.IMAGE_SCREENS.toString(), imageScreensLayerToggle],
				[Layer.ANNOTATIONS.toString(), annotationLayerToggle]
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
		let updated = 0

		layerKeysToShow.forEach(key => {
			if (this.state.layerToggles.has(key)) {
				// tslint:disable-next-line:no-unused-expression <-- work around a tslint bug
				this.state.layerToggles.get(key)!.show()
				updated++
			}
			else
			log.error(`missing visibility toggle for ${key}`)
		})

		if (hideOthers) {
			const hide = lodash.difference(Array.from(this.state.layerToggles.keys()), layerKeysToShow)
			hide.forEach(key => {
				if (this.state.layerToggles.has(key)) {
					// tslint:disable-next-line:no-unused-expression <-- work around a tslint bug
					this.state.layerToggles.get(key)!.hide()
					updated++
				}
				else
				log.error(`missing visibility toggle for ${key}`)
			})
		}

		if (updated)
			this.props.onRenender()
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

	render() {
		return null
	}
}
