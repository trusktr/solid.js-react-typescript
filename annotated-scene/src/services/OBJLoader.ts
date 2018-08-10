// this file is a small hack because of how ts-node imports work, so even if we
// call _OBJLoader(THREE) here, it won't be available in any other files that
// import THREE, so instead here we export OBJLoader for everyone.

import * as THREE from 'three'
import * as _OBJLoader from 'three-obj-loader'

_OBJLoader(THREE)

class OBJLoader extends THREE.OBJLoader {}

export default OBJLoader
