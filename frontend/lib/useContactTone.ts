'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { Aircraft } from './types';

/**
 * A short synthesised tone when a contact first enters the airspace, and a
 * lower double-tone when one goes overhead. Audio starts muted: browsers only
 * allow an AudioContext to run after a gesture, and the toggle is that gesture.
 */
export function useContactTone(aircraft: Aircraft[], enabled: boolean) {
  const contextRef = useRef<AudioContext | null>(null);
  const knownRef = useRef<Set<string>>(new Set());
  const overheadRef = useRef<Set<string>>(new Set());
  const primedRef = useRef(false);

  const tone = useCallback((frequency: number, durationMs: number, gain: number) => {
    const context = contextRef.current;
    if (!context) return;
    const oscillator = context.createOscillator();
    const amp = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    const now = context.currentTime;
    amp.gain.setValueAtTime(0, now);
    amp.gain.linearRampToValueAtTime(gain, now + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);
    oscillator.connect(amp).connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + durationMs / 1000 + 0.02);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    if (!contextRef.current) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      contextRef.current = new Ctor();
    }
    void contextRef.current.resume();
  }, [enabled]);

  useEffect(() => {
    const known = knownRef.current;
    const overhead = overheadRef.current;
    const seen = new Set<string>();
    let arrivals = 0;
    let overheadArrivals = 0;

    for (const contact of aircraft) {
      seen.add(contact.hex);
      if (!known.has(contact.hex)) {
        known.add(contact.hex);
        arrivals += 1;
      }
      if (contact.overhead && !overhead.has(contact.hex)) {
        overhead.add(contact.hex);
        overheadArrivals += 1;
      } else if (!contact.overhead) {
        overhead.delete(contact.hex);
      }
    }

    for (const hex of known) if (!seen.has(hex)) known.delete(hex);

    // The first frame is the whole existing picture, not a wave of arrivals.
    if (!primedRef.current) {
      primedRef.current = aircraft.length > 0;
      return;
    }
    if (!enabled || !contextRef.current) return;

    if (overheadArrivals > 0) {
      tone(320, 420, 0.07);
      window.setTimeout(() => tone(240, 520, 0.06), 190);
    } else if (arrivals > 0) {
      tone(880, 110, 0.035);
    }
  }, [aircraft, enabled, tone]);

  useEffect(() => {
    return () => {
      void contextRef.current?.close();
      contextRef.current = null;
    };
  }, []);
}
