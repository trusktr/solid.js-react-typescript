module.exports = global.WebpackStatsConfig = {
	//colors: process.env.COLORS !== '0',
	colors: true,
	errors: true,
	warnings: true,
	timings: true,
	cached: false,
	errorDetails: true,
	assets: false, //true - shows all output assets
	chunks: false,
	chunkModules: false,
	hash: false,
	reasons: false,
	modules: false,
	chunkOrigins: false,
	sources: false
	
}
