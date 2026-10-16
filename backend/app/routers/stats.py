"""Campus-wide KPI summary for the dashboard.

The aggregation lives in app.queries.campus_summary so the Generative AI layer
can reuse exactly the same numbers.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Building, Issue, Sensor, Zone
from app.queries import campus_summary, latest_values

router = APIRouter(tags=["stats"])


@router.get("/stats/summary")
def stats_summary(db: Session = Depends(get_db)) -> dict:
    """Aggregate counts and current resource state across the campus."""
    return campus_summary(db)


@router.get("/stats/leaderboard")
def buildings_leaderboard(db: Session = Depends(get_db)) -> dict:
    """Rank buildings by sustainability Green Score, efficiency, and active issues."""
    buildings = db.query(Building).all()
    latest = latest_values(db)

    results = []
    for b in buildings:
        zone_ids = [z.id for z in b.zones]
        # Active issues in this building
        open_issues = (
            db.query(Issue)
            .filter(Issue.zone_id.in_(zone_ids), Issue.status == "open")
            .all()
            if zone_ids
            else []
        )
        resolved_issues_count = (
            db.query(Issue)
            .filter(Issue.zone_id.in_(zone_ids), Issue.status == "resolved")
            .count()
            if zone_ids
            else 0
        )

        # Sensors in building
        sensors = (
            db.query(Sensor)
            .filter(Sensor.zone_id.in_(zone_ids))
            .all()
            if zone_ids
            else []
        )

        energy_w = sum(
            latest.get(s.id, 0.0) for s in sensors if s.sensor_type == "energy"
        )
        water_lpm = sum(
            latest.get(s.id, 0.0) for s in sensors if s.sensor_type == "water"
        )
        waste_fills = [
            latest[s.id] for s in sensors if s.sensor_type == "waste" and s.id in latest
        ]
        avg_waste = (sum(waste_fills) / len(waste_fills)) if waste_fills else 20.0
        overflow_count = sum(1 for f in waste_fills if f >= 90.0)

        # Energy budget ratio
        budget_kw = b.energy_budget_kw or 50.0
        current_kw = energy_w / 1000.0
        energy_ratio = (current_kw / budget_kw) if budget_kw > 0 else 1.0

        # Score components mirroring green_score:
        # 1. Energy efficiency (25 pts): comfortable under budget
        energy_score = 100.0 - max(0.0, (energy_ratio - 0.7) / 0.9 * 100.0)
        energy_score = max(0.0, min(100.0, energy_score))

        # 2. Water stewardship (25 pts): penalize leaks
        leaks = sum(1 for i in open_issues if i.type == "water_leakage")
        water_score = max(0.0, min(100.0, 100.0 - (leaks * 25.0) - max(0.0, water_lpm - 15.0)))

        # 3. Waste management (25 pts): fill level
        waste_score = max(0.0, min(100.0, 100.0 - max(0.0, (avg_waste - 50.0) / 50.0 * 100.0) - overflow_count * 15.0))

        # 4. Issue health & resolution (25 pts)
        crit_high = sum(1 for i in open_issues if i.severity in ("critical", "high"))
        med_low = sum(1 for i in open_issues if i.severity in ("medium", "low"))
        issue_score = max(0.0, min(100.0, 100.0 - crit_high * 15.0 - med_low * 6.0 + min(15.0, resolved_issues_count * 3.0)))

        total_score = round(
            energy_score * 0.25 + water_score * 0.25 + waste_score * 0.25 + issue_score * 0.25
        )
        clamped_score = max(15, min(98, total_score))

        if clamped_score >= 88:
            grade = "A"
            status = "Optimal"
        elif clamped_score >= 76:
            grade = "B"
            status = "Efficient"
        elif clamped_score >= 62:
            grade = "C"
            status = "Moderate"
        elif clamped_score >= 48:
            grade = "D"
            status = "Attention"
        else:
            grade = "E"
            status = "Critical"

        results.append(
            {
                "id": b.id,
                "name": b.name,
                "code": b.code,
                "category": b.category,
                "floors": b.floors,
                "score": clamped_score,
                "grade": grade,
                "status": status,
                "energy_kw": round(current_kw, 1),
                "energy_budget_kw": round(budget_kw, 1),
                "water_lpm": round(water_lpm, 1),
                "avg_waste_pct": round(avg_waste, 1),
                "open_issues_count": len(open_issues),
                "resolved_count": resolved_issues_count,
            }
        )

    # Sort by score descending to assign ranks
    results.sort(key=lambda x: (x["score"], -x["open_issues_count"]), reverse=True)
    for rank, item in enumerate(results, start=1):
        item["rank"] = rank

    return {"count": len(results), "leaderboard": results}
