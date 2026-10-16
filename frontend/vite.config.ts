import { defineConfig, type ProxyOptions } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const API_TARGET = "http://127.0.0.1:8000";

/**
 * The backend API lives at the root (e.g. /twin/campus, /issues), which
 * collides with same-named client routes (/twin, /issues). Browser
 * navigations send `Accept: text/html` — those get the SPA, while XHR/fetch
 * calls (Accept: application/json) are proxied to the backend.
 */
const apiProxy: ProxyOptions = {
  target: API_TARGET,
  changeOrigin: true,
  bypass: (req) => {
    const accept = req.headers?.accept ?? "";
    if (typeof accept === "string" && accept.includes("text/html")) return "/index.html";
    return undefined;
  },
};

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/twin": apiProxy,
      "/zones": apiProxy,
      "/sensors": apiProxy,
      "/issues": apiProxy,
      "/stats": apiProxy,
      "/vision": apiProxy,
      "/ai": apiProxy,
      "/api": apiProxy,
      "/ws": {
        target: API_TARGET,
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
