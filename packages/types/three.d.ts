import * as THREE from 'three'

declare module 'three' {
	export class OrbitControls {
		setCamera( cam: THREE.Camera ): void
	}
	export const TransformGizmo: any
	export const TransformGizmoTranslate: any
	export const TransformGizmoRotate: any
	export const TransformGizmoScale: any
}
