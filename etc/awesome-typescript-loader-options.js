export default (opts) => {
	return Object.assign({
		awesomeTypescriptLoaderOptions: {
			useBabel: true,
			forkChecker: true,
			useCache: true,
			babelOptions: {
				presets: [
					'es2016-node5',
					'stage-0',
					'react',
				],
				plugins: [
					'transform-es2015-classes',
					'transform-runtime',
				],
				sourceMaps: 'inline',
				env: {
					development: {
						plugins: ['react-hot-loader/babel'],

					},
				},
			},
		},
	}, opts)
}
