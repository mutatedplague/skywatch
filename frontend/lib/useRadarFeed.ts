'use client';

import { useEffect, useRef, useState } from 'react';
import { resolveHttpBase } from './api';
import type { LinkState, Snapshot } from './types';

function toWsUrl(httpBase: string): string {
  return `${httpBase.replace(/^http/, 'ws')}/ws`;
}

export interface RadarFeed {
  snapshot: Snapshot | null;
  link: LinkState;
  /** Populated when the very first connection attempt fails. */
  error: string | null;
}

export function useRadarFeed(): RadarFeed {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [link, setLink] = useState<LinkState>('connecting');
  const [error, setError] = useState<string | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closedRef = useRef(false);

  useEffect(() => {
    closedRef.current = false;
    const httpBase = resolveHttpBase();

    // Seed the console from REST so the scope paints before the socket opens.
    fetch(`${httpBase}/api/aircraft`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('no feed'))))
      .then((data: Snapshot) => setSnapshot((current) => current ?? data))
      .catch(() => undefined);

    const connect = () => {
      if (closedRef.current) return;
      let socket: WebSocket;
      try {
        socket = new WebSocket(toWsUrl(httpBase));
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'socket refused');
        scheduleRetry();
        return;
      }
      socketRef.current = socket;

      socket.onopen = () => {
        retryRef.current = 0;
        setLink('live');
        setError(null);
      };

      socket.onmessage = (event) => {
        try {
          setSnapshot(JSON.parse(event.data as string) as Snapshot);
        } catch {
          // A malformed frame is not worth tearing the link down for.
        }
      };

      socket.onerror = () => {
        setError(`no receiver at ${httpBase}`);
      };

      socket.onclose = () => {
        socketRef.current = null;
        if (closedRef.current) return;
        setLink('lost');
        scheduleRetry();
      };
    };

    const scheduleRetry = () => {
      retryRef.current += 1;
      const delay = Math.min(10_000, 500 * 2 ** Math.min(5, retryRef.current));
      timerRef.current = setTimeout(connect, delay);
    };

    connect();

    return () => {
      closedRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, []);

  return { snapshot, link, error };
}
