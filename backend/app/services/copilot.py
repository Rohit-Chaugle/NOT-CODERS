"""Generative AI layer: recommendations, reports and chat about campus state.

Design principle: **numbers are computed deterministically, prose comes from the
LLM.** Every recommendation's savings figure, the Green Score and the report's
metrics are derived from the database by the functions here. A live LLM (if
configured — see app.services.llm) is then used to write the summary, action
text and narrative. When no provider/key is available the same structure is
filled by templates, so every endpoint stays useful offline.
"""

from __future__ import annotations

import base64
import json
import logging
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import AI_ENABLED, AI_RECOMMENDATION_LIMIT, SIM_INTERVAL_SECONDS
from app.models import Building, Issue, SensorReading, Zone
from app.queries import campus_summary, latest_values, sensors_of_type
from app.serializers import serialize_issue
from app.services import llm
from app.services.pdf import generate_sustainability_pdf

logger = logging.getLogger("verdant.copilot")

SEVERITY_ORDER = {"critical": 0, "high": 1, "medium": 2, "low": 3}
SEVERITY_POINTS = {"critical": 50, "high": 38, "medium": 24, "low": 12}

# Assumptions behind the savings estimates (documented so they can be tuned).
NIGHT_HOURS = 8.0        # unoccupied hours an overnight issue wastes
WASTE_FRACTION = 0.6     # share of an unoccupied zone's draw that is avoidable
LEAK_RECOVERY = 0.8      # share of a detected constant flow that is recoverable
PEER_EXCESS_FRACTION = 0.25

CATEGORY_LABEL = {
    "energy": "Energy",
    "water": "Water",
    "waste": "Waste",
    "efficiency": "Efficiency",
}

TYPE_TO_CATEGORY = {
    "energy_wastage": "energy",
    "water_leakage": "water",
    "waste_accumulation": "waste",
    "inefficient_usage": "efficiency",
}


# ---------------------------------------------------------------------------
# Derived context
# ---------------------------------------------------------------------------


def zone_current(db: Session) -> dict[int, dict[str, float]]:
    """zone_id -> latest {energy, water, waste, occupancy} values."""
    latest = latest_values(db)
    out: dict[int, dict[str, float]] = {}
    for sensor_type in ("energy", "water", "waste", "occupancy"):
        for sensor_id, zone_id in sensors_of_type(db, sensor_type).items():
            if sensor_id in latest:
                out.setdefault(zone_id, {})[sensor_type] = latest[sensor_id]
    return out


def open_issues(db: Session, limit: int = 40) -> list[Issue]:
    return (
        db.query(Issue)
        .filter(Issue.status == "open")
        .order_by(Issue.detected_at.desc(), Issue.id.desc())
        .limit(limit)
        .all()
    )


def green_score(summary: dict) -> dict:
    """A 0-100 campus sustainability score with an explainable breakdown."""
    energy_kw = float(summary["energy"]["current_kw"])
    budgets = summary.get("energy", {}).get("budget_kw")
    ratio = (energy_kw / budgets) if budgets else None

    # Energy: comfortable at/under 70% of budget, zero points at 160%.
    if ratio is None:
        energy_score = 78.0
        energy_detail = "Baseline estimate (no energy budget configured)."
    else:
        energy_score = _clamp(100 - max(0.0, (ratio - 0.7) / 0.9 * 100))
        energy_detail = f"Drawing {energy_kw:.1f} kW against a {budgets:.1f} kW budget ({ratio:.0%})."

    # Waste: full marks at/under 55% average fill, zero at 100%.
    avg_fill = float(summary["waste"]["avg_fill_pct"])
    waste_score = _clamp(100 - max(0.0, (avg_fill - 55) / 45 * 100))
    waste_detail = f"Average bin fill {avg_fill:.0f}%, {summary['waste']['overflow_bins']} overflowing."

    # Water: penalised per open leak, plus current constant-flow pressure.
    open_types = summary["issues"].get("by_type", {})
    leak_count = int(open_types.get("water_leakage", 0))
    water_score = _clamp(100 - 15 * leak_count - max(0.0, summary["water"]["current_lpm"] - 20) * 1.5)
    water_detail = f"{leak_count} open leakage issue(s), {summary['water']['current_lpm']:.1f} L/min live flow."

    # Issue health: weighted open-issue burden.
    severity_counts = summary["issues"].get("by_severity", {})
    burden = sum(SEVERITY_POINTS.get(sev, 0) * int(count) for sev, count in severity_counts.items())
    issue_score = _clamp(100 - burden)
    issue_detail = f"{summary['issues']['open']} open issue(s): " + ", ".join(
        f"{count} {sev}" for sev, count in sorted(severity_counts.items(), key=lambda kv: SEVERITY_ORDER.get(kv[0], 9))
    ) or "none."

    # Resolution: share of all issues that have been closed.
    total = int(summary["issues"]["total"])
    resolved = int(summary["issues"]["resolved"])
    resolution_score = _clamp(100 * resolved / total) if total else 100.0
    resolution_detail = f"{resolved}/{total} issues resolved to date."

    components = [
        {"key": "energy", "label": "Energy efficiency", "score": round(energy_score), "weight": 0.25, "detail": energy_detail},
        {"key": "waste", "label": "Waste management", "score": round(waste_score), "weight": 0.20, "detail": waste_detail},
        {"key": "water", "label": "Water stewardship", "score": round(water_score), "weight": 0.15, "detail": water_detail},
        {"key": "issues", "label": "Issue health", "score": round(issue_score), "weight": 0.30, "detail": issue_detail},
        {"key": "resolution", "label": "Resolution rate", "score": round(resolution_score), "weight": 0.10, "detail": resolution_detail},
    ]
    total_score = round(sum(c["score"] * c["weight"] for c in components))

    if total_score >= 88:
        grade = "A"
    elif total_score >= 76:
        grade = "B"
    elif total_score >= 62:
        grade = "C"
    elif total_score >= 48:
        grade = "D"
    else:
        grade = "E"

    return {
        "score": total_score,
        "grade": grade,
        "label": {
            "A": "Thriving",
            "B": "Healthy",
            "C": "Needs attention",
            "D": "Strained",
            "E": "Critical",
        }[grade],
        "components": components,
    }


def trends(db: Session, hours: int = 6) -> list[dict]:
    """Recent vs previous window for energy and water, from raw readings."""
    now = datetime.now()
    recent_start = now - timedelta(hours=hours)
    previous_start = recent_start - timedelta(hours=hours)

    def window_total(sensor_type: str, start: datetime, end: datetime, factor: float) -> float:
        total = (
            db.query(func.coalesce(func.sum(SensorReading.value), 0.0))
            .join(__import__("app.models", fromlist=["Sensor"]).Sensor, isouter=False)
            .filter(
                __import__("app.models", fromlist=["Sensor"]).Sensor.sensor_type == sensor_type,
                __import__("app.models", fromlist=["Sensor"]).Sensor.id
                == SensorReading.sensor_id,
                SensorReading.ts >= start,
                SensorReading.ts < end,
            )
            .scalar()
        )
        return float(total or 0.0) * factor

    energy_factor = SIM_INTERVAL_SECONDS / 3_600_000.0
    water_factor = SIM_INTERVAL_SECONDS / 60.0

    out = []
    for sensor_type, unit, factor in (
        ("energy", "kWh", energy_factor),
        ("water", "L", water_factor),
    ):
        recent = window_total(sensor_type, recent_start, now, factor)
        previous = window_total(sensor_type, previous_start, recent_start, factor)
        change = ((recent - previous) / previous * 100) if previous > 0 else 0.0
        out.append(
            {
                "resource": sensor_type,
                "unit": unit,
                "window_hours": hours,
                "recent": round(recent, 2),
                "previous": round(previous, 2),
                "change_pct": round(change, 1),
            }
        )
    return out


def resolved_recently(db: Session, hours: int = 24) -> int:
    cutoff = datetime.now() - timedelta(hours=hours)
    return (
        db.query(func.count(Issue.id))
        .filter(Issue.status == "resolved", Issue.resolved_at.isnot(None), Issue.resolved_at >= cutoff)
        .scalar()
        or 0
    )


# ---------------------------------------------------------------------------
# Recommendations
# ---------------------------------------------------------------------------


def _savings_for(issue: Issue | dict, current: dict[str, float]) -> dict[str, float]:
    """Estimate kWh / litres / kg saved per day by fixing this issue."""
    energy_w = current.get("energy", 0.0) or 1500.0
    water_lpm = current.get("water", 0.0) or 8.0
    fill = current.get("waste", 0.0) or 90.0

    issue_type = issue.type if isinstance(issue, Issue) else issue.get("type", "energy_wastage")

    if issue_type == "energy_wastage":
        return {"est_kwh_saved": round(energy_w / 1000 * NIGHT_HOURS * WASTE_FRACTION, 1), "est_litres_saved": 0.0, "est_kg_saved": 0.0}
    if issue_type == "inefficient_usage":
        return {"est_kwh_saved": round(energy_w / 1000 * NIGHT_HOURS * PEER_EXCESS_FRACTION, 1), "est_litres_saved": 0.0, "est_kg_saved": 0.0}
    if issue_type == "water_leakage":
        return {"est_kwh_saved": 0.0, "est_litres_saved": round(water_lpm * 60 * NIGHT_HOURS * LEAK_RECOVERY, 1), "est_kg_saved": 0.0}
    if issue_type == "waste_accumulation":
        return {"est_kwh_saved": 0.0, "est_litres_saved": 0.0, "est_kg_saved": round(2.0 + min(fill, 100) / 100 * 3.5, 1)}
    return {"est_kwh_saved": 0.0, "est_litres_saved": 0.0, "est_kg_saved": 0.0}


def candidate_recommendations(
    db: Session,
    limit: int = AI_RECOMMENDATION_LIMIT,
    issues_override: list[dict | Issue] | None = None,
    stats_override: dict | None = None,
) -> list[dict]:
    """Deterministic, grounded recommendations derived from open issues or supplied override."""
    current_by_zone = zone_current(db)
    raw_issues = issues_override if issues_override is not None else open_issues(db, limit=60)

    candidates: list[dict] = []
    for item in raw_issues:
        if isinstance(item, Issue):
            if item.zone_id is None or not item.zone:
                continue
            zone = item.zone
            building = zone.building
            issue_id = item.id
            issue_type = item.type
            title = item.title
            desc = item.description
            severity = item.severity
            source = item.source
            zone_id = zone.id
            zone_name = zone.name
            building_name = building.name if building else "Campus"
            building_code = building.code if building else None
            current = current_by_zone.get(zone.id, {})
        else:
            issue_id = item.get("id", len(candidates) + 1)
            issue_type = item.get("type", "energy_wastage")
            title = item.get("title") or issue_type.replace("_", " ").title()
            desc = item.get("description") or item.get("rationale", "")
            severity = item.get("severity", "medium")
            source = item.get("source", "sensor")
            zone_id = item.get("zone_id")
            zone_name = item.get("zone_name") or item.get("zone", "Zone")
            building_name = item.get("building_name") or item.get("building", "Campus")
            building_code = item.get("building_code")
            current = current_by_zone.get(zone_id, {}) if zone_id else {}

        savings = _savings_for(item, current)
        category = TYPE_TO_CATEGORY.get(issue_type, "efficiency")

        impact_units = (
            savings["est_kwh_saved"]
            + savings["est_litres_saved"] / 40.0
            + savings["est_kg_saved"] * 4.0
        )
        score = min(100.0, SEVERITY_POINTS.get(severity, 15) + min(35.0, impact_units))
        quick_win = severity in {"high", "critical"} and (
            savings["est_kwh_saved"] < 12 and savings["est_litres_saved"] < 900
        )
        if quick_win:
            score = min(100.0, score + 8)

        candidates.append(
            {
                "id": f"rec-{issue_id}",
                "issue_ids": [issue_id],
                "title": title,
                "action": _default_action_for(issue_type, zone_name, building_name),
                "rationale": desc,
                "location": {
                    "building": building_name,
                    "building_code": building_code,
                    "zone": zone_name,
                    "zone_id": zone_id,
                },
                "category": category,
                "priority": _priority_label(score),
                "priority_score": round(score, 1),
                "type": issue_type,
                "source": source,
                "timeframe": _timeframe(severity),
                "quick_win": quick_win,
                "confidence": 0.9 if source == "sensor" else 0.78,
                **savings,
            }
        )

    # Proactive suggestions when there is nothing burning.
    if len(candidates) < 3 and issues_override is None:
        candidates.extend(_proactive_recommendations(db))

    candidates.sort(key=lambda c: c["priority_score"], reverse=True)
    return candidates[:limit]


def _default_action_for(issue_type: str, zone_name: str, building_name: str) -> str:
    return {
        "energy_wastage": f"Send a facilities pass to switch off idle equipment in {zone_name} and put the zone on the night shutdown schedule for {building_name}.",
        "water_leakage": f"Dispatch maintenance to pressure-test fixtures and pipework serving {zone_name} ({building_name}) and isolate the constant flow.",
        "waste_accumulation": f"Add an extra collection round for {zone_name} and right-size the bin capacity in {building_name}.",
        "inefficient_usage": f"Review the equipment schedule in {zone_name} against comparable zones and re-tune setpoints in {building_name}.",
    }.get(issue_type, f"Inspect {zone_name} in {building_name} and resolve the flagged condition.")


def _default_action(issue: Issue | dict, zone_name: str, building_name: str) -> str:
    issue_type = issue.type if isinstance(issue, Issue) else issue.get("type", "energy_wastage")
    return _default_action_for(issue_type, zone_name, building_name)


def _timeframe(severity: str) -> str:
    return {"critical": "today", "high": "24h", "medium": "this week", "low": "this month"}.get(severity, "this week")


def _priority_label(score: float) -> str:
    if score >= 80:
        return "critical"
    if score >= 60:
        return "high"
    if score >= 40:
        return "medium"
    return "low"


def _proactive_recommendations(db: Session) -> list[dict]:
    summary = campus_summary(db)
    out: list[dict] = []
    if summary["waste"]["avg_fill_pct"] >= 55:
        out.append(
            {
                "id": "rec-proactive-waste",
                "issue_ids": [],
                "title": "Adjust waste collection cadence",
                "action": "Shift two collection rounds to the highest-fill buildings and review bin sizing before peak occupancy.",
                "rationale": f"Average bin fill is {summary['waste']['avg_fill_pct']:.0f}% campus-wide.",
                "location": {"building": "Campus", "building_code": None, "zone": "Multiple zones", "zone_id": None},
                "category": "waste",
                "priority": "medium",
                "priority_score": 46.0,
                "type": "advisory",
                "source": "advisory",
                "timeframe": "this week",
                "quick_win": False,
                "confidence": 0.6,
                "est_kwh_saved": 0.0,
                "est_litres_saved": 0.0,
                "est_kg_saved": 4.0,
            }
        )
    if summary["energy"]["current_kw"] > 0:
        out.append(
            {
                "id": "rec-proactive-energy",
                "issue_ids": [],
                "title": "Tune the HVAC overnight schedule",
                "action": "Apply a graduated night setback (2°C) across academic buildings and verify against occupancy.",
                "rationale": f"Campus is drawing {summary['energy']['current_kw']:.1f} kW right now.",
                "location": {"building": "Campus", "building_code": None, "zone": "All buildings", "zone_id": None},
                "category": "energy",
                "priority": "medium",
                "priority_score": 42.0,
                "type": "advisory",
                "source": "advisory",
                "timeframe": "this week",
                "quick_win": False,
                "confidence": 0.6,
                "est_kwh_saved": round(summary["energy"]["current_kw"] * 0.12 * NIGHT_HOURS, 1),
                "est_litres_saved": 0.0,
                "est_kg_saved": 0.0,
            }
        )
    return out


def recommendations(
    db: Session,
    open_issues: list[dict | Issue] | None = None,
    recent_stats: dict | None = None,
) -> dict:
    """Prioritised recommendations, optionally rewritten by the LLM."""
    try:
        summary = campus_summary(db)
        if recent_stats:
            summary.update({k: v for k, v in recent_stats.items() if isinstance(v, dict) and k in summary})
            for k, v in recent_stats.items():
                if k not in summary:
                    summary[k] = v

        score = green_score(summary)
        candidates = candidate_recommendations(db, issues_override=open_issues, stats_override=recent_stats)
        provider_info = llm.info()

        narrative = None
        if AI_ENABLED and candidates:
            narrative = _llm_polish(summary, score, candidates)

        if narrative:
            by_id = {c["id"]: c for c in candidates}
            for item in narrative.get("recommendations", []):
                target = by_id.get(str(item.get("id")))
                if not target:
                    continue
                for field in ("title", "action", "rationale"):
                    value = item.get(field)
                    if isinstance(value, str) and value.strip():
                        target[field] = value.strip()[:400]

        totals = {
            "est_kwh_saved": round(sum(c["est_kwh_saved"] for c in candidates), 1),
            "est_litres_saved": round(sum(c["est_litres_saved"] for c in candidates), 1),
            "est_kg_saved": round(sum(c["est_kg_saved"] for c in candidates), 1),
            "count": len(candidates),
            "quick_wins": sum(1 for c in candidates if c["quick_win"]),
        }

        return {
            "generated_at": datetime.now().isoformat(),
            "provider": provider_info.to_dict(),
            "green_score": score,
            "summary": (narrative or {}).get("summary") or _default_summary(score, candidates),
            "recommendations": candidates,
            "totals": totals,
        }
    except Exception as exc:  # pragma: no cover - last-resort guard
        logger.exception("recommendations failed")
        return {
            "generated_at": datetime.now().isoformat(),
            "provider": llm.info().to_dict(),
            "green_score": {"score": 0, "grade": "E", "label": "Unavailable", "components": []},
            "summary": "Campus analytics are temporarily unavailable.",
            "recommendations": [],
            "totals": {"est_kwh_saved": 0.0, "est_litres_saved": 0.0, "est_kg_saved": 0.0, "count": 0, "quick_wins": 0},
            "error": str(exc),
        }


def _default_summary(score: dict, candidates: list[dict]) -> str:
    if not candidates:
        return f"Green Score {score['score']}/100 ({score['grade']}). No open issues need attention right now — keep the current schedule."
    top = candidates[0]
    quick = sum(1 for c in candidates if c["quick_win"])
    return (
        f"Green Score {score['score']}/100 ({score['grade']} · {score['label']}). "
        f"{len(candidates)} action(s) recommended, {quick} of them quick wins. "
        f"Start with “{top['title']}” in {top['location']['zone']} — estimated "
        f"{_impact_phrase(top)}."
    )


def _impact_phrase(rec: dict) -> str:
    parts = []
    if rec["est_kwh_saved"]:
        parts.append(f"{rec['est_kwh_saved']:g} kWh/day")
    if rec["est_litres_saved"]:
        parts.append(f"{rec['est_litres_saved']:g} L/day")
    if rec["est_kg_saved"]:
        parts.append(f"{rec['est_kg_saved']:g} kg diverted")
    return ", ".join(parts) or "operational efficiency"


# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------


def build_report(db: Session) -> dict:
    """Markdown sustainability report plus the structured figures behind it."""
    summary = campus_summary(db)
    summary["energy"]["budget_kw"] = round(
        float(db.query(func.coalesce(func.sum(Building.energy_budget_kw), 0.0)).scalar() or 0.0), 2
    )
    score = green_score(summary)
    trend_rows = trends(db)
    resolved_24h = resolved_recently(db)
    recs = recommendations(db)

    generated = datetime.now()
    provider_info = llm.info()

    narrative = _llm_report_narrative(summary, score, trend_rows, recs) if AI_ENABLED else None

    executive = (narrative or {}).get("executive_summary") or _default_executive(summary, score)
    energy_note = (narrative or {}).get("energy") or _default_energy_note(summary, trend_rows)
    water_note = (narrative or {}).get("water") or _default_water_note(summary, trend_rows)
    waste_note = (narrative or {}).get("waste") or _default_waste_note(summary)
    rec_list = recs.get("recommendations", []) if isinstance(recs, dict) else (recs or [])
    outlook = (narrative or {}).get("outlook") or _default_outlook(score, rec_list)

    markdown = _render_markdown(
        generated=generated,
        summary=summary,
        score=score,
        trend_rows=trend_rows,
        resolved_24h=resolved_24h,
        recs=rec_list,
        provider=provider_info,
        executive=executive,
        energy_note=energy_note,
        water_note=water_note,
        waste_note=waste_note,
        outlook=outlook,
    )

    report_dict = {
        "generated_at": generated.isoformat(),
        "title": "Campus Sustainability Report",
        "period": f"Day to {generated:%Y-%m-%d %H:%M}",
        "provider": provider_info.to_dict(),
        "green_score": score,
        "metrics": {
            "energy_current_kw": summary["energy"]["current_kw"],
            "energy_today_kwh": summary["energy"]["today_kwh"],
            "energy_budget_kw": summary["energy"]["budget_kw"],
            "water_current_lpm": summary["water"]["current_lpm"],
            "water_today_liters": summary["water"]["today_liters"],
            "waste_avg_fill_pct": summary["waste"]["avg_fill_pct"],
            "waste_overflow_bins": summary["waste"]["overflow_bins"],
            "issues_open": summary["issues"]["open"],
            "issues_resolved": summary["issues"]["resolved"],
            "issues_resolved_24h": resolved_24h,
            "occupancy_current": summary["occupancy"]["current"],
            "occupancy_capacity": summary["occupancy"]["capacity"],
        },
        "trends": trend_rows,
        "recommendations": recs["recommendations"],
        "markdown": markdown,
    }

    try:
        pdf_bytes = generate_sustainability_pdf(report_dict)
        report_dict["pdf_base64"] = base64.b64encode(pdf_bytes).decode("ascii")
        report_dict["pdf_url"] = "/ai/report/pdf"
    except Exception as exc:
        logger.warning("PDF generation failed: %s", exc)
        report_dict["pdf_base64"] = None
        report_dict["pdf_url"] = None

    return report_dict


def get_report_pdf_bytes(db: Session) -> bytes:
    """Generate raw PDF bytes for the current campus sustainability report."""
    report = build_report(db)
    return generate_sustainability_pdf(report)


def _render_markdown(
    *,
    generated: datetime,
    summary: dict,
    score: dict,
    trend_rows: list[dict],
    resolved_24h: int,
    recs: list[dict],
    provider: llm.ProviderInfo,
    executive: str,
    energy_note: str,
    water_note: str,
    waste_note: str,
    outlook: str,
) -> str:
    engine = f"{provider.name}" + (f" · {provider.model}" if provider.model else " (template)")
    lines: list[str] = []
    lines.append("# Campus Sustainability Report")
    lines.append("")
    lines.append(f"**Verdant Twin · AI Copilot** — generated {generated:%Y-%m-%d %H:%M}")
    lines.append(f"Engine: {engine}")
    lines.append("")
    lines.append(f"## Green Score — {score['score']}/100 ({score['grade']} · {score['label']})")
    lines.append("")
    lines.append("| Component | Score | Weight | Observation |")
    lines.append("| --- | --- | --- | --- |")
    for component in score["components"]:
        lines.append(
            f"| {component['label']} | {component['score']} | {int(component['weight'] * 100)}% | {component['detail']} |"
        )
    lines.append("")
    lines.append("## Executive summary")
    lines.append("")
    lines.append(executive)
    lines.append("")

    lines.append("## Energy")
    lines.append("")
    lines.append(f"- Live load: {summary['energy']['current_kw']:.2f} kW (budget {summary['energy']['budget_kw']:.2f} kW)")
    lines.append(f"- Consumed today: {summary['energy']['today_kwh']:.2f} kWh")
    _append_trend(lines, trend_rows, "energy")
    lines.append("")
    lines.append(energy_note)
    lines.append("")

    lines.append("## Water")
    lines.append("")
    lines.append(f"- Live flow: {summary['water']['current_lpm']:.2f} L/min")
    lines.append(f"- Used today: {summary['water']['today_liters']:.1f} L")
    _append_trend(lines, trend_rows, "water")
    lines.append("")
    lines.append(water_note)
    lines.append("")

    lines.append("## Waste")
    lines.append("")
    lines.append(f"- Average bin fill: {summary['waste']['avg_fill_pct']:.0f}%")
    lines.append(f"- Overflowing bins: {summary['waste']['overflow_bins']} of {summary['waste']['bins_tracked']}")
    lines.append("")
    lines.append(waste_note)
    lines.append("")

    lines.append("## Issues and resolution")
    lines.append("")
    lines.append(f"- Open issues: {summary['issues']['open']}")
    lines.append(f"- Resolved to date: {summary['issues']['resolved']}")
    lines.append(f"- Resolved in the last 24 hours: {resolved_24h}")
    breakdown = summary["issues"].get("by_type", {})
    if breakdown:
        lines.append("")
        lines.append("| Issue type | Open |")
        lines.append("| --- | --- |")
        for issue_type, count in sorted(breakdown.items(), key=lambda kv: -kv[1]):
            lines.append(f"| {issue_type.replace('_', ' ')} | {count} |")
    lines.append("")

    lines.append("## Recommended actions")
    lines.append("")
    if recs:
        for rec in recs:
            lines.append(
                f"- **[{rec['priority']}] {rec['title']}** — {rec['location']['zone']} "
                f"({rec['location']['building']}) · {_impact_phrase(rec)} · {rec['timeframe']}"
            )
            lines.append(f"  - {rec['action']}")
    else:
        lines.append("- No open issues require action right now.")
    lines.append("")

    lines.append("## Outlook")
    lines.append("")
    lines.append(outlook)
    lines.append("")
    return "\n".join(lines)


def _append_trend(lines: list[str], trend_rows: list[dict], resource: str) -> None:
    row = next((r for r in trend_rows if r["resource"] == resource), None)
    if not row:
        return
    direction = "up" if row["change_pct"] > 0 else ("down" if row["change_pct"] < 0 else "flat")
    lines.append(
        f"- Trend ({row['window_hours']}h vs previous {row['window_hours']}h): "
        f"{direction} {abs(row['change_pct']):.1f}% ({row['recent']:g} vs {row['previous']:g} {row['unit']})"
    )


def _default_executive(summary: dict, score: dict) -> str:
    return (
        f"The campus scores {score['score']}/100 ({score['grade']} · {score['label']}) this period. "
        f"There are {summary['issues']['open']} open issues across {summary['campus']['zones']} zones, "
        f"with {summary['issues']['resolved']} resolved to date. Live consumption is "
        f"{summary['energy']['current_kw']:.2f} kW of electricity and "
        f"{summary['water']['current_lpm']:.2f} L/min of water, while average bin fill sits at "
        f"{summary['waste']['avg_fill_pct']:.0f}%. The weakest component is "
        f"{min(score['components'], key=lambda c: c['score'])['label'].lower()}."
    )


def _default_energy_note(summary: dict, trend_rows: list[dict]) -> str:
    row = next((r for r in trend_rows if r["resource"] == "energy"), None)
    tail = ""
    if row:
        tail = f" Consumption is {'rising' if row['change_pct'] > 0 else 'easing'} ({row['change_pct']:+.1f}% versus the previous window)."
    wasted = summary["issues"].get("by_type", {}).get("energy_wastage", 0)
    return f"{wasted} energy-wastage issue(s) are open, typically unoccupied zones drawing full load.{tail}"


def _default_water_note(summary: dict, trend_rows: list[dict]) -> str:
    leaks = summary["issues"].get("by_type", {}).get("water_leakage", 0)
    return (
        f"{leaks} leakage issue(s) are open. Constant low-magnitude flow is the strongest signal of a "
        f"failing fixture, so isolating those zones is the highest-value water action."
    )


def _default_waste_note(summary: dict) -> str:
    if summary["waste"]["overflow_bins"]:
        return (
            f"{summary['waste']['overflow_bins']} bin(s) are at or above 90% fill. Re-routing the next "
            f"collection round to those zones avoids overflow and keeps the recycling stream clean."
        )
    return "No bins are currently overflowing; the existing collection cadence is adequate."


def _default_outlook(score: dict, recs: list[dict]) -> str:
    quick = sum(1 for c in recs if c.get("quick_win"))
    target = min(100, score["score"] + 4 + 3 * len(recs))
    return (
        f"Closing the {quick} quick win(s) listed above is a same-day change with minimal operational "
        f"disruption. If the recommended actions are completed, the projected Green Score is "
        f"approximately {target}/100."
    )


# ---------------------------------------------------------------------------
# Chat
# ---------------------------------------------------------------------------


CHAT_SYSTEM = (
    "You are Verdant Copilot, the assistant for a campus sustainability digital twin. "
    "Answer using ONLY the campus context provided. Be concise (2-4 sentences), specific, "
    "quote real numbers with units, and recommend an action when relevant. If the context "
    "does not contain the answer, say so plainly and suggest what to check."
)


def chat(db: Session, messages: list[dict] | dict | str) -> dict:
    """Answer a question about the current campus state."""
    question = ""
    msg_list: list[dict] = []
    if isinstance(messages, str):
        question = messages.strip()
        msg_list = [{"role": "user", "content": question}]
    elif isinstance(messages, dict):
        question = str(messages.get("content") or messages.get("message") or messages.get("question") or "").strip()
        msg_list = [messages]
    elif isinstance(messages, list):
        msg_list = messages
        for message in reversed(messages):
            if isinstance(message, dict) and message.get("content"):
                question = str(message["content"]).strip()
                break

    context = _chat_context(db)
    provider_info = llm.info()

    if AI_ENABLED and question:
        history = "\n".join(
            f"{m.get('role', 'user')}: {str(m.get('content', ''))[:500]}"
            for m in msg_list[-6:]
            if isinstance(m, dict) and m.get("content")
        )
        prompt = (
            f"Campus context (JSON):\n{json.dumps(context, default=str)}\n\n"
            f"Conversation so far:\n{history}\n\n"
            "Answer the latest user message."
        )
        result = llm.complete(CHAT_SYSTEM, prompt)
        if not result.fallback:
            return {
                "reply": result.text.strip(),
                "provider": {"name": result.provider, "model": result.model, "live": True},
                "suggestions": _suggestions(context),
                "fallback": False,
            }

    return {
        "reply": _template_answer(question, context),
        "provider": provider_info.to_dict(),
        "suggestions": _suggestions(context),
        "fallback": True,
    }


def _chat_context(db: Session) -> dict:
    summary = campus_summary(db)
    summary["energy"]["budget_kw"] = round(
        float(db.query(func.coalesce(func.sum(Building.energy_budget_kw), 0.0)).scalar() or 0.0), 2
    )
    score = green_score(summary)
    issues = [
        {
            "id": issue.id,
            "type": issue.type,
            "severity": issue.severity,
            "building": issue.zone.building.name if issue.zone and issue.zone.building else None,
            "zone": issue.zone.name if issue.zone else None,
            "source": issue.source,
            "detail": issue.description[:160],
        }
        for issue in open_issues(db, limit=15)
    ]
    return {
        "summary": summary,
        "green_score": {
            "score": score["score"],
            "grade": score["grade"],
            "label": score.get("label", "Healthy"),
            "weakest": min(score["components"], key=lambda c: c["score"])["label"],
        },
        "trends": trends(db),
        "resolved_last_24h": resolved_recently(db),
        "top_open_issues": issues,
    }


def _suggestions(context: dict) -> list[str]:
    return [
        "What should we fix first?",
        "How is our energy use trending?",
        "Are there any water leaks?",
        "What is our Green Score?",
    ]


def _template_answer(question: str, context: dict) -> str:
    summary = context["summary"]
    score = context["green_score"]
    text = question.lower()
    issues = context["top_open_issues"]

    def _list_issues(kind: str | None) -> str:
        rows = [i for i in issues if kind is None or i["type"] == kind]
        if not rows:
            return "none open right now"
        return "; ".join(f"#{i['id']} {i['zone']} ({i['severity']})" for i in rows[:4])

    if not question:
        return "Ask me about energy, water, waste, open issues, savings, or the campus Green Score."

    if any(word in text for word in ("hello", "hi", "hey", "who are you", "what can you do", "help")):
        return (
            f"Hello! I am Verdant Copilot, your campus sustainability assistant. Our current Green Score is "
            f"{score['score']}/100 ({score['grade']} · {score['label']}). Ask me about live energy or water, "
            f"overflowing waste bins, prioritized recommendations, or generate a full sustainability report."
        )

    if any(word in text for word in ("report", "pdf", "export", "download")):
        return (
            f"You can generate the official Campus Sustainability Report (with full breakdown and PDF export) "
            f"at any time. Click the 'Generate Report' button in the AI Copilot panel or visit the Reports page."
        )

    if any(word in text for word in ("saving", "kwh", "litres", "saved", "impact")):
        top = [i for i in issues if i["severity"] in {"critical", "high"}]
        return (
            f"Fixing current high-priority issues could save an estimated 40+ kWh/day in electricity and over "
            f"1,000 L/day in potable water across campus. Check the Actions tab in Copilot for specific steps."
        )

    if any(word in text for word in ("score", "rating", "grade", "green")):
        return (
            f"The campus Green Score is {score['score']}/100 (grade {score['grade']}). "
            f"The weakest component is {score['weakest']}, so that is where effort pays off most."
        )

    if any(word in text for word in ("energy", "power", "electric", "kwh", "kw")):
        row = next((r for r in context["trends"] if r["resource"] == "energy"), None)
        trend = f" It is {'up' if row and row['change_pct'] > 0 else 'down'} {abs(row['change_pct']):.1f}% versus the previous window." if row else ""
        return (
            f"Live load is {summary['energy']['current_kw']:.2f} kW against a "
            f"{summary['energy']['budget_kw']:.2f} kW budget, with {summary['energy']['today_kwh']:.2f} kWh used today.{trend} "
            f"Open energy issues: {_list_issues('energy_wastage')}."
        )

    if any(word in text for word in ("water", "leak", "litre", "liter", "lpm")):
        row = next((r for r in context["trends"] if r["resource"] == "water"), None)
        trend = f" Usage is {'up' if row and row['change_pct'] > 0 else 'down'} {abs(row['change_pct']):.1f}% versus the previous window." if row else ""
        return (
            f"Water is flowing at {summary['water']['current_lpm']:.2f} L/min and "
            f"{summary['water']['today_liters']:.0f} L has been used today.{trend} "
            f"Open leakage issues: {_list_issues('water_leakage')}."
        )

    if any(word in text for word in ("waste", "bin", "trash", "recycl", "fill")):
        return (
            f"Average bin fill is {summary['waste']['avg_fill_pct']:.0f}% with "
            f"{summary['waste']['overflow_bins']} of {summary['waste']['bins_tracked']} bins overflowing. "
            f"Open waste issues: {_list_issues('waste_accumulation')}."
        )

    if any(word in text for word in ("issue", "problem", "fix", "first", "priority", "recommend")):
        critical = [i for i in issues if i["severity"] in {"critical", "high"}]
        if critical:
            top = critical[0]
            return (
                f"{len(issues)} issues are open, {len(critical)} of them high or critical. "
                f"Start with #{top['id']} in {top['zone']} ({top['severity']}) — {top['detail']}"
            )
        return f"{len(issues)} issues are open, none high or critical. Resolved in the last 24h: {context['resolved_last_24h']}."

    if any(word in text for word in ("building", "zone", "campus", "sensor")):
        campus = summary["campus"]
        return (
            f"The twin covers {campus['buildings']} buildings, {campus['zones']} zones and "
            f"{campus['sensors']} sensors, currently occupied by {summary['occupancy']['current']} of "
            f"{summary['occupancy']['capacity']} people."
        )

    return (
        f"Green Score {score['score']}/100 ({score['grade']}). "
        f"{summary['issues']['open']} open issues, {summary['energy']['current_kw']:.2f} kW live load, "
        f"{summary['water']['current_lpm']:.2f} L/min water, {summary['waste']['avg_fill_pct']:.0f}% average bin fill. "
        f"Ask me about energy, water, waste, issues or the score."
    )


# ---------------------------------------------------------------------------
# LLM prompt helpers
# ---------------------------------------------------------------------------


def _compact_context(summary: dict, score: dict, candidates: list[dict]) -> dict:
    return {
        "green_score": {"score": score["score"], "grade": score["grade"]},
        "energy": summary["energy"],
        "water": summary["water"],
        "waste": summary["waste"],
        "issues": summary["issues"],
        "candidates": [
            {
                "id": c["id"],
                "severity_type": c["type"],
                "priority": c["priority"],
                "zone": c["location"]["zone"],
                "building": c["location"]["building"],
                "est_kwh_saved": c["est_kwh_saved"],
                "est_litres_saved": c["est_litres_saved"],
                "est_kg_saved": c["est_kg_saved"],
                "issue_text": c["rationale"][:180],
            }
            for c in candidates
        ],
    }


def _llm_polish(summary: dict, score: dict, candidates: list[dict]) -> dict | None:
    context = _compact_context(summary, score, candidates)
    system = (
        "You are a sustainability operations analyst for a university campus. "
        "You rewrite recommendations so a facilities manager can act immediately. "
        "Never invent or change numbers — reuse the figures given. "
        "Reply with JSON only."
    )
    prompt = (
        f"Campus context:\n{json.dumps(context, default=str)}\n\n"
        "Return JSON: {\"summary\": \"<=60 words\", \"recommendations\": "
        "[{\"id\": \"<same id>\", \"title\": \"<=9 words\", \"action\": \"<=35 words imperative\", "
        "\"rationale\": \"<=30 words citing the given numbers\"}]}"
    )
    result = llm.complete(system, prompt, json_mode=True)
    if result.fallback:
        return None
    parsed = llm.extract_json(result.text)
    if not isinstance(parsed, dict):
        logger.info("LLM recommendation JSON unparseable; using templates")
        return None
    return parsed


def _llm_report_narrative(summary: dict, score: dict, trend_rows: list[dict], recs: dict) -> dict | None:
    system = (
        "You are writing the narrative of a campus sustainability report. "
        "Use only the supplied figures. Be precise and avoid hype. Reply with JSON only."
    )
    prompt = (
        "Campus figures:\n"
        f"{json.dumps({'summary': summary, 'green_score': score, 'trends': trend_rows, 'recommendations': recs.get('recommendations', [])[:5]}, default=str)}\n\n"
        "Return JSON: {\"executive_summary\": \"<=90 words\", \"energy\": \"<=50 words\", "
        "\"water\": \"<=50 words\", \"waste\": \"<=50 words\", \"outlook\": \"<=50 words\"}"
    )
    result = llm.complete(system, prompt, json_mode=True)
    if result.fallback:
        return None
    parsed = llm.extract_json(result.text)
    return parsed if isinstance(parsed, dict) else None


def _clamp(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return max(low, min(high, value))
