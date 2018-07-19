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

  // when something that is in the scene was modified (outside of SceneManager),
  // then SceneManager needs to know that it should re-render the WebGL scene.
  // An app can emit this event to signal re-rendering after modifying some 3D
  // object's properties.
  SCENE_SHOULD_RENDER: UUID(),

  // INTERSECTION_REQUEST is emitted by the annotated scene lib when getting an
  // intersection from a click. This allows the opportunity for the app to
  // provide a specific intersection point for placing an annotation. F.e.
  // Annotator app uses it it to place traffic devices on image rays.
  INTERSECTION_REQUEST: UUID(),

}
