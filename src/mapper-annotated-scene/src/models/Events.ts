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

	// when something that is in the scene was modified (outside of SceneManager),
	// then SceneManager needs to know that it should re-render the WebGL scene.
	// An app can emit this event to signal re-rendering after modifying some 3D
	// object's properties.
	SCENE_SHOULD_RENDER: UUID(),
}
