/**
 * Live-channel adapter.
 *
 * Returns a WebSocket-like object so the hooks do not care whether events come
 * from the real `/ws/live` endpoint or the in-browser standalone engine. When
 * the backend is unreachable (or standalone mode was requested) it transparently
 * falls back to the engine's pub/sub and re-emits the same event envelope.
 */

import { engine } from "../standalone/engine";
import { forceStandalone, isStandalone } from "../standalone/state";
import { liveSocketUrl } from "./twin";

export type LiveSocket = {
  onopen: (() => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  close: () => void;
};

export function openLiveSocket(): LiveSocket {
  const socket: LiveSocket = {
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
    close: () => {},
  };

  let ws: WebSocket | null = null;
  let unsubscribe: (() => void) | null = null;
  let opened = false;
  let closed = false;

  const attachEngine = () => {
    if (closed || unsubscribe) return;
    forceStandalone();
    unsubscribe = engine.subscribe((event) => {
      socket.onmessage?.({ data: JSON.stringify(event) });
    });
    if (!opened) {
      opened = true;
      socket.onopen?.();
    }
  };

  if (isStandalone()) {
    queueMicrotask(attachEngine);
  } else {
    try {
      ws = new WebSocket(liveSocketUrl());
      ws.onopen = () => {
        opened = true;
        socket.onopen?.();
      };
      ws.onmessage = (event) => socket.onmessage?.({ data: String(event.data) });
      ws.onerror = () => {
        if (!opened) attachEngine();
      };
      ws.onclose = () => {
        if (!opened) {
          attachEngine();
          return;
        }
        if (!closed) socket.onclose?.();
      };
    } catch {
      queueMicrotask(attachEngine);
    }
  }

  socket.close = () => {
    closed = true;
    unsubscribe?.();
    ws?.close();
  };

  return socket;
}
