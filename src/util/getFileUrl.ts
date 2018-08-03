/**
 *  Copyright 2018 Mapper Inc. Part of the mapper-annotator project.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as Url from 'url'
import * as Path from 'path'

export default
function getFileUrl(pathRelativeToSrc: string): string {
	return Url.format({
		pathname: Path.join(process.cwd(), `src/${pathRelativeToSrc}`),
		protocol: 'file:',
		slashes: true,
	})
}
