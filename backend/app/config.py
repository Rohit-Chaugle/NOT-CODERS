"""Application configuration, driven by environment variables."""

import os

APP_NAME = "Verdant Twin API"
APP_VERSION = "0.2.0"

# SQLite file lives next to the backend/ folder (backend/verdant.db by default).
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATABASE_URL = os.getenv("VERDANT_DATABASE_URL", f"sqlite:///{os.path.join(BASE_DIR, 'verdant.db')}")

# Comma separated list, e.g. "http://localhost:5173,http://127.0.0.1:5173"
CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "VERDANT_CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if origin.strip()
]

# --- Sensor simulator -------------------------------------------------------
SIM_ENABLED = os.getenv("VERDANT_SIM_ENABLED", "1").lower() not in {"0", "false", "no"}
SIM_INTERVAL_SECONDS = float(os.getenv("VERDANT_SIM_INTERVAL", "2"))
# Max concurrent injected anomalies and per-tick injection probability.
SIM_MAX_ANOMALIES = int(os.getenv("VERDANT_SIM_MAX_ANOMALIES", "5"))
SIM_ANOMALY_CHANCE = float(os.getenv("VERDANT_SIM_ANOMALY_CHANCE", "0.35"))
# Readings older than this are periodically pruned (hours).
SIM_RETENTION_HOURS = float(os.getenv("VERDANT_SIM_RETENTION_HOURS", "6"))

# --- Detection thresholds ---------------------------------------------------
DETECTION_ENABLED = os.getenv("VERDANT_DETECTION_ENABLED", "1").lower() not in {"0", "false", "no"}
WASTE_THRESHOLD = float(os.getenv("VERDANT_WASTE_THRESHOLD", "90"))          # % bin fill
ENERGY_WASTE_WATTS = float(os.getenv("VERDANT_ENERGY_WASTE_WATTS", "1400"))  # W with no occupants
WATER_LEAK_LPM = float(os.getenv("VERDANT_WATER_LEAK_LPM", "8"))             # L/min, ~constant
INEFFICIENT_FACTOR = float(os.getenv("VERDANT_INEFFICIENT_FACTOR", "1.8"))   # vs zone-type peers
# An open issue of the same type for a zone is not recreated within this window.
ISSUE_COOLDOWN_SECONDS = float(os.getenv("VERDANT_ISSUE_COOLDOWN", "300"))

# --- Computer vision --------------------------------------------------------
VISION_ENABLED = os.getenv("VERDANT_VISION_ENABLED", "1").lower() not in {"0", "false", "no"}
# Weights for ultralytics YOLO. Empty means "yolo11n.pt" (auto-downloaded on
# first use when ultralytics is installed).
VISION_MODEL = os.getenv("VERDANT_VISION_MODEL", "")
VISION_CONF = float(os.getenv("VERDANT_VISION_CONF", "0.35"))   # box confidence
VISION_IOU = float(os.getenv("VERDANT_VISION_IOU", "0.45"))     # NMS threshold
VISION_MAX_BYTES = int(os.getenv("VERDANT_VISION_MAX_BYTES", str(8 * 1024 * 1024)))
# When the model/weights are unavailable, fall back to the mock detector so the
# demo never breaks. Set to 0 to surface the real error instead.
VISION_FALLBACK = os.getenv("VERDANT_VISION_FALLBACK", "1").lower() not in {"0", "false", "no"}
# Vision-specific duplicate window (shorter than ISSUE_COOLDOWN_SECONDS so
# repeated scans in the lab keep producing results).
VISION_ISSUE_COOLDOWN = float(os.getenv("VERDANT_VISION_ISSUE_COOLDOWN", "90"))

# --- Generative AI ----------------------------------------------------------
AI_ENABLED = os.getenv("VERDANT_AI_ENABLED", "1").lower() not in {"0", "false", "no"}
# auto | openai | gemini | anthropic | template
LLM_PROVIDER = os.getenv("VERDANT_LLM_PROVIDER", "auto").strip().lower()
LLM_TIMEOUT = float(os.getenv("VERDANT_LLM_TIMEOUT", "30"))
LLM_MAX_TOKENS = int(os.getenv("VERDANT_LLM_MAX_TOKENS", "900"))
LLM_TEMPERATURE = float(os.getenv("VERDANT_LLM_TEMPERATURE", "0.4"))
# When a live provider is configured but fails, fall back to the templates.
LLM_FALLBACK = os.getenv("VERDANT_LLM_FALLBACK", "1").lower() not in {"0", "false", "no"}

OPENAI_API_KEY = os.getenv("VERDANT_OPENAI_API_KEY") or os.getenv("OPENAI_API_KEY", "")
OPENAI_MODEL = os.getenv("VERDANT_OPENAI_MODEL", "gpt-4o-mini")
GEMINI_API_KEY = (
    os.getenv("VERDANT_GEMINI_API_KEY")
    or os.getenv("GEMINI_API_KEY")
    or os.getenv("GOOGLE_API_KEY", "")
)
GEMINI_MODEL = os.getenv("VERDANT_GEMINI_MODEL", "gemini-2.0-flash")
ANTHROPIC_API_KEY = os.getenv("VERDANT_ANTHROPIC_API_KEY") or os.getenv("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL = os.getenv("VERDANT_ANTHROPIC_MODEL", "claude-3-5-haiku-latest")

# How many recommendations / issues to feed the model and return.
AI_RECOMMENDATION_LIMIT = int(os.getenv("VERDANT_AI_RECOMMENDATION_LIMIT", "6"))
