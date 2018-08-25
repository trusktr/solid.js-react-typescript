

const React = require('react')
const entry = require('./entry')

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
					this.setState({
						component
					})
				})
			})
		}
	}

	render() {
		const {component} = this.state
		return component ? component : React.createElement('div',{},'loading')
	}
}


module.exports = {
	component: Annotator,
	start: async () => {},
	stop: async () => {}
}
