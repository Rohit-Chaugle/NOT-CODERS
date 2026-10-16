"""Unit and integration tests for the Generative AI layer."""

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client():
    return TestClient(app)


def test_provider_status(client):
    res = client.get("/ai/provider")
    assert res.status_code == 200
    data = res.json()
    assert "name" in data
    assert "live" in data


def test_recommendations_default(client):
    res = client.post("/ai/recommendations", json={})
    assert res.status_code == 200
    data = res.json()
    assert "recommendations" in data
    assert "green_score" in data
    assert "totals" in data
    assert isinstance(data["recommendations"], list)
    if data["recommendations"]:
        first = data["recommendations"][0]
        assert "action" in first
        assert "location" in first
        assert "priority" in first
        assert "est_kwh_saved" in first
        assert "est_litres_saved" in first
        assert "est_kg_saved" in first


def test_recommendations_with_custom_issues(client):
    payload = {
        "open_issues": [
            {
                "id": 999,
                "type": "water_leakage",
                "title": "Severe Pipe Leak in Cafeteria",
                "description": "Continuous leak detected",
                "severity": "critical",
                "zone_name": "Dining Hall",
                "building_name": "Student Center",
            }
        ],
        "recent_stats": {"water": {"current_lpm": 18.5}},
    }
    res = client.post("/ai/recommendations", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert len(data["recommendations"]) >= 1
    top = data["recommendations"][0]
    assert "Dining Hall" in top["location"]["zone"]
    assert top["est_litres_saved"] > 0
    assert top["priority"] in ["critical", "high"]


def test_report_json(client):
    res = client.post("/ai/report", json={})
    assert res.status_code == 200
    data = res.json()
    assert "markdown" in data
    assert "green_score" in data
    assert "metrics" in data
    assert "trends" in data
    assert "recommendations" in data
    assert data["green_score"]["score"] >= 0
    assert "pdf_base64" in data
    assert data["pdf_base64"] is not None


def test_report_pdf_export(client):
    res = client.get("/ai/report/pdf")
    assert res.status_code == 200
    assert res.headers.get("content-type") == "application/pdf"
    assert len(res.content) > 1000
    assert res.content[:4] == b"%PDF"


def test_report_format_query_pdf(client):
    res = client.post("/ai/report?format=pdf", json={})
    assert res.status_code == 200
    assert res.headers.get("content-type") == "application/pdf"
    assert res.content[:4] == b"%PDF"


def test_chat_assistant(client):
    res = client.post("/ai/chat", json={"message": "What is our Green Score?"})
    assert res.status_code == 200
    data = res.json()
    assert "reply" in data
    assert len(data["reply"]) > 5
    assert "suggestions" in data
    assert "provider" in data
