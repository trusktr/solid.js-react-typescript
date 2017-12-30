/**
 * @author arodic / https://github.com/arodic
 */

import {BufferGeometry, Euler, Object3D, Vector3} from "three"

// tslint:disable:no-string-literal

const THREE = require('three')

declare global {
	namespace THREE {
		const TransformGizmo: any
		const TransformGizmoTranslate: any
		const TransformGizmoRotate: any
		const TransformGizmoScale: any
	}
}

const GizmoMaterial = function (parameters: any) {

	THREE.MeshBasicMaterial.call(this)

	this.depthTest = false
	this.depthWrite = false
	this.side = THREE.FrontSide
	this.transparent = true

	this.setValues(parameters)

	this.oldColor = this.color.clone()
	this.oldOpacity = this.opacity

	this.highlight = function (highlighted: any) {

		if (highlighted) {

			this.color.setRGB(1, 1, 0)
			this.opacity = 1

		} else {

			this.color.copy(this.oldColor)
			this.opacity = this.oldOpacity

		}

	}

}

GizmoMaterial.prototype = Object.create(THREE.MeshBasicMaterial.prototype)
GizmoMaterial.prototype.constructor = GizmoMaterial

const GizmoLineMaterial = function (parameters: any) {

	THREE.LineBasicMaterial.call(this)

	this.depthTest = false
	this.depthWrite = false
	this.transparent = true
	this.linewidth = 1

	this.setValues(parameters)

	this.oldColor = this.color.clone()
	this.oldOpacity = this.opacity

	this.highlight = function (highlighted: boolean): void {

		if (highlighted) {

			this.color.setRGB(1, 1, 0)
			this.opacity = 1

		} else {

			this.color.copy(this.oldColor)
			this.opacity = this.oldOpacity

		}

	}

}

GizmoLineMaterial.prototype = Object.create(THREE.LineBasicMaterial.prototype)
GizmoLineMaterial.prototype.constructor = GizmoLineMaterial

const pickerMaterial = new GizmoMaterial({visible: false, transparent: false})

THREE.TransformGizmo = function () {

	this.init = function () {

		THREE.Object3D.call(this)

		this.handles = new THREE.Object3D()
		this.pickers = new THREE.Object3D()
		this.planes = new THREE.Object3D()

		this.add(this.handles)
		this.add(this.pickers)
		this.add(this.planes)

		//// PLANES

		const planeGeometry = new THREE.PlaneBufferGeometry(50, 50, 2, 2)
		const planeMaterial = new THREE.MeshBasicMaterial({visible: false, side: THREE.DoubleSide})

		const planes = {
			"XY": new THREE.Mesh(planeGeometry, planeMaterial),
			"YZ": new THREE.Mesh(planeGeometry, planeMaterial),
			"XZ": new THREE.Mesh(planeGeometry, planeMaterial),
			"XYZE": new THREE.Mesh(planeGeometry, planeMaterial)
		}

		this.activePlane = planes["XYZE"]

		planes["YZ"].rotation.set(0, Math.PI / 2, 0)
		planes["XZ"].rotation.set(-Math.PI / 2, 0, 0)

		for (const i in planes) {
			if (planes.hasOwnProperty(i)) {
				planes[i].name = i
				this.planes.add(planes[i])
				this.planes[i] = planes[i]
			}
		}

		//// HANDLES AND PICKERS

		const setupGizmos = function (gizmoMap: any, parent: any) {

			for (const name in gizmoMap) {
				if (gizmoMap.hasOwnProperty(name)) {
					for (let i = gizmoMap[name].length; i--;) {

						const object = gizmoMap[name][i][0]
						const position = gizmoMap[name][i][1]
						const rotation = gizmoMap[name][i][2]

						object.name = name

						if (position) object.position.set(position[0], position[1], position[2])
						if (rotation) object.rotation.set(rotation[0], rotation[1], rotation[2])

						parent.add(object)

					}
				}
			}

		}

		setupGizmos(this.handleGizmos, this.handles)
		setupGizmos(this.pickerGizmos, this.pickers)

		// reset Transformations

		this.traverse(function (child: any) {

			if (child instanceof THREE.Mesh) {

				child.updateMatrix()

				const tempGeometry = child.geometry.clone()
				tempGeometry.applyMatrix(child.matrix)
				child.geometry = tempGeometry

				child.position.set(0, 0, 0)
				child.rotation.set(0, 0, 0)
				child.scale.set(1, 1, 1)

			}

		})

	}

	this.highlight = function (axis: any) {

		this.traverse(function (child: any) {

			if (child.material && child.material.highlight) {

				if (child.name === axis) {

					child.material.highlight(true)

				} else {

					child.material.highlight(false)

				}

			}

		})

	}

}

THREE.TransformGizmo.prototype = Object.create(THREE.Object3D.prototype)
THREE.TransformGizmo.prototype.constructor = THREE.TransformGizmo

THREE.TransformGizmo.prototype.update = function (rotation: Euler, eye: Vector3): void {

	const vec1 = new THREE.Vector3(0, 0, 0)
	const vec2 = new THREE.Vector3(0, 1, 0)
	const lookAtMatrix = new THREE.Matrix4()

	this.traverse(function (child: any) {

		if (child.name.search("E") !== -1) {

			child.quaternion.setFromRotationMatrix(lookAtMatrix.lookAt(eye, vec1, vec2))

		} else if (child.name.search("X") !== -1 || child.name.search("Y") !== -1 || child.name.search("Z") !== -1) {

			child.quaternion.setFromEuler(rotation)

		}

	})

}

THREE.TransformGizmoTranslate = function (): void {

	THREE.TransformGizmo.call(this)

	const arrowGeometry = new THREE.Geometry()
	const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0, 0.05, 0.2, 12, 1, false))
	mesh.position.y = 0.5
	mesh.updateMatrix()

	arrowGeometry.merge(mesh.geometry as any, mesh.matrix)

	const lineXGeometry = new THREE.BufferGeometry()
	lineXGeometry.addAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0], 3))

	const lineYGeometry = new THREE.BufferGeometry()
	lineYGeometry.addAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 1, 0], 3))

	const lineZGeometry = new THREE.BufferGeometry()
	lineZGeometry.addAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 1], 3))

	this.handleGizmos = {

		X: [
			[new THREE.Mesh(arrowGeometry, new GizmoMaterial({color: 0xff0000})), [0.5, 0, 0], [0, 0, -Math.PI / 2]],
			[new THREE.Line(lineXGeometry, new GizmoLineMaterial({color: 0xff0000}))]
		],

		Y: [
			[new THREE.Mesh(arrowGeometry, new GizmoMaterial({color: 0x00ff00})), [0, 0.5, 0]],
			[new THREE.Line(lineYGeometry, new GizmoLineMaterial({color: 0x00ff00}))]
		],

		Z: [
			[new THREE.Mesh(arrowGeometry, new GizmoMaterial({color: 0x0000ff})), [0, 0, 0.5], [Math.PI / 2, 0, 0]],
			[new THREE.Line(lineZGeometry, new GizmoLineMaterial({color: 0x0000ff}))]
		],

		XYZ: [
			[new THREE.Mesh(new THREE.OctahedronGeometry(0.1, 0), new GizmoMaterial({
				color: 0xffffff,
				opacity: 0.25
			})), [0, 0, 0], [0, 0, 0]]
		],

		XY: [
			[new THREE.Mesh(new THREE.PlaneBufferGeometry(0.29, 0.29), new GizmoMaterial({
				color: 0xffff00,
				opacity: 0.25
			})), [0.15, 0.15, 0]]
		],

		YZ: [
			[new THREE.Mesh(new THREE.PlaneBufferGeometry(0.29, 0.29), new GizmoMaterial({
				color: 0x00ffff,
				opacity: 0.25
			})), [0, 0.15, 0.15], [0, Math.PI / 2, 0]]
		],

		XZ: [
			[new THREE.Mesh(new THREE.PlaneBufferGeometry(0.29, 0.29), new GizmoMaterial({
				color: 0xff00ff,
				opacity: 0.25
			})), [0.15, 0, 0.15], [-Math.PI / 2, 0, 0]]
		]

	}

	this.pickerGizmos = {

		X: [
			[new THREE.Mesh(new THREE.CylinderBufferGeometry(0.2, 0, 1, 4, 1, false), pickerMaterial), [0.6, 0, 0], [0, 0, -Math.PI / 2]]
		],

		Y: [
			[new THREE.Mesh(new THREE.CylinderBufferGeometry(0.2, 0, 1, 4, 1, false), pickerMaterial), [0, 0.6, 0]]
		],

		Z: [
			[new THREE.Mesh(new THREE.CylinderBufferGeometry(0.2, 0, 1, 4, 1, false), pickerMaterial), [0, 0, 0.6], [Math.PI / 2, 0, 0]]
		],

		XYZ: [
			[new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), pickerMaterial)]
		],

		XY: [
			[new THREE.Mesh(new THREE.PlaneBufferGeometry(0.4, 0.4), pickerMaterial), [0.2, 0.2, 0]]
		],

		YZ: [
			[new THREE.Mesh(new THREE.PlaneBufferGeometry(0.4, 0.4), pickerMaterial), [0, 0.2, 0.2], [0, Math.PI / 2, 0]]
		],

		XZ: [
			[new THREE.Mesh(new THREE.PlaneBufferGeometry(0.4, 0.4), pickerMaterial), [0.2, 0, 0.2], [-Math.PI / 2, 0, 0]]
		]

	}

	this.setActivePlane = function (axis: string, eye: Vector3): void {

		const tempMatrix = new THREE.Matrix4()
		eye.applyMatrix4(tempMatrix.getInverse(tempMatrix.extractRotation(this.planes["XY"].matrixWorld)))

		if (axis === "X") {

			this.activePlane = this.planes["XY"]

			if (Math.abs(eye.y) > Math.abs(eye.z)) this.activePlane = this.planes["XZ"]

		}

		if (axis === "Y") {

			this.activePlane = this.planes["XY"]

			if (Math.abs(eye.x) > Math.abs(eye.z)) this.activePlane = this.planes["YZ"]

		}

		if (axis === "Z") {

			this.activePlane = this.planes["XZ"]

			if (Math.abs(eye.x) > Math.abs(eye.y)) this.activePlane = this.planes["YZ"]

		}

		if (axis === "XYZ") this.activePlane = this.planes["XYZE"]

		if (axis === "XY") this.activePlane = this.planes["XY"]

		if (axis === "YZ") this.activePlane = this.planes["YZ"]

		if (axis === "XZ") this.activePlane = this.planes["XZ"]

	}

	this.init()

}

THREE.TransformGizmoTranslate.prototype = Object.create(THREE.TransformGizmo.prototype)
THREE.TransformGizmoTranslate.prototype.constructor = THREE.TransformGizmoTranslate

THREE.TransformGizmoRotate = function () {

	THREE.TransformGizmo.call(this)

	const CircleGeometry = (radius: number, facing: string, arc: number): BufferGeometry => {

		const geometry = new THREE.BufferGeometry()
		const vertices: Array<number> = []
		arc = arc ? arc : 1

		for (let i = 0; i <= 64 * arc; ++i) {

			if (facing === 'x') vertices.push(0, Math.cos(i / 32 * Math.PI) * radius, Math.sin(i / 32 * Math.PI) * radius)
			if (facing === 'y') vertices.push(Math.cos(i / 32 * Math.PI) * radius, 0, Math.sin(i / 32 * Math.PI) * radius)
			if (facing === 'z') vertices.push(Math.sin(i / 32 * Math.PI) * radius, Math.cos(i / 32 * Math.PI) * radius, 0)

		}

		geometry.addAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
		return geometry

	}

	this.handleGizmos = {

		X: [
			[new THREE.Line(CircleGeometry(1, 'x', 0.5), new GizmoLineMaterial({color: 0xff0000}))]
		],

		Y: [
			[new THREE.Line(CircleGeometry(1, 'y', 0.5), new GizmoLineMaterial({color: 0x00ff00}))]
		],

		Z: [
			[new THREE.Line(CircleGeometry(1, 'z', 0.5), new GizmoLineMaterial({color: 0x0000ff}))]
		],

		E: [
			[new THREE.Line(CircleGeometry(1.25, 'z', 1), new GizmoLineMaterial({color: 0xcccc00}))]
		],

		XYZE: [
			[new THREE.Line(CircleGeometry(1, 'z', 1), new GizmoLineMaterial({color: 0x787878}))]
		]

	}

	this.pickerGizmos = {

		X: [
			[new THREE.Mesh(new THREE.TorusBufferGeometry(1, 0.12, 4, 12, Math.PI), pickerMaterial), [0, 0, 0], [0, -Math.PI / 2, -Math.PI / 2]]
		],

		Y: [
			[new THREE.Mesh(new THREE.TorusBufferGeometry(1, 0.12, 4, 12, Math.PI), pickerMaterial), [0, 0, 0], [Math.PI / 2, 0, 0]]
		],

		Z: [
			[new THREE.Mesh(new THREE.TorusBufferGeometry(1, 0.12, 4, 12, Math.PI), pickerMaterial), [0, 0, 0], [0, 0, -Math.PI / 2]]
		],

		E: [
			[new THREE.Mesh(new THREE.TorusBufferGeometry(1.25, 0.12, 2, 24), pickerMaterial)]
		],

		XYZE: [
			[new THREE.Mesh()]
		]

	}

	this.setActivePlane = function (axis: string): void {

		if (axis === "E") this.activePlane = this.planes["XYZE"]

		if (axis === "X") this.activePlane = this.planes["YZ"]

		if (axis === "Y") this.activePlane = this.planes["XZ"]

		if (axis === "Z") this.activePlane = this.planes["XY"]

	}

	this.update = function (_: Euler, eye2: Vector3): void {

		THREE.TransformGizmo.prototype.update.apply(this, arguments)

		const tempMatrix = new THREE.Matrix4()
		const worldRotation = new THREE.Euler(0, 0, 1)
		const tempQuaternion = new THREE.Quaternion()
		const unitX = new THREE.Vector3(1, 0, 0)
		const unitY = new THREE.Vector3(0, 1, 0)
		const unitZ = new THREE.Vector3(0, 0, 1)
		const quaternionX = new THREE.Quaternion()
		const quaternionY = new THREE.Quaternion()
		const quaternionZ = new THREE.Quaternion()
		const eye = eye2.clone()

		worldRotation.copy(this.planes["XY"].rotation)
		tempQuaternion.setFromEuler(worldRotation)

		tempMatrix.makeRotationFromQuaternion(tempQuaternion).getInverse(tempMatrix)
		eye.applyMatrix4(tempMatrix)

		this.traverse(function (child: any) {

			tempQuaternion.setFromEuler(worldRotation)

			if (child.name === "X") {

				quaternionX.setFromAxisAngle(unitX, Math.atan2(-eye.y, eye.z))
				tempQuaternion.multiplyQuaternions(tempQuaternion, quaternionX)
				child.quaternion.copy(tempQuaternion)

			}

			if (child.name === "Y") {

				quaternionY.setFromAxisAngle(unitY, Math.atan2(eye.x, eye.z))
				tempQuaternion.multiplyQuaternions(tempQuaternion, quaternionY)
				child.quaternion.copy(tempQuaternion)

			}

			if (child.name === "Z") {

				quaternionZ.setFromAxisAngle(unitZ, Math.atan2(eye.y, eye.x))
				tempQuaternion.multiplyQuaternions(tempQuaternion, quaternionZ)
				child.quaternion.copy(tempQuaternion)

			}

		})

	}

	this.init()

}

THREE.TransformGizmoRotate.prototype = Object.create(THREE.TransformGizmo.prototype)
THREE.TransformGizmoRotate.prototype.constructor = THREE.TransformGizmoRotate

THREE.TransformGizmoScale = function () {

	THREE.TransformGizmo.call(this)

	const arrowGeometry = new THREE.Geometry()
	const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.125, 0.125, 0.125))
	mesh.position.y = 0.5
	mesh.updateMatrix()

	arrowGeometry.merge(mesh.geometry as any, mesh.matrix)

	const lineXGeometry = new THREE.BufferGeometry()
	lineXGeometry.addAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0], 3))

	const lineYGeometry = new THREE.BufferGeometry()
	lineYGeometry.addAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 1, 0], 3))

	const lineZGeometry = new THREE.BufferGeometry()
	lineZGeometry.addAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 1], 3))

	this.handleGizmos = {

		X: [
			[new THREE.Mesh(arrowGeometry, new GizmoMaterial({color: 0xff0000})), [0.5, 0, 0], [0, 0, -Math.PI / 2]],
			[new THREE.Line(lineXGeometry, new GizmoLineMaterial({color: 0xff0000}))]
		],

		Y: [
			[new THREE.Mesh(arrowGeometry, new GizmoMaterial({color: 0x00ff00})), [0, 0.5, 0]],
			[new THREE.Line(lineYGeometry, new GizmoLineMaterial({color: 0x00ff00}))]
		],

		Z: [
			[new THREE.Mesh(arrowGeometry, new GizmoMaterial({color: 0x0000ff})), [0, 0, 0.5], [Math.PI / 2, 0, 0]],
			[new THREE.Line(lineZGeometry, new GizmoLineMaterial({color: 0x0000ff}))]
		],

		XYZ: [
			[new THREE.Mesh(new THREE.BoxBufferGeometry(0.125, 0.125, 0.125), new GizmoMaterial({
				color: 0xffffff,
				opacity: 0.25
			}))]
		]

	}

	this.pickerGizmos = {

		X: [
			[new THREE.Mesh(new THREE.CylinderBufferGeometry(0.2, 0, 1, 4, 1, false), pickerMaterial), [0.6, 0, 0], [0, 0, -Math.PI / 2]]
		],

		Y: [
			[new THREE.Mesh(new THREE.CylinderBufferGeometry(0.2, 0, 1, 4, 1, false), pickerMaterial), [0, 0.6, 0]]
		],

		Z: [
			[new THREE.Mesh(new THREE.CylinderBufferGeometry(0.2, 0, 1, 4, 1, false), pickerMaterial), [0, 0, 0.6], [Math.PI / 2, 0, 0]]
		],

		XYZ: [
			[new THREE.Mesh(new THREE.BoxBufferGeometry(0.4, 0.4, 0.4), pickerMaterial)]
		]

	}

	this.setActivePlane = function (axis: string, eye: Vector3): void {

		const tempMatrix = new THREE.Matrix4()
		eye.applyMatrix4(tempMatrix.getInverse(tempMatrix.extractRotation(this.planes["XY"].matrixWorld)))

		if (axis === "X") {

			this.activePlane = this.planes["XY"]
			if (Math.abs(eye.y) > Math.abs(eye.z)) this.activePlane = this.planes["XZ"]

		}

		if (axis === "Y") {

			this.activePlane = this.planes["XY"]
			if (Math.abs(eye.x) > Math.abs(eye.z)) this.activePlane = this.planes["YZ"]

		}

		if (axis === "Z") {

			this.activePlane = this.planes["XZ"]
			if (Math.abs(eye.x) > Math.abs(eye.y)) this.activePlane = this.planes["YZ"]

		}

		if (axis === "XYZ") this.activePlane = this.planes["XYZE"]

	}

	this.init()

}

THREE.TransformGizmoScale.prototype = Object.create(THREE.TransformGizmo.prototype)
THREE.TransformGizmoScale.prototype.constructor = THREE.TransformGizmoScale

THREE.TransformControls = function (camera: any, domElement: any) {

	THREE.Object3D.call(this)

	domElement = ( domElement !== undefined ) ? domElement : document

	this.objects = []
	this.visible = false
	this.translationSnap = null
	this.rotationSnap = null
	this.space = "world"
	this.size = 1
	this.axis = null

	const scope = this

	let _mode = "translate"
	let _dragging = false
	const _gizmo = {

		"translate": new THREE.TransformGizmoTranslate(),
		"rotate": new THREE.TransformGizmoRotate(),
		"scale": new THREE.TransformGizmoScale()
	}

	for (const type in _gizmo) {

		const gizmoObj = _gizmo[type]

		gizmoObj.visible = ( type === _mode )
		this.add(gizmoObj)

	}

	const changeEvent = {type: "change"}
	const mouseDownEvent = {type: "mouseDown"}
	const mouseUpEvent = {type: "mouseUp", mode: _mode}
	const objectChangeEvent = {type: "objectChange"}

	const ray = new THREE.Raycaster()
	const pointerVector = new THREE.Vector2()

	const point = new THREE.Vector3()
	const offset = new THREE.Vector3()

	const rotation = new THREE.Vector3()
	const offsetRotation = new THREE.Vector3()
	let scale = 1

	const lookAtMatrix = new THREE.Matrix4()
	const eye = new THREE.Vector3()

	const tempMatrix = new THREE.Matrix4()
	const tempVector = new THREE.Vector3()
	const tempQuaternion = new THREE.Quaternion()
	const unitX = new THREE.Vector3(1, 0, 0)
	const unitY = new THREE.Vector3(0, 1, 0)
	const unitZ = new THREE.Vector3(0, 0, 1)

	const quaternionXYZ = new THREE.Quaternion()
	const quaternionX = new THREE.Quaternion()
	const quaternionY = new THREE.Quaternion()
	const quaternionZ = new THREE.Quaternion()
	const quaternionE = new THREE.Quaternion()

	let oldPositions: Array<Object3D> = []
	const oldScale = new THREE.Vector3()
	const oldRotationMatrix = new THREE.Matrix4()

	const parentRotationMatrix = new THREE.Matrix4()
	const parentScale = new THREE.Vector3()

	const worldPosition = new THREE.Vector3()
	const worldRotation = new THREE.Euler()
	const worldRotationMatrix = new THREE.Matrix4()
	const camPosition = new THREE.Vector3()
	const camRotation = new THREE.Euler()

	domElement.addEventListener("mousedown", onPointerDown, false)
	domElement.addEventListener("touchstart", onPointerDown, false)

	domElement.addEventListener("mousemove", onPointerHover, false)
	domElement.addEventListener("touchmove", onPointerHover, false)

	domElement.addEventListener("mousemove", onPointerMove, false)
	domElement.addEventListener("touchmove", onPointerMove, false)

	domElement.addEventListener("mouseup", onPointerUp, false)
	domElement.addEventListener("mouseout", onPointerUp, false)
	domElement.addEventListener("touchend", onPointerUp, false)
	domElement.addEventListener("touchcancel", onPointerUp, false)
	domElement.addEventListener("touchleave", onPointerUp, false)

	this.dispose = function () {

		domElement.removeEventListener("mousedown", onPointerDown)
		domElement.removeEventListener("touchstart", onPointerDown)

		domElement.removeEventListener("mousemove", onPointerHover)
		domElement.removeEventListener("touchmove", onPointerHover)

		domElement.removeEventListener("mousemove", onPointerMove)
		domElement.removeEventListener("touchmove", onPointerMove)

		domElement.removeEventListener("mouseup", onPointerUp)
		domElement.removeEventListener("mouseout", onPointerUp)
		domElement.removeEventListener("touchend", onPointerUp)
		domElement.removeEventListener("touchcancel", onPointerUp)
		domElement.removeEventListener("touchleave", onPointerUp)

	}

	this.attach = function (objects: Array<Object3D>): void {

		this.objects = objects
		this.visible = true
		this.update()

	}

	this.detach = function (): void {

		this.objects = []
		this.visible = false
		this.axis = null

	}

	this.getMode = function (): string {

		return _mode

	}

	this.setMode = function (mode: string): void {

		_mode = mode ? mode : _mode

		if (_mode === "scale") scope.space = "local"

		for (const type in _gizmo) {
			if (_gizmo.hasOwnProperty(type))
				_gizmo[type].visible = ( type === _mode )
		}

		this.update()
		scope.dispatchEvent(changeEvent)

	}

	this.setTranslationSnap = function (translationSnap: number): void {

		scope.translationSnap = translationSnap

	}

	this.setRotationSnap = function (rotationSnap: number): void {

		scope.rotationSnap = rotationSnap

	}

	this.setSize = function (size: number): void {

		scope.size = size
		this.update()
		scope.dispatchEvent(changeEvent)

	}

	this.setSpace = function (space: string): void {

		scope.space = space
		this.update()
		scope.dispatchEvent(changeEvent)

	}

	this.update = function (): void {

		if (!scope.objects.length) return

		for (let i = 0; i < scope.objects.length; i++) {
			scope.objects[i].updateMatrixWorld()
		}
		worldPosition.setFromMatrixPosition(scope.objects[0].matrixWorld)
		worldRotation.setFromRotationMatrix(tempMatrix.extractRotation(scope.objects[0].matrixWorld))

		camera.updateMatrixWorld()
		camPosition.setFromMatrixPosition(camera.matrixWorld)
		camRotation.setFromRotationMatrix(tempMatrix.extractRotation(camera.matrixWorld))

		scale = worldPosition.distanceTo(camPosition) / 6 * scope.size
		this.position.copy(worldPosition)
		this.scale.set(scale, scale, scale)

		if (camera instanceof THREE.PerspectiveCamera) {

			eye.copy(camPosition).sub(worldPosition).normalize()

		} else if (camera instanceof THREE.OrthographicCamera) {

			eye.copy(camPosition).normalize()

		}

		if (scope.space === "local") {

			_gizmo[_mode].update(worldRotation, eye)

		} else if (scope.space === "world") {

			_gizmo[_mode].update(new THREE.Euler(), eye)

		}

		_gizmo[_mode].highlight(scope.axis)

	}

	function onPointerHover(event: any): void {

		if (!scope.objects.length || _dragging === true || ( event.button !== undefined && event.button !== 0 )) return

		const pointer = event.changedTouches ? event.changedTouches[0] : event

		const intersect = intersectObjects(pointer, _gizmo[_mode].pickers.children)

		let axis = null

		if (intersect) {

			axis = intersect.object.name

			event.preventDefault()

		}

		if (scope.axis !== axis) {

			scope.axis = axis
			scope.update()
			scope.dispatchEvent(changeEvent)

		}

	}

	function onPointerDown(event: any): void {

		if (!scope.objects.length || _dragging === true || ( event.button !== undefined && event.button !== 0 )) return

		const pointer = event.changedTouches ? event.changedTouches[0] : event

		if (pointer.button === 0 || pointer.button === undefined) {

			const intersect = intersectObjects(pointer, _gizmo[_mode].pickers.children)

			if (intersect) {

				event.preventDefault()
				event.stopPropagation()

				scope.dispatchEvent(mouseDownEvent)

				scope.axis = intersect.object.name

				scope.update()

				eye.copy(camPosition).sub(worldPosition).normalize()

				_gizmo[_mode].setActivePlane(scope.axis, eye)

				const planeIntersect = intersectObjects(pointer, [_gizmo[_mode].activePlane])

				if (planeIntersect) {

					oldPositions = scope.objects.map((o: Object3D) => {
						const v = new THREE.Vector3()
						v.copy(o.position)
						return v
					})
					oldScale.copy(scope.objects[0].scale)

					oldRotationMatrix.extractRotation(scope.objects[0].matrix)
					worldRotationMatrix.extractRotation(scope.objects[0].matrixWorld)

					parentRotationMatrix.extractRotation(scope.objects[0].parent.matrixWorld)
					parentScale.setFromMatrixScale(tempMatrix.getInverse(scope.objects[0].parent.matrixWorld))

					offset.copy(planeIntersect.point)

				}

			}

		}

		_dragging = true

	}

	function onPointerMove(event: any): void {

		if (!scope.objects.length || scope.axis === null || _dragging === false || ( event.button !== undefined && event.button !== 0 )) return

		const pointer = event.changedTouches ? event.changedTouches[0] : event

		const planeIntersect = intersectObjects(pointer, [_gizmo[_mode].activePlane])

		if (planeIntersect === false) return

		event.preventDefault()
		event.stopPropagation()

		point.copy(planeIntersect.point)

		if (_mode === "translate") {

			point.sub(offset)
			point.multiply(parentScale)

			if (scope.space === "local") {

				point.applyMatrix4(tempMatrix.getInverse(worldRotationMatrix))

				if (scope.axis.search("X") === -1) point.x = 0
				if (scope.axis.search("Y") === -1) point.y = 0
				if (scope.axis.search("Z") === -1) point.z = 0

				point.applyMatrix4(oldRotationMatrix)

				for (let i = 0; i < scope.objects.length ; i ++) {
					scope.objects[i].position.copy(oldPositions[i])
					scope.objects[i].position.add(point)
				}

			}

			if (scope.space === "world" || scope.axis.search("XYZ") !== -1) {

				if (scope.axis.search("X") === -1) point.x = 0
				if (scope.axis.search("Y") === -1) point.y = 0
				if (scope.axis.search("Z") === -1) point.z = 0

				point.applyMatrix4(tempMatrix.getInverse(parentRotationMatrix))

				for (let i = 0; i < scope.objects.length; i++) {
					scope.objects[i].position.copy(oldPositions[i])
					scope.objects[i].position.add(point)
				}

			}

			if (scope.translationSnap !== null) {

				if (scope.space === "local") {

					for (let i = 0; i < scope.objects.length; i++) {
						scope.objects[i].position.applyMatrix4(tempMatrix.getInverse(worldRotationMatrix))
					}

				}

				for (let i = 0; i < scope.objects.length; i++) {
					if (scope.axis.search("X") !== -1) scope.objects[i].position.x = Math.round(scope.objects[i].position.x / scope.translationSnap) * scope.translationSnap
					if (scope.axis.search("Y") !== -1) scope.objects[i].position.y = Math.round(scope.objects[i].position.y / scope.translationSnap) * scope.translationSnap
					if (scope.axis.search("Z") !== -1) scope.objects[i].position.z = Math.round(scope.objects[i].position.z / scope.translationSnap) * scope.translationSnap
				}

				if (scope.space === "local") {

					for (let i = 0; i < scope.objects.length; i++) {
						scope.objects[i].position.applyMatrix4(worldRotationMatrix)
					}

				}

			}

		} else if (_mode === "scale") {

			point.sub(offset)
			point.multiply(parentScale)

			if (scope.space === "local") {

				if (scope.axis === "XYZ") {

					scale = 1 + ( ( point.y ) / Math.max(oldScale.x, oldScale.y, oldScale.z) )

					for (let i = 0; i < scope.objects.length; i++) {
						scope.objects[i].scale.x = oldScale.x * scale
						scope.objects[i].scale.y = oldScale.y * scale
						scope.objects[i].scale.z = oldScale.z * scale
					}

				} else {

					point.applyMatrix4(tempMatrix.getInverse(worldRotationMatrix))

					for (let i = 0; i < scope.objects.length; i++) {
						if (scope.axis === "X") scope.objects[i].scale.x = oldScale.x * ( 1 + point.x / oldScale.x )
						if (scope.axis === "Y") scope.objects[i].scale.y = oldScale.y * ( 1 + point.y / oldScale.y )
						if (scope.axis === "Z") scope.objects[i].scale.z = oldScale.z * ( 1 + point.z / oldScale.z )
					}

				}

			}

		} else if (_mode === "rotate") {

			point.sub(worldPosition)
			point.multiply(parentScale)
			tempVector.copy(offset).sub(worldPosition)
			tempVector.multiply(parentScale)

			if (scope.axis === "E") {

				point.applyMatrix4(tempMatrix.getInverse(lookAtMatrix))
				tempVector.applyMatrix4(tempMatrix.getInverse(lookAtMatrix))

				rotation.set(Math.atan2(point.z, point.y), Math.atan2(point.x, point.z), Math.atan2(point.y, point.x))
				offsetRotation.set(Math.atan2(tempVector.z, tempVector.y), Math.atan2(tempVector.x, tempVector.z), Math.atan2(tempVector.y, tempVector.x))

				tempQuaternion.setFromRotationMatrix(tempMatrix.getInverse(parentRotationMatrix))

				quaternionE.setFromAxisAngle(eye, rotation.z - offsetRotation.z)
				quaternionXYZ.setFromRotationMatrix(worldRotationMatrix)

				tempQuaternion.multiplyQuaternions(tempQuaternion, quaternionE)
				tempQuaternion.multiplyQuaternions(tempQuaternion, quaternionXYZ)

				for (let i = 0; i < scope.objects.length; i++) {
					scope.objects[i].quaternion.copy(tempQuaternion)
				}

			} else if (scope.axis === "XYZE") {

				quaternionE.setFromEuler(point.clone().cross(tempVector).normalize() as any) // rotation axis

				tempQuaternion.setFromRotationMatrix(tempMatrix.getInverse(parentRotationMatrix))
				quaternionX.setFromAxisAngle(quaternionE as any, -point.clone().angleTo(tempVector))
				quaternionXYZ.setFromRotationMatrix(worldRotationMatrix)

				tempQuaternion.multiplyQuaternions(tempQuaternion, quaternionX)
				tempQuaternion.multiplyQuaternions(tempQuaternion, quaternionXYZ)

				for (let i = 0; i < scope.objects.length; i++) {
					scope.objects[i].quaternion.copy(tempQuaternion)
				}

			} else if (scope.space === "local") {

				point.applyMatrix4(tempMatrix.getInverse(worldRotationMatrix))

				tempVector.applyMatrix4(tempMatrix.getInverse(worldRotationMatrix))

				rotation.set(Math.atan2(point.z, point.y), Math.atan2(point.x, point.z), Math.atan2(point.y, point.x))
				offsetRotation.set(Math.atan2(tempVector.z, tempVector.y), Math.atan2(tempVector.x, tempVector.z), Math.atan2(tempVector.y, tempVector.x))

				quaternionXYZ.setFromRotationMatrix(oldRotationMatrix)

				if (scope.rotationSnap !== null) {

					quaternionX.setFromAxisAngle(unitX, Math.round(( rotation.x - offsetRotation.x ) / scope.rotationSnap) * scope.rotationSnap)
					quaternionY.setFromAxisAngle(unitY, Math.round(( rotation.y - offsetRotation.y ) / scope.rotationSnap) * scope.rotationSnap)
					quaternionZ.setFromAxisAngle(unitZ, Math.round(( rotation.z - offsetRotation.z ) / scope.rotationSnap) * scope.rotationSnap)

				} else {

					quaternionX.setFromAxisAngle(unitX, rotation.x - offsetRotation.x)
					quaternionY.setFromAxisAngle(unitY, rotation.y - offsetRotation.y)
					quaternionZ.setFromAxisAngle(unitZ, rotation.z - offsetRotation.z)

				}

				if (scope.axis === "X") quaternionXYZ.multiplyQuaternions(quaternionXYZ, quaternionX)
				if (scope.axis === "Y") quaternionXYZ.multiplyQuaternions(quaternionXYZ, quaternionY)
				if (scope.axis === "Z") quaternionXYZ.multiplyQuaternions(quaternionXYZ, quaternionZ)

				for (let i = 0; i < scope.objects.length; i++) {
					scope.objects[i].quaternion.copy(quaternionXYZ)
				}

			} else if (scope.space === "world") {

				rotation.set(Math.atan2(point.z, point.y), Math.atan2(point.x, point.z), Math.atan2(point.y, point.x))
				offsetRotation.set(Math.atan2(tempVector.z, tempVector.y), Math.atan2(tempVector.x, tempVector.z), Math.atan2(tempVector.y, tempVector.x))

				tempQuaternion.setFromRotationMatrix(tempMatrix.getInverse(parentRotationMatrix))

				if (scope.rotationSnap !== null) {

					quaternionX.setFromAxisAngle(unitX, Math.round(( rotation.x - offsetRotation.x ) / scope.rotationSnap) * scope.rotationSnap)
					quaternionY.setFromAxisAngle(unitY, Math.round(( rotation.y - offsetRotation.y ) / scope.rotationSnap) * scope.rotationSnap)
					quaternionZ.setFromAxisAngle(unitZ, Math.round(( rotation.z - offsetRotation.z ) / scope.rotationSnap) * scope.rotationSnap)

				} else {

					quaternionX.setFromAxisAngle(unitX, rotation.x - offsetRotation.x)
					quaternionY.setFromAxisAngle(unitY, rotation.y - offsetRotation.y)
					quaternionZ.setFromAxisAngle(unitZ, rotation.z - offsetRotation.z)

				}

				quaternionXYZ.setFromRotationMatrix(worldRotationMatrix)

				if (scope.axis === "X") tempQuaternion.multiplyQuaternions(tempQuaternion, quaternionX)
				if (scope.axis === "Y") tempQuaternion.multiplyQuaternions(tempQuaternion, quaternionY)
				if (scope.axis === "Z") tempQuaternion.multiplyQuaternions(tempQuaternion, quaternionZ)

				tempQuaternion.multiplyQuaternions(tempQuaternion, quaternionXYZ)

				for (let i = 0; i < scope.objects.length; i++) {
					scope.objects[i].quaternion.copy(tempQuaternion)
				}

			}

		}

		scope.update()
		scope.dispatchEvent(changeEvent)
		scope.dispatchEvent(objectChangeEvent)

	}

	function onPointerUp(event: MouseEvent): void {

		event.preventDefault() // Prevent MouseEvent on mobile

		if (event.button !== undefined && event.button !== 0) {
			return
		}

		if (_dragging && ( scope.axis !== null )) {

			mouseUpEvent.mode = _mode
			scope.dispatchEvent(mouseUpEvent)

		}

		_dragging = false

		if ('TouchEvent' in window && event instanceof TouchEvent) {

			// Force "rollover"

			scope.axis = null
			scope.update()
			scope.dispatchEvent(changeEvent)

		} else {

			onPointerHover(event)

		}

	}

	function intersectObjects(pointer: any, objects: any) {

		const rect = domElement.getBoundingClientRect()
		const x = ( pointer.clientX - rect.left ) / rect.width
		const y = ( pointer.clientY - rect.top ) / rect.height

		pointerVector.set(( x * 2 ) - 1, -( y * 2 ) + 1)
		ray.setFromCamera(pointerVector, camera)

		const intersections = ray.intersectObjects(objects, true)
		return intersections[0] ? intersections[0] : false

	}

} as any

THREE.TransformControls.prototype = Object.create(THREE.Object3D.prototype)
THREE.TransformControls.prototype.constructor = THREE.TransformControls

export const TransformControls = THREE.TransformControls
