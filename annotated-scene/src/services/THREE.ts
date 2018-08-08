
import * as three from 'three'
import * as OBJLoader from 'three-obj-loader'

const THREE = {
	...three
}

OBJLoader(THREE)

export default THREE
