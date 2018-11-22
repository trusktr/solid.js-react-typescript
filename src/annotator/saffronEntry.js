require('source-map-support').install()

const SaffronSDK = require('@mapperai/mapper-saffron-sdk')

console.info('LEVEL3')

Object.assign(window, {
	SaffronSDK,
	isSaffron: true,
})

const React = require('react')
const entry = require('./entry')

console.info('HELL10')

/**
 * Annotator root component
 */
class Annotator extends React.Component {
	constructor(props, context) {
		super(props, context)

		this.state = {}
	}

	componentDidMount() {
		if (!this.state.componentPromise) {
			this.setState({
				componentPromise: entry.start(true).then(component => {
					return this.setState({
						component,
					})
				}),
			})
		}
	}

	render() {
		const { component } = this.state

		return component ? component : React.createElement('div', {}, 'loading')
	}
}

module.exports = {
	component: Annotator,
	start: async () => {},
	stop: async () => {},
}
