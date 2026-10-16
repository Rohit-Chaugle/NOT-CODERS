# Verdant Twin

AI-Powered Sustainable Campus — a **living digital twin** of a university campus that integrates
Computer Vision and IoT sensor data to detect waste accumulation, energy wastage, water
leakage, and inefficient resource usage, with Generative AI producing actionable
recommendations and official sustainability reports.

---

## Architecture & Features

- **Living 3D Digital Twin**: React Three Fiber interactive WebGL model of the campus topology with real-time zone telemetry, building inspection, day/night cycles, and anomaly heat beacons.
- **Rule & Vision Detection Engine**: Automated detection of water leaks, energy spikes in empty rooms, and waste overflow.
- **Pluggable Generative AI Layer**:
  - LLM provider chosen dynamically by environment variables (**OpenAI**, **Gemini**, or **Anthropic**).
  - Resilient offline fallback using deterministic facilities templates if no key is configured.
  - Prioritized actionable recommendations with calculated daily savings (kWh, L water, kg waste).
  - Campus Green Score algorithm (0–100) with explainable component weights.
  - Formatted Sustainability Reports with Markdown and downloadable PDF export.
  - Conversational AI Copilot with streaming typewriter response and prompt suggestion chips.
- **Sustainability Leaderboard**: Live ranking of campus buildings by sustainability performance with smooth, animated rank transitions.
- **Demo Mode for Judges**: 1-click scripted sequential anomaly injection (Hostel water leak → Labs energy spike → Canteen waste overflow) to see detection, live WebSocket alerts, sound-free toast notifications, and AI recommendations in action.
- **Production Polish**: Sound-free toast notifications, loading skeletons, empty states, and error boundary handling.

---

## Tech Stack

- **Backend:** Python 3.11+ · FastAPI · SQLAlchemy 2.0 (SQLite) · WebSockets · ReportLab (PDF) · Pillow
- **Frontend:** React 19 · Vite 8 · TypeScript · Tailwind CSS v4 · Framer Motion · React Three Fiber (Three.js) · Recharts · React Router v7

---

## Quickstart & Setup

### Prerequisites
- Python 3.11+
- Node.js 20.19+ (Node 22+ recommended)
- npm

### 1. Start the Backend

```bash
cd backend
python -m venv .venv
```

**Windows (PowerShell):**
```powershell
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload
```

**macOS / Linux:**
```bash
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

- API Base URL: `http://127.0.0.1:8000`
- Interactive OpenAPI Docs: `http://127.0.0.1:8000/docs`
- Health check: `http://127.0.0.1:8000/api/health`

### 2. Optional: Configure Live LLM Provider
Set any of the following environment variables before starting the backend:
```bash
# For Google Gemini:
export GEMINI_API_KEY="your-gemini-key"

# For OpenAI:
export OPENAI_API_KEY="your-openai-key"

# For Anthropic:
export ANTHROPIC_API_KEY="your-anthropic-key"
```
*Note: If no API key is set, Verdant Twin automatically falls back to its offline deterministic template engine so every endpoint and UI feature remains 100% operational.*

### 3. Start the Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

---

## Demo Script for Judges

To showcase the complete end-to-end autonomous digital twin, follow these steps:

1. **Top Bar — Demo Mode**:
   - In the top HUD navigation bar, locate the glowing **Demo Mode** button (`💧 Demo Mode: Step 1/3`).
   - Click it once: triggers a **Sustained Water Leak in the Student Hostel** (18.4 L/min).
   - Observe: A sound-free toast notification appears, the issue immediately appears in the left Signal Feed via WebSocket, and the 3D twin pin turns critical red.
2. **AI Copilot & Recommendations**:
   - In the right-hand **AI Copilot** panel, click **Actions**: observe the prioritized recommendation with facilities instructions and estimated savings (**~3,072 L/day saved**).
   - Switch to **Chat Copilot**: ask *"What should we fix first?"* or *"Are there any water leaks?"* and watch the streaming typewriter response quote the exact live numbers.
3. **Trigger Subsequent Anomalies**:
   - Click **Demo Mode: Step 2/3**: triggers an **Unoccupied Energy Spike in the Science Labs** (4.8 kW draw at 0 occupancy).
   - Click **Demo Mode: Step 3/3**: triggers a **Critical Waste Overflow at the Central Canteen** (98.5% bin capacity).
4. **Building Sustainability Leaderboard**:
   - Navigate to **Overview** (`/`) to view the **Campus Sustainability Leaderboard**.
   - Notice the animated rank transitions as buildings shuffle dynamically based on their open issues, water leaks, and energy draws.
5. **Generate Sustainability Report & PDF Export**:
   - In the AI Copilot panel or on the **Reports** (`/reports`) page, click **Generate Sustainability Report**.
   - Review the modal preview (Green Score breakdown, vital sign metrics, trends, prioritized actions) or toggle to raw Markdown.
   - Click **Download PDF Report** to export the official campus sustainability document.
6. **Resolving Issues**:
   - Navigate to **Issues** (`/issues`) to see the filterable issue board (by severity and category).
   - Click **✓ Resolve** on an issue: watch it close live, update the leaderboard rank, and adjust the campus Green Score.

---

## Key API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | System health and version |
| `GET` | `/twin/campus` | Campus topology with buildings, zones, and sensors |
| `POST` | `/twin/demo/anomaly?step={1,2,3}` | Scripted anomaly trigger for live judge demonstration |
| `GET` | `/stats/summary` | Global resource usage and telemetry summary |
| `GET` | `/stats/leaderboard` | Ranked buildings sustainability leaderboard |
| `POST` | `/ai/recommendations` | Prioritized recommendations with estimated savings |
| `POST` | `/ai/report` | Markdown sustainability report with Green Score (0–100) and PDF export |
| `GET` | `/ai/report/pdf` | Direct download of the ReportLab PDF document |
| `POST` | `/ai/chat` | Campus digital twin AI conversational assistant |
| `GET` | `/ai/provider` | Active LLM provider configuration and status |
| `WS` | `/ws/live` | Real-time WebSocket event stream |

---

## Testing & Verification

**Frontend Build & Typecheck:**
```bash
cd frontend
npm run typecheck
npm run build
```

**Backend Test Suite:**
```bash
cd backend
python -m pytest tests/test_ai.py
```
