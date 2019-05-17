import * as React from 'react'
import {AnnotatedSceneConfig, DefaultConfig} from '@mapperai/mapper-annotated-scene'
import {GuiState} from './DatGui'

export type ContextState = {
  initialState: Partial<GuiState>
  config: AnnotatedSceneConfig
  onUpdate: (prop: string, guiState: GuiState) => void
}

export const initialValue: ContextState = {
  initialState: {} as Partial<GuiState>,
  config: DefaultConfig,
  onUpdate: () => {},
}

export default React.createContext<ContextState>(initialValue)
