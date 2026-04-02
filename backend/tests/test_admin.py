"""Integrationstests for /api/admin/* endpoints."""

import uuid
import pytest


class TestAdminLogin:
    def test_login_success(self, client, admin_token):
        # admin_token fixture logger allerede ind — vi bekræfter blot at tokenet er en streng
        assert isinstance(admin_token, str)
        assert len(admin_token) > 10

    def test_login_wrong_password(self, client, db):
        from models import AdminUser
        from auth import hash_password
        admin = AdminUser(
            id=str(uuid.uuid4()),
            email=f"admin2_{uuid.uuid4().hex[:6]}@test.dk",
            password_hash=hash_password("RigtigPass1!"),
            name="Admin 2",
        )
        db.add(admin)
        db.commit()
        r = client.post("/api/admin/login", json={"email": admin.email, "password": "ForkertPass1!"})
        assert r.status_code == 401

    def test_login_unknown_email(self, client):
        r = client.post("/api/admin/login", json={"email": "ukendt@test.dk", "password": "Pass1!"})
        assert r.status_code == 401


class TestAdminThemes:
    def test_create_theme(self, client, admin_token):
        r = client.post(
            "/api/admin/themes",
            json={"name": "Nyt Tema", "icon": "🌟", "sort_order": 99},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 200
        data = r.json()
        assert data["name"] == "Nyt Tema"
        assert "id" in data

    def test_create_theme_requires_auth(self, client):
        r = client.post("/api/admin/themes", json={"name": "Tema", "icon": "🌟", "sort_order": 1})
        assert r.status_code == 401

    def test_delete_theme(self, client, admin_token):
        # Opret og slet
        create = client.post(
            "/api/admin/themes",
            json={"name": "SletteMig Tema", "icon": "🗑", "sort_order": 50},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        theme_id = create.json()["id"]
        r = client.delete(
            f"/api/admin/themes/{theme_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 200
        assert r.json()["ok"] is True

    def test_delete_nonexistent_theme(self, client, admin_token):
        r = client.delete(
            "/api/admin/themes/findesikke-id",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 404


class TestAdminResponses:
    def test_list_responses(self, client, admin_token):
        r = client.get(
            "/api/admin/responses",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 200
        data = r.json()
        assert "responses" in data
        assert "total" in data

    def test_list_responses_requires_auth(self, client):
        r = client.get("/api/admin/responses")
        assert r.status_code == 401

    def test_exclude_response(self, client, admin_token, seeded_question, db):
        from models import Response
        resp = Response(
            id=str(uuid.uuid4()),
            question_id=seeded_question["id"],
            session_id="sess-test",
            response_type="text",
            text_content="En besvarelse",
            is_followup=False,
        )
        db.add(resp)
        db.commit()

        r = client.put(
            f"/api/admin/responses/{resp.id}/exclude",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 200
        assert r.json()["ok"] is True

        db.refresh(resp)
        assert resp.is_excluded is True

    def test_exclude_nonexistent_response(self, client, admin_token):
        r = client.put(
            "/api/admin/responses/findesikke-id/exclude",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 404


class TestAdminDashboard:
    def test_dashboard_returns_expected_keys(self, client, admin_token):
        r = client.get(
            "/api/admin/dashboard",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 200
        data = r.json()
        for key in ("total_responses", "flagged_count", "total_citizens", "per_theme"):
            assert key in data, f"Nøgle mangler: {key}"


class TestAdminModerationRules:
    def test_create_word_rule(self, client, admin_token):
        r = client.post(
            "/api/admin/moderation-rules",
            json={"rule_type": "word", "pattern": "testregel", "description": "Test"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 200
        data = r.json()
        assert data["pattern"] == "testregel"

    def test_create_invalid_regex_rule(self, client, admin_token):
        r = client.post(
            "/api/admin/moderation-rules",
            json={"rule_type": "regex", "pattern": "[ugyldigt(", "description": "Fejl"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 400
