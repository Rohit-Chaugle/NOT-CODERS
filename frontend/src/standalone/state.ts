/**
 * Standalone-mode switch.
 *
 * Starts true when `VITE_STANDALONE=true`, and can be turned on at runtime when
 * an API request or the live WebSocket turns out to be unreachable. Once on it
 * never turns off for the lifetime of the page.
 */

import { STANDALONE_ENV } from "../config";

let standalone = STANDALONE_ENV;

export function isStandalone(): boolean {
  return standalone;
}

export function forceStandalone(): void {
  standalone = true;
}

/**
 * True when the backend appears to be down: a network-level failure, or a
 * gateway status (502/503/504) surfaced by the dev proxy when nothing is
 * listening upstream. Plain HTTP errors and aborts are NOT treated as down.
 */
export function isUnreachable(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === "AbortError") return false;
  if (error instanceof TypeError) return true;
  return /failed to fetch|networkerror|load failed|econnrefused|responded 50[234]\b/i.test(error.message);
}
