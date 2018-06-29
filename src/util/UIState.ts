
export default class UIState {
	private domElement
	isMouseButtonPressed
	isMouseDragging

	init( domElement ) {
		this.domElement = domElement
		this.domElement.addEventListener('mouseup', this.mouseUp)
		this.domElement.addEventListener('mousedown', this.mouseDown)
		this.domElement.addEventListener('mousemove', this.mouseMove)
	}

	deinit() {
		this.domElement.removeEventListener('mouseup', this.mouseUp)
		this.domElement.removeEventListener('mousedown', this.mouseDown)
		this.domElement.removeEventListener('mousemove', this.mouseMove)
	}

	mouseUp = () => {this.isMouseButtonPressed = false}
	mouseDown = () => {this.isMouseButtonPressed = true}
	mouseMove = () => {this.isMouseDragging = this.isMouseButtonPressed}

}
