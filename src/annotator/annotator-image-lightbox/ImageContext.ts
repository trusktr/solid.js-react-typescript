import * as React from 'react'
import {ImageClick, LightboxImageDescription} from '@mapperai/mapper-annotated-scene'

export type ImageContextState = {
  images: LightboxImageDescription[]
  onImageMouseEnter: (id: string) => void
  onImageMouseLeave: (id: string) => void
  onImageMouseUp: (i: ImageClick) => void
}

export const initialImageContextValue: ImageContextState = {
  images: [],
  onImageMouseEnter: () => {},
  onImageMouseLeave: () => {},
  onImageMouseUp: () => {},
}

export const ImageContext = React.createContext<ImageContextState>(initialImageContextValue)
export default ImageContext
