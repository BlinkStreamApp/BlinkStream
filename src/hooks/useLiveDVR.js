/* eslint-disable react-hooks/immutability */
import { useState, useEffect, useCallback, useRef } from 'react'

export function useLiveDVR(videoRef, hlsRef) {
  const [delayFromLive, setDelayFromLive] = useState(0)
  const [isAtLiveEdge, setIsAtLiveEdge] = useState(true)
  const [bufferDuration, setBufferDuration] = useState(0)
  const [bufferStart, setBufferStart] = useState(0)
  const [liveEdgeTime, setLiveEdgeTime] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)

  const animationFrameRef = useRef(null)

  const updateDVRMetrics = useCallback(() => {
    const video = videoRef?.current
    if (!video) return

    const seekable = video.seekable
    let liveEnd
    let start = 0

    const hls = hlsRef?.current
    if (hls && typeof hls.liveSyncPosition === 'number' && hls.liveSyncPosition > 0) {
      liveEnd = hls.liveSyncPosition
    } else if (seekable && seekable.length > 0) {
      liveEnd = seekable.end(seekable.length - 1)
      start = seekable.start(0)
    } else {
      liveEnd = video.duration || video.currentTime || 0
      start = 0
    }

    const current = video.currentTime || 0
    const delay = Math.max(0, liveEnd - current)
    const isLive = delay <= 2.5
    const totalBuf = Math.max(0, liveEnd - start)

    setDelayFromLive(Math.floor(delay))
    setIsAtLiveEdge(isLive)
    setBufferDuration(totalBuf)
    setBufferStart(start)
    setLiveEdgeTime(liveEnd)
    setCurrentTime(current)
  }, [videoRef, hlsRef])

  useEffect(() => {
    let active = true

    const poll = () => {
      if (!active) return
      updateDVRMetrics()
      animationFrameRef.current = setTimeout(poll, 500)
    }

    poll()

    return () => {
      active = false
      if (animationFrameRef.current) {
        clearTimeout(animationFrameRef.current)
      }
    }
  }, [updateDVRMetrics])

  const seekToLive = useCallback(() => {
    const video = videoRef?.current
    const hls = hlsRef?.current
    if (!video) return

    if (hls && typeof hls.liveSyncPosition === 'number' && hls.liveSyncPosition > 0) {
      video.currentTime = hls.liveSyncPosition
    } else if (video.seekable && video.seekable.length > 0) {
      video.currentTime = Math.max(0, video.seekable.end(video.seekable.length - 1) - 0.5)
    } else {
      video.currentTime = liveEdgeTime || video.duration || 0
    }
    updateDVRMetrics()
  }, [videoRef, hlsRef, liveEdgeTime, updateDVRMetrics])

  const seekRelative = useCallback((deltaSeconds) => {
    const video = videoRef?.current
    if (!video) return

    const current = video.currentTime || 0
    const target = current + deltaSeconds

    let minTime = 0
    let maxTime = liveEdgeTime || video.duration || current

    if (video.seekable && video.seekable.length > 0) {
      minTime = video.seekable.start(0)
      maxTime = video.seekable.end(video.seekable.length - 1)
    }

    video.currentTime = Math.max(minTime, Math.min(maxTime, target))
    updateDVRMetrics()
  }, [videoRef, liveEdgeTime, updateDVRMetrics])

  const seekToPercent = useCallback((percent) => {
    const video = videoRef?.current
    if (!video) return

    const clampedPercent = Math.max(0, Math.min(100, Number(percent) || 0)) / 100
    const target = bufferStart + (bufferDuration * clampedPercent)

    video.currentTime = target
    updateDVRMetrics()
  }, [videoRef, bufferStart, bufferDuration, updateDVRMetrics])

  return {
    delayFromLive,
    isAtLiveEdge,
    bufferDuration,
    bufferStart,
    liveEdgeTime,
    currentTime,
    seekToLive,
    seekRelative,
    seekToPercent,
  }
}
