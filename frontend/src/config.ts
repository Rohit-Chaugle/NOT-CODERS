const API = import.meta.env.VITE_API_URL || "http://localhost:8000";
export const API_URL = API;
export const WS_URL = API.replace(/^http/, "ws");

/**
 * Standalone mode runs the whole digital twin in the browser (seed data,
 * sensor simulator, detection, GenAI templates) with no backend. Enabled
 * explicitly with `VITE_STANDALONE=true`, or automatically at runtime when the
 * API turns out to be unreachable.
 */
export const STANDALONE_ENV = String(import.meta.env.VITE_STANDALONE ?? "").toLowerCase() === "true";