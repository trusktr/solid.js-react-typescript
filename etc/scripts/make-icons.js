#!/usr/bin/env node
require('./init-scripts')

const
	sizes = [16,24,32,48,64,96,128,256]

echo(`making icons`)
mkdir('-p','build/icons')
cd('build/icons')

sizes.forEach(size => {
	const
		iconFilename = `${size}x${size}.png`
	echo(`Making icon ${iconFilename}`)
	exec(`convert ../icon.png -resize ${size}x${size} ${iconFilename}`)
})

exec(`convert ../icon.png -define icon:auto-resize="${sizes.reverse().join(',')}" ../icon.ico`)

cd('../..')

exec(`./etc/scripts/make-icns.sh`)