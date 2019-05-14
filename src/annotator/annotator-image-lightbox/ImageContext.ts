import * as React from 'react'
import {ImageClick, LightboxState} from '@mapperai/mapper-annotated-scene'

export type ImageContextState = {
  lightboxState: LightboxState
  onImageMouseEnter: (id: string) => void
  onImageMouseLeave: (id: string) => void
  onImageMouseUp: (i: ImageClick) => void
}

export const initialImageContextValue: ImageContextState = {
  lightboxState: {images: []},
  onImageMouseEnter: () => {},
  onImageMouseLeave: () => {},
  onImageMouseUp: () => {},
}

export const ImageContext = React.createContext<ImageContextState>(initialImageContextValue)
export default ImageContext
