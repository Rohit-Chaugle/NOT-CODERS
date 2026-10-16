"""Issue board: list and resolve detected issues."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Issue, Notification
from app.serializers import serialize_issue, serialize_notification
from app.services.realtime import manager

router = APIRouter(tags=["issues"])


@router.get("/issues")
def list_issues(
    status: str | None = None,
    severity: str | None = None,
    type: str | None = None,
    zone_id: int | None = None,
    source: str | None = None,
    limit: int = 100,
    db: Session = Depends(get_db),
) -> dict:
    """List issues, newest first, with optional filters."""
    query = db.query(Issue)
    if status:
        query = query.filter(Issue.status == status)
    if severity:
        query = query.filter(Issue.severity == severity)
    if type:
        query = query.filter(Issue.type == type)
    if zone_id is not None:
        query = query.filter(Issue.zone_id == zone_id)
    if source:
        query = query.filter(Issue.source == source)

    limit = max(1, min(limit, 500))
    rows = query.order_by(Issue.detected_at.desc(), Issue.id.desc()).limit(limit).all()
    return {"count": len(rows), "issues": [serialize_issue(i) for i in rows]}


@router.patch("/issues/{issue_id}/resolve")
async def resolve_issue(issue_id: int, db: Session = Depends(get_db)) -> dict:
    """Mark an issue resolved, log a notification and broadcast the change."""
    issue = db.get(Issue, issue_id)
    if issue is None:
        raise HTTPException(status_code=404, detail=f"Issue {issue_id} not found")

    if issue.status != "resolved":
        issue.status = "resolved"
        issue.resolved_at = datetime.now()
        notification = Notification(
            issue_id=issue.id,
            level="info",
            title=f"Resolved — {issue.title}",
            message=f"{issue.title} in {issue.zone.name if issue.zone else 'campus'} was marked resolved.",
        )
        db.add(notification)
        db.commit()
        payload = serialize_issue(issue)
        await manager.broadcast("issue:resolved", payload)
        await manager.broadcast("notification", serialize_notification(notification))
        return payload

    return serialize_issue(issue)
