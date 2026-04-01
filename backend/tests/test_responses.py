"""Integrationstests for /api/responses og /api/followup endpoints."""

import uuid
import pytest


class TestSubmitResponse:
    def test_submit_text_response_anonymous(self, client, seeded_question):
        r = client.post("/api/responses", json={
            "question_id": seeded_question["id"],
            "session_id": str(uuid.uuid4()),
            "response_type": "text",
            "text_content": "En fin besvarelse fra en anonym borger",
            "is_followup": False,
            "parent_response_id": None,
            "followup_question_text": None,
        })
        assert r.status_code == 200
        data = r.json()
        assert data["question_id"] == seeded_question["id"]
        assert data["text_content"] == "En fin besvarelse fra en anonym borger"
        assert data["is_flagged"] is False

    def test_submit_response_authenticated(self, client, citizen_token, seeded_question):
        r = client.post(
            "/api/responses",
            json={
                "question_id": seeded_question["id"],
                "session_id": str(uuid.uuid4()),
                "response_type": "text",
                "text_content": "Borgerens svar",
                "is_followup": False,
                "parent_response_id": None,
                "followup_question_text": None,
            },
            headers={"Authorization": f"Bearer {citizen_token}"},
        )
        assert r.status_code == 200
        assert r.json()["citizen_id"] is not None

    def test_duplicate_response_rejected(self, client, citizen_token, seeded_question):
        payload = {
            "question_id": seeded_question["id"],
            "session_id": str(uuid.uuid4()),
            "response_type": "text",
            "text_content": "Første svar",
            "is_followup": False,
            "parent_response_id": None,
            "followup_question_text": None,
        }
        headers = {"Authorization": f"Bearer {citizen_token}"}
        r1 = client.post("/api/responses", json=payload, headers=headers)
        assert r1.status_code == 200
        r2 = client.post("/api/responses", json=payload, headers=headers)
        assert r2.status_code == 409

    def test_flagged_response(self, client, seeded_question, db):
        """Svar der matcher en moderation-regel flagges."""
        from models import ModerationRule
        rule = ModerationRule(
            id=str(uuid.uuid4()),
            rule_type="word",
            pattern="testflagordet",
            description="Test",
        )
        db.add(rule)
        db.commit()

        r = client.post("/api/responses", json={
            "question_id": seeded_question["id"],
            "session_id": str(uuid.uuid4()),
            "response_type": "text",
            "text_content": "dette er testflagordet i en sætning",
            "is_followup": False,
            "parent_response_id": None,
            "followup_question_text": None,
        })
        assert r.status_code == 200
        assert r.json()["is_flagged"] is True


class TestHealthEndpoint:
    def test_health_returns_ok(self, client):
        r = client.get("/api/health")
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "ok"
        assert "version" in data
        assert "ai" in data
