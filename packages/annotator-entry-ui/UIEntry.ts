/**
 *  Copyright 2017 Mapper Inc. Part of the mapper-annotator project.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as $ from 'jquery'
import * as TypeLogger from 'typelogger'
import * as THREE from 'three'
import {SimpleKML} from 'annotator-entry-ui/KmlUtils'
import {annotator} from 'annotator-entry-ui/Annotator'

TypeLogger.setLoggerOutput(console as any)
const log = TypeLogger.getLogger(__filename)

declare global {
	type Long = number
}

const root = $("#root");

export function onLoad() {
	require("annotator-control-ui/UIControl")
	log.info('loading ')
	let kml = new SimpleKML()
	let points = []
	points.push(new THREE.Vector3(0, 0, 0))
	points.push(new THREE.Vector3(1, 1, 1))
	points.push(new THREE.Vector3(2, 2, 2))
	kml.addPath(points)
	kml.saveToFile("/Users/alonso/Desktop/test.kml")
	annotator.initScene();
	annotator.animate();
}

$(onLoad)

if (module.hot) {
	module.hot.dispose(() => root.empty())
	module.hot.accept()
}
