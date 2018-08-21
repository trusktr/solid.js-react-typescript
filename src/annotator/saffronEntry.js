const React = require('react')
const path = require('path')

const h = (...args) => React.createElement(...args)

class Annotator extends React.Component {

	render() {
		// return h('div', null, 'hello')
		return h('webview', {
			src: `file://${ path.join(__dirname, 'BrowserEntry.html') }`,
			style: { width: '100%', height: '100%' },
			nodeintegration: 'true',
			allowpopups: 'true',
			disablewebsecurity: 'true',
		}, null)
	}

}

module.exports = {
	component: Annotator,
	async start() {},
	async stop() {},
}
