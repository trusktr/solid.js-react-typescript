
import * as $ from 'jquery'
import * as TypeLogger from 'typelogger'
import {Annotator} from 'annotator-entry-ui/Annotator'


TypeLogger.setLoggerOutput(console as any)
const log = TypeLogger.getLogger(__filename)

declare global {
	type Long = number
}

let root = $("#root")


export function onLoad() {
	log.info('loading ')
	let annotator = new Annotator()
	annotator.initScene()
	//annotator.loadPointCloudData('/Users/alonso/Mapper/Data/Mapper/Alexandria/PointCloudTiles/')
	annotator.animate()
}

$(onLoad)

if (module.hot) {
	module.hot.dispose(() => root.empty())
	module.hot.accept()
}