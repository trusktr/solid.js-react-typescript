import * as React from 'react'
import initUIControl from '@/annotator-control-ui/UIControl'
import {annotator} from 'annotator-entry-ui/Annotator'
import Menu from './components/Menu'
import './style.scss'
import Logger from '@/util/log'

const log = Logger(__filename)

export default
class App extends React.Component<{}, {}> {
	private sceneContainer: HTMLElement | null

	render(): JSX.Element {
		return <React.Fragment>

			<div className="scene-container" ref={el => this.sceneContainer = el}></div>

			<div id="logo">
				<img
					src={process.cwd() + "/packages/annotator-assets/images/signature_with_arrow_white.png"}
					height="30px"
					width="auto"
				/>
			</div>

			<div id="status_window"></div>

			<div id="menu_control">
				<button id="status_window_control_btn" className="menu_btn"> &#x2139; </button>
				<button id="live_location_control_btn" className="menu_btn"> &#x2388; </button>
				<button id="menu_control_btn" className="menu_btn"> &#9776; </button>
			</div>

			<Menu />

		</React.Fragment>
	}

	componentDidMount(): void {
		initUIControl()
		if (this.sceneContainer) annotator.mount( this.sceneContainer )
		else log.warn('No scene container!')
	}

	componentWillUnmount(): void {
		annotator.unmount()
	}

}
