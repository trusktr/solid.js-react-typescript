#!/usr/bin/env node
require('./init-scripts')

echo(`SSH-ing to linux & compiling`)
exec(`gulp linux-sync`)
exec(`curl -N --no-progress-bar http://10.0.1.46:11221/npm/package`)
mkdir(`-p`,'dist/build/linux')
exec(`scp -r 10.0.1.46:./Development/densebrain/epictask-workspace/epictask/dist/build/* dist/build/linux/`)