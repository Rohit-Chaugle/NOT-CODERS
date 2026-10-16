/**
 * Constants for the in-browser standalone engine.
 *
 * These mirror the backend defaults in `backend/app/config.py` so the
 * standalone twin behaves like the FastAPI one without a server.
 */

export const SIM_INTERVAL_SECONDS = 2;
export const SIM_MAX_ANOMALIES = 5;
export const SIM_ANOMALY_CHANCE = 0.35;

export const WASTE_THRESHOLD = 90;
export const ENERGY_WASTE_WATTS = 1400;
export const WATER_LEAK_LPM = 8;
export const INEFFICIENT_FACTOR = 1.8;
export const ISSUE_COOLDOWN_SECONDS = 300;

export const VISION_CONF = 0.35;
export const VISION_ISSUE_COOLDOWN = 90;

export const AI_RECOMMENDATION_LIMIT = 6;
