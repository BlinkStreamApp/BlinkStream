

import React from 'react'
import { useGlobalRecording } from '../../hooks/useGlobalRecording'
import { RecordingContext } from './recordingContextValue'

export function RecordingProvider({ children }) {
  const value = useGlobalRecording()
  return React.createElement(RecordingContext.Provider, { value }, children)
}
