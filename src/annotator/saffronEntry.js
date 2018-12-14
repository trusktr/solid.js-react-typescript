require('source-map-support').install()

const React = require('react')
const entry = require('./entry')

/**
 * Annotator root component
 */
class Annotator extends React.Component {
  constructor(props) {
    super(props)

    this.state = {}
  }

  componentDidMount() {
    if (!this.state.componentPromise) {
      this.setState({
        componentPromise: entry.start(true).then(component => {
          return this.setState({
            component
          })
        })
      })
    }
  }

  render() {
    const { component } = this.state

    return component ? component : React.createElement('div', {}, 'loading4')
  }
}

module.exports = {
  component: Annotator,
  start: async () => {},
  stop: async () => {}
}
