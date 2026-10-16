# Verdant Twin — Project Plan

AI-Powered Sustainable Campus: a digital twin of a college campus that fuses Computer Vision
and IoT sensor data to detect waste accumulation, energy wastage, water leakage, and
inefficient resource usage — then uses Generative AI to produce actionable recommendations
and sustainability reports.

---

## 1. Tech Stack

| Layer     | Technology |
|-----------|------------|
| Backend   | Python 3.13, FastAPI, SQLAlchemy 2.0 (SQLite), WebSockets (uvicorn\[standard\]) |
| Frontend  | React 19, Vite, TypeScript, Tailwind CSS v4, Framer Motion, React Three Fiber + drei, Recharts, React Router |
| AI / CV   | Pluggable stubs: CV event ingestion webhook (pipeline posts detections), GenAI recommendation/report generator (LLM-backed later) |
| Realtime  | Single WebSocket `/ws` pushing sensor readings, vision events, issues, recommendations |

---

## 2. Folder Structure

```
Verdant Twin/
├── PLAN.md                     # this document
├── README.md                   # run instructions
├── .gitignore
├── backend/
│   ├── requirements.txt
│   └── app/
│       ├── __init__.py
│       ├── main.py             # FastAPI app factory, CORS, router mounting, lifespan (DB init)
│       ├── config.py           # env-driven settings (DB URL, CORS origins, AI keys placeholder)
│       ├── database.py         # engine, SessionLocal, Base, get_db dependency, init_db()
│       ├── models.py           # SQLAlchemy ORM models (see §3)
│       ├── schemas.py          # Pydantic request/response schemas (grows with features)
│       ├── routers/
│       │   ├── __init__.py
│       │   ├── campus.py       # buildings, zones, cameras
│       │   ├── sensors.py      # sensors + readings
│       │   ├── issues.py       # issue board
│       │   ├── ai.py           # recommendations + sustainability reports (GenAI)
│       │   ├── metrics.py      # dashboard KPI summary
│       │   └── ws.py           # /ws endpoint + ConnectionManager bridge
│       ├── services/
│       │   ├── __init__.py
│       │   ├── realtime.py     # WebSocket ConnectionManager (connect/broadcast/disconnect)
│       │   ├── vision.py       # (planned) CV event triage: raw detections -> Issues
│       │   └── genai.py        # (planned) LLM recommendation + report generation
│       └── seed.py             # (planned) demo campus seed data
│   └── verdant.db              # generated SQLite file (gitignored)
└── frontend/
    ├── package.json
    ├── vite.config.ts          # react + tailwind plugins, /api and /ws proxy -> :8000
    ├── tsconfig.json / tsconfig.app.json / tsconfig.node.json
    ├── index.html
    └── src/
        ├── main.tsx            # React root + Router
        ├── App.tsx             # route table
        ├── index.css           # Tailwind v4 import + theme tokens
        ├── components/
        │   ├── Layout.tsx      # sidebar nav + topbar shell
        │   └── PagePlaceholder.tsx
        ├── pages/              # one file per route (see §6)
        ├── api/                # (planned) typed fetch client + endpoint functions
        ├── hooks/              # (planned) useWebSocket, useMetrics, useIssues ...
        ├── three/              # (planned) CampusScene, ZoneMesh, SensorMarker, overlays
        └── lib/                # (planned) formatters, severity colors, constants
```

---

## 3. Data Models (SQLAlchemy / SQLite)

All tables use integer PKs and `created_at` timestamps unless noted.

1. **Building** — `name`, `code` (unique), `category` (academic | residential | admin | amenities),
   `floors`, `area_m2`, `pos_x`, `pos_z` (3D twin coordinates), `energy_budget_kw`.
2. **Zone** — `building_id` FK, `name`, `floor`, `zone_type`
   (classroom | lab | cafeteria | hostel | restroom | corridor | garden | parking | office),
   `area_m2`. A zone is the atomic location for sensors, cameras, and issues.
3. **Sensor** — `zone_id` FK, `sensor_type` (energy | water | temperature | occupancy | humidity |
   air_quality | waste_bin), `unit`, `status` (online | offline | maintenance), `installed_at`,
   `last_seen_at`.
4. **SensorReading** — `sensor_id` FK, `ts` (index on `sensor_id, ts`), `value` (float).
   Append-only time series.
5. **CameraDevice** — `zone_id` FK, `name`, `stream_url`, `status` (online | offline), `installed_at`.
6. **VisionEvent** — `camera_id` FK, `zone_id` FK, `event_type`
   (waste_accumulation | water_leakage | energy_wastage | unoccupied_lights | bin_overflow |
   crowding), `confidence` (0–1), `severity` (low | medium | high | critical), `bbox` (JSON),
   `image_url`, `detected_at`, `status` (new | triaged | ignored).
   Produced by the external CV pipeline via `POST /api/vision/events`.
7. **Issue** — `zone_id` FK, `category` (waste | energy | water | air | other), `title`,
   `description`, `severity` (low | medium | high | critical), `status`
   (open | acknowledged | in_progress | resolved), `source` (vision | sensor | manual),
   `vision_event_id` FK nullable, `sensor_id` FK nullable, `assignee` nullable,
   `detected_at`, `resolved_at` nullable.
8. **Recommendation** — `issue_id` FK nullable, `category`, `title`, `rationale`,
   `action_steps` (text), `priority` (low | medium | high), `estimated_impact` (JSON:
   `{kwh, liters, kg, co2e_kg}`), `status` (proposed | accepted | dismissed | applied),
   `model` (GenAI model id), `created_at`.
9. **SustainabilityReport** — `period_start`, `period_end`, `overall_score` (0–100),
   `energy_kwh_saved`, `water_liters_saved`, `waste_kg_diverted`, `co2e_kg_saved`,
   `highlights_md`, `recommendations_md` (generated Markdown), `created_at`.
10. **ActivityLog** — `ts`, `level` (info | warning | alert), `source`, `message`.
    Powers the live feed on the dashboard.

Relationships: Building 1—* Zone 1—* {Sensor, CameraDevice}; Sensor 1—* SensorReading;
CameraDevice 1—* VisionEvent; VisionEvent 0..1—1 Issue; Issue 1—* Recommendation;
Issue/Recommendation 0..*—Report (via period aggregation, no hard FK).

---

## 4. API Endpoints

Base URL: `http://localhost:8000`. All JSON. CORS allows `http://localhost:5173`.

### System
| Method | Path | Purpose | Scaffold status |
|--------|------|---------|-----------------|
| GET | `/api/health` | liveness + version | implemented |

### Campus topology — `routers/campus.py`
| Method | Path | Purpose | Scaffold status |
|--------|------|---------|-----------------|
| GET | `/api/buildings` | list buildings | stub (empty list) |
| GET | `/api/buildings/{id}` | building detail | stub (404 until seeded) |
| GET | `/api/zones?building_id=` | zones, optionally per building | stub |
| GET | `/api/cameras` | camera devices | stub |

### Sensors & metrics — `routers/sensors.py`, `routers/metrics.py`
| Method | Path | Purpose | Scaffold status |
|--------|------|---------|-----------------|
| GET | `/api/sensors?zone_id=&type=` | list sensors | stub |
| GET | `/api/sensors/{id}/readings?from=&to=&limit=` | time series | stub |
| POST | `/api/sensors/{id}/readings` | ingest reading (also broadcasts) | planned |
| GET | `/api/metrics/summary` | dashboard KPIs (energy/water/waste/issues) | stub (zeros) |

### Computer vision — `routers/vision.py` (planned)
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/vision/events` | CV pipeline webhook: store event, raise Issue if threshold met, broadcast |
| GET | `/api/vision/events?status=&zone_id=` | recent detections |

### Issues — `routers/issues.py`
| Method | Path | Purpose | Scaffold status |
|--------|------|---------|-----------------|
| GET | `/api/issues?status=&severity=&category=` | filterable issue board | stub |
| GET | `/api/issues/{id}` | issue detail + linked event/recommendations | planned |
| POST | `/api/issues` | manual issue | planned |
| PATCH | `/api/issues/{id}` | update status/assignee (broadcasts) | planned |

### Generative AI — `routers/ai.py`
| Method | Path | Purpose | Scaffold status |
|--------|------|---------|-----------------|
| GET | `/api/recommendations?status=` | list AI recommendations | stub |
| POST | `/api/recommendations/generate` | GenAI: issue id(s) or "all open" -> recommendations | planned |
| PATCH | `/api/recommendations/{id}` | accept/dismiss/apply | planned |
| GET | `/api/reports` | list sustainability reports | stub |
| GET | `/api/reports/{id}` | report detail (Markdown) | planned |
| POST | `/api/reports/generate` | GenAI: period -> full sustainability report | planned |

### WebSocket
| Path | Purpose |
|------|---------|
| `ws://localhost:8000/ws` | server -> client events: `sensor:reading`, `vision:event`, `issue:created`, `issue:updated`, `recommendation:created`, `report:ready`, `alert`. Client may send `ping` -> `pong`. |

Message envelope: `{"type": "<event>", "payload": {...}, "ts": "<iso8601>"}`.

---

## 5. Detection → Recommendation Flow (target architecture)

```
Cameras ──> CV pipeline (external) ──POST /api/vision/events──> VisionEvent ──┐
Sensors ──> ingest endpoint ────────> SensorReading ── threshold rules ───────┤
                                                                             v
                                                              Issue (open, severity)
                                                                             |
                                                     POST /api/recommendations/generate
                                                                             v
                                                              Recommendation (proposed)
                                                                             |
                                                POST /api/reports/generate (period rollup)
                                                                             v
                                                         SustainabilityReport (Markdown)
```

Everything above is broadcast over `/ws` so the 3D twin and dashboard update live.

---

## 6. Frontend Pages

| Route | Page | File | Purpose (final) | Scaffold |
|-------|------|------|-----------------|----------|
| `/` | Dashboard | `pages/Dashboard.tsx` | KPI cards, live alert feed, Recharts trend charts | placeholder |
| `/twin` | Digital Twin | `pages/DigitalTwin.tsx` | R3F 3D campus: buildings, sensor pins, heat overlays, click-to-inspect zones | placeholder |
| `/issues` | Issues | `pages/Issues.tsx` | filterable issue board with status transitions | placeholder |
| `/energy` | Energy | `pages/Energy.tsx` | consumption trends, wastage detections, AI savings tips | placeholder |
| `/water` | Water | `pages/Water.tsx` | usage/flow charts, leak map, repair tracking | placeholder |
| `/waste` | Waste | `pages/Waste.tsx` | bin fill levels, accumulation events, collection routes | placeholder |
| `/reports` | Reports | `pages/Reports.tsx` | AI sustainability reports, score gauge, Markdown export | placeholder |
| `/settings` | Settings | `pages/Settings.tsx` | sensors/cameras management, AI configuration | placeholder |

Planned shared components: `Layout` (sidebar + topbar), `StatCard`, `SeverityBadge`,
`IssueCard`, `LiveFeed`, `ChartCard` (Recharts wrappers), `CampusScene` / `ZoneMesh` /
`SensorMarker` / `OverlayLayer` (three/), `MarkdownPanel`.

Planned hooks: `useWebSocket`, `useMetrics`, `useIssues`, `useSensorSeries`,
`useRecommendations`.

---

## 7. Milestones

1. **M0 — Scaffold (this deliverable):** PLAN.md, runnable backend (DB init + health + WS +
   stub routes), runnable frontend (router shell + placeholder pages), README. ✅
2. **M1 — Digital twin data:** seed campus (buildings/zones/sensors/cameras), sensor ingest,
   readings, dashboard KPIs + Recharts, live WebSocket feed.
3. **M2 — Vision & issues:** CV event webhook, auto-issue creation, issue board with filters
   and status changes.
4. **M3 — 3D twin:** R3F campus scene with sensor pins, severity heat overlays, inspection
   drawer.
5. **M4 — GenAI:** recommendation generator, sustainability report generator, reports page.
6. **M5 — Polish:** animations (Framer Motion), empty/error states, demo script, final report.

---

## 8. Conventions

- Backend runs from `backend/` (`uvicorn app.main:app --reload`), DB file `backend/verdant.db`.
- Frontend dev server on `:5173` proxies `/api` and `/ws` to `:8000` (no CORS pain in dev).
- API responses are snake_case JSON matching the model fields.
- TypeScript strict mode; components in `pages/` are route-level, shared UI in `components/`.
- No feature logic in the scaffold — stubs return empty/zero data so the UI can be built
  against stable shapes from §4.
