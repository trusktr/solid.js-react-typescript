import * as THREE from 'three'

/* eslint-disable typescript/no-explicit-any */

declare module 'three' {
	export class OrbitControls {
		constructor(object: THREE.Camera, domElement?: HTMLElement)

		object: THREE.Camera
		domElement: HTMLElement | HTMLDocument

		// API
		enabled: boolean
		target: THREE.Vector3

		// deprecated
		center: THREE.Vector3

		enableZoom: boolean
		zoomSpeed: number
		minDistance: number
		maxDistance: number
		enableRotate: boolean
		rotateSpeed: number
		enablePan: boolean
		keyPanSpeed: number
		autoRotate: boolean
		autoRotateSpeed: number
		minPolarAngle: number
		maxPolarAngle: number
		minAzimuthAngle: number
		maxAzimuthAngle: number
		enableKeys: boolean
		keys: {
			LEFT: number
			UP: number
			RIGHT: number
			BOTTOM: number
		}
		mouseButtons: {
			ORBIT: THREE.MOUSE
			ZOOM: THREE.MOUSE
			PAN: THREE.MOUSE
		}
		enableDamping: boolean
		dampingFactor: number

		setCamera(cam: THREE.Camera): void

		rotateLeft(angle?: number): void

		rotateUp(angle?: number): void

		panLeft(distance?: number): void

		panUp(distance?: number): void

		pan(deltaX: number, deltaY: number): void

		dollyIn(dollyScale: number): void

		dollyOut(dollyScale: number): void

		update(): void

		reset(): void

		dispose(): void

		getPolarAngle(): number

		getAzimuthalAngle(): number

		// EventDispatcher mixins
		addEventListener(type: string, listener: (event: any) => void): void

		hasEventListener(type: string, listener: (event: any) => void): void

		removeEventListener(type: string, listener: (event: any) => void): void

		dispatchEvent(event: { type: string, target: any }): void
	}

	export const TransformGizmo: any
	export const TransformGizmoTranslate: any
	export const TransformGizmoRotate: any
	export const TransformGizmoScale: any
}
