import * as React from 'react'
import {ImageClick, LightboxState, SceneEmitter} from '@mapperai/mapper-annotated-scene'

export type ImageContextState = {
  lightboxState: LightboxState
  onImageMouseEnter: (id: string) => void
  onImageMouseLeave: (id: string) => void
  onImageMouseUp: (i: ImageClick) => void
  channel: SceneEmitter
}

export const initialImageContextValue: ImageContextState = {
  lightboxState: {images: []},
  onImageMouseEnter: () => {},
  onImageMouseLeave: () => {},
  onImageMouseUp: () => {},
  // we're relying on the fact that we don't use the initial value of channel
  channel: ({} as unknown) as SceneEmitter,
}

export const ImageContext = React.createContext<ImageContextState>(initialImageContextValue)
export default ImageContext
