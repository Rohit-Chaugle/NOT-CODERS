const API = import.meta.env.VITE_API_URL || "http://localhost:8000";
export const API_URL = API;
export const WS_URL = API.replace(/^http/, "ws");