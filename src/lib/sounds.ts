'use client'

import { useCallback, useEffect, useRef } from 'react'

type Cue = 'correct' | 'solve' | 'wrong' | 'turn' | 'over'

const NOTES: Record<Cue, { freq: number; start: number; len: number; type: OscillatorType; gain: number }[]> = {
  correct: [
    { freq: 523.25, start: 0, len: 0.16, type: 'triangle', gain: 0.22 },
    { freq: 659.25, start: 0.09, len: 0.16, type: 'triangle', gain: 0.22 },
    { freq: 783.99, start: 0.18, len: 0.16, type: 'triangle', gain: 0.22 },
    { freq: 1046.5, start: 0.27, len: 0.34, type: 'triangle', gain: 0.26 },
  ],
  solve: [
    { freq: 880, start: 0, len: 0.2, type: 'sine', gain: 0.16 },
    { freq: 1174.66, start: 0.1, len: 0.26, type: 'sine', gain: 0.14 },
  ],
  wrong: [
    { freq: 180, start: 0, len: 0.16, type: 'sawtooth', gain: 0.1 },
    { freq: 150, start: 0.1, len: 0.2, type: 'sawtooth', gain: 0.1 },
  ],
  turn: [
    { freq: 392, start: 0, len: 0.1, type: 'sine', gain: 0.1 },
  ],
  over: [
    { freq: 523.25, start: 0, len: 0.2, type: 'triangle', gain: 0.2 },
    { freq: 392, start: 0.16, len: 0.2, type: 'triangle', gain: 0.2 },
    { freq: 523.25, start: 0.32, len: 0.2, type: 'triangle', gain: 0.2 },
    { freq: 392, start: 0.48, len: 0.5, type: 'triangle', gain: 0.22 },
  ],
}

function audioContextCtor(): typeof AudioContext | undefined {
  return window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
}

export function useSounds() {
  const contextRef = useRef<AudioContext | null>(null)
  const mutedRef = useRef(false)

  // iOS only lets an AudioContext start from a user gesture, and the cues are
  // triggered by socket events. Create and resume it on the first tap instead.
  useEffect(() => {
    const events = ['pointerdown', 'touchend', 'keydown'] as const
    const unlock = () => {
      for (const event of events) window.removeEventListener(event, unlock)
      try {
        const Ctor = audioContextCtor()
        if (!Ctor) return
        const ctx = (contextRef.current ??= new Ctor())
        if (ctx.state === 'suspended') void ctx.resume()
      } catch {
        return
      }
    }
    for (const event of events) window.addEventListener(event, unlock, { passive: true })
    return () => {
      for (const event of events) window.removeEventListener(event, unlock)
    }
  }, [])

  const play = useCallback((cue: Cue) => {
    if (mutedRef.current) return
    try {
      const Ctor = audioContextCtor()
      if (!Ctor) return
      const ctx = (contextRef.current ??= new Ctor())
      if (ctx.state === 'suspended') void ctx.resume()

      const now = ctx.currentTime
      for (const note of NOTES[cue]) {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = note.type
        osc.frequency.setValueAtTime(note.freq, now + note.start)
        gain.gain.setValueAtTime(0.0001, now + note.start)
        gain.gain.exponentialRampToValueAtTime(note.gain, now + note.start + 0.015)
        gain.gain.exponentialRampToValueAtTime(0.0001, now + note.start + note.len)
        osc.connect(gain).connect(ctx.destination)
        osc.start(now + note.start)
        osc.stop(now + note.start + note.len + 0.02)
      }
    } catch {
      return
    }
  }, [])

  const setMuted = useCallback((muted: boolean) => {
    mutedRef.current = muted
  }, [])

  return { play, setMuted }
}
