import * as React from 'react'
import * as ReactDOM from 'react-dom'
import * as $ from 'jquery'
import {variable} from './test.solid'

console.log('variable: ', variable)

export function startApp(): void {
  const root = $('#root')[0]
  ReactDOM.render(<div>Adding Solid to project already using React</div>, root)
}
