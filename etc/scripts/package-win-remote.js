#!/usr/bin/env node
require('./init-scripts')

echo(`SSH-ing to windows & compiling`)
exec(`gulp win-sync`)
exec(`curl -N --no-progress-bar http://10.0.1.49:11221/npm/package`)
mkdir(`-p`,'dist/build/windows')
exec(`scp -r 10.0.1.49:${WindowsEpicPath}/dist/build/* dist/build/windows/`)