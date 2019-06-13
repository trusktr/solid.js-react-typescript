import * as React from 'react'
import * as ReactDOM from 'react-dom'
import * as _ from 'lodash'
import * as $ from 'jquery'

const windowHTML = `
  <style>
    body, html, body > #root {
      width: 100%; height: 100%;
      padding: 0; margin: 0;
    }
  </style>
  <div id="root"></div>
`

type WindowableProps = {
  windowed?: boolean
}

type WindowableState = {
  windowRoot: HTMLElement | null
}

// eslint-disable-next-line typescript/explicit-function-return-type
export default function Windowable<ComponentProps extends object>(Component: React.ComponentType<ComponentProps>) {
  return class Windowable extends React.Component<ComponentProps & WindowableProps, WindowableState> {
    private window: Window | null = null

    constructor(props: ComponentProps & WindowableProps, context) {
      super(props, context)

      this.state = {
        windowRoot: null,
      }
    }

    private handleWindow() {
      const {windowed} = this.props

      if (windowed) {
        this.makeWindow()
      } else {
        this.cleanupWindow()
      }
    }

    private makeWindow() {
      this.openWindow()

      if (!this.window) throw Error('Unable to open window')

      const document = this.window.document

      $(document).ready(() => {
        document.body.innerHTML = windowHTML
        this.setState({windowRoot: $(document).find('#root')[0]})
      })
    }

    private openWindow() {
      this.window = window.open()
    }

    private cleanupWindow() {
      if (this.state.windowRoot) {
        this.setState({windowRoot: null})
        delete (this.state as any).windowRoot
      }

      if (this.window) {
        this.window.close()
        this.window = null
      }
    }

    private componentProps() {
      return _.omit(this.props, 'windowed', 'children')
    }

    private renderComponent() {
      const {children} = this.props

      return <Component {...this.componentProps()}>{children}</Component>
    }

    componentDidMount() {
      this.handleWindow()
    }

    componentDidUpdate(oldProps: WindowableProps) {
      if (oldProps.windowed !== this.props.windowed) this.handleWindow()
    }

    componentWillUnmount() {
      this.cleanupWindow()
    }

    render() {
      const {windowed} = this.props
      const {windowRoot} = this.state

      return windowed && windowRoot ? ReactDOM.createPortal(this.renderComponent(), windowRoot) : this.renderComponent()
    }
  }
}
