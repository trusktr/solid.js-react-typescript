/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import {v4 as UUID} from 'uuid'

export const Events = {
	IMAGE_SCREEN_LOAD_UPDATE: UUID(),
	ORIGIN_UPDATE: UUID(),
	TILE_SERVICE_STATUS_UPDATE: UUID(),
	KEYUP: UUID(),
	KEYDOWN: UUID(),

	// event relating to image lightbox
	LIGHT_BOX_IMAGE_RAY_UPDATE: UUID(),
	LIGHTBOX_CLOSE: UUID(),
	IMAGE_EDIT_STATE: UUID(),
	IMAGE_CLICK: UUID(),
	GET_LIGHTBOX_IMAGE_RAYS: UUID(),
	CLEAR_LIGHTBOX_IMAGE_RAYS: UUID(),

	// Emit this event after modifying anything in the scene, so that the
	// upcoming animation frame will re-render the Three.js scene.
	SCENE_SHOULD_RENDER: UUID(),

	// called right before the SceneManager is about to re-draw the scene. Use
	// this to hook into the render cycle when you want something to be done
	// right before any redraw (but not necessarily trigger a redraw, which is
	// what SCENE_SHOULD_RENDER is for)
	SCENE_WILL_RENDER: UUID(),
}
