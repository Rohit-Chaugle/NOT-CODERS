import { useSyncExternalStore } from "react";
import { fetchIssues, liveSocketUrl, type Issue, type LiveEvent } from "../api/twin";

export type IssuesState = {
  issues: Issue[];
  connected: boolean;
  loading: boolean;
  error: string | null;
};

const MAX_FEED = 60;

let state: IssuesState = { issues: [], connected: false, loading: true, error: null };
const listeners = new Set<() => void>();
let started = false;
let socket: WebSocket | null = null;

function emit(next: Partial<IssuesState>) {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

function upsert(issue: Issue) {
  if (state.issues.some((i) => i.id === issue.id)) return;
  emit({ issues: [issue, ...state.issues].slice(0, MAX_FEED) });
}

function connect() {
  socket = new WebSocket(liveSocketUrl());
  socket.onopen = () => emit({ connected: true });
  socket.onmessage = (ev) => {
    let event: LiveEvent;
    try {
      event = JSON.parse(ev.data as string) as LiveEvent;
    } catch {
      return;
    }
    switch (event.type) {
      case "hello":
        emit({ connected: true });
        break;
      case "issue:created":
        upsert(event.payload);
        break;
      case "issue:resolved":
        emit({ issues: state.issues.filter((i) => i.id !== event.payload.id) });
        break;
      default:
        break;
    }
  };
  socket.onclose = () => {
    emit({ connected: false });
    window.setTimeout(connect, 2500);
  };
  socket.onerror = () => socket?.close();
}

/**
 * One shared live-issue subscription for the whole app (the feed is mounted in
 * two responsive slots, and the vision lab relies on the same broadcast).
 */
function start() {
  if (started) return;
  started = true;

  fetchIssues({ status: "open", limit: MAX_FEED })
    .then((res) => emit({ issues: res.issues.filter((i) => i.status === "open"), loading: false, error: null }))
    .catch((err: unknown) =>
      emit({
        loading: false,
        error: err instanceof Error ? err.message : "Failed to load issues",
      }),
    );

  connect();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  start();
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): IssuesState {
  return state;
}

/** Open issues, live-updated over /ws/live. Shared singleton store. */
export function useIssues(): IssuesState {
  return useSyncExternalStore(subscribe, getSnapshot);
}
