require('../../require-hooks')

const React = require('react')
const path = require('path')
const entry = require('./entry')

const h = (...args) => React.createElement(...args)

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
		// h('webview', {
		// 	src: `file://${ path.join(__dirname, 'BrowserEntry.html') }#saffron`,
		// 	style: { width: '100%', height: '100%' },
		// 	nodeintegration: 'true',
		// 	allowpopups: 'true',
		// 	disablewebsecurity: 'true',
		// }, null)
	}

}

module.exports = {
	component: Annotator,
	start: async () => {},
	stop: async () => {}
}
