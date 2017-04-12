require('./init-scripts')

echo(`Installing App`)
if (isMac) {
	exec('pkill -9 Epictask')
	rm('-Rf', '/Applications/Epictask.app')
	cp('-r', 'dist/build/mac/Epictask.app', '/Applications/')
}