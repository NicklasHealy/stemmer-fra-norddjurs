"""Integrationstests for /api/citizen/* endpoints."""

import uuid
import pytest


VALID_PASSWORD = "TestPass1!"
WEAK_PASSWORD = "svagt"


def unique_email():
    return f"borger_{uuid.uuid4().hex[:8]}@test.dk"


class TestCitizenRegister:
    def test_register_success(self, client):
        r = client.post("/api/citizen/register", json={
            "email": unique_email(), "password": VALID_PASSWORD,
        })
        assert r.status_code == 200
        data = r.json()
        assert "access_token" in data

    def test_register_duplicate_email(self, client):
        email = unique_email()
        client.post("/api/citizen/register", json={"email": email, "password": VALID_PASSWORD})
        r = client.post("/api/citizen/register", json={"email": email, "password": VALID_PASSWORD})
        assert r.status_code == 409

    def test_register_weak_password(self, client):
        r = client.post("/api/citizen/register", json={
            "email": unique_email(), "password": WEAK_PASSWORD,
        })
        assert r.status_code == 400

    def test_register_invalid_email(self, client):
        r = client.post("/api/citizen/register", json={
            "email": "ikke-en-email", "password": VALID_PASSWORD,
        })
        assert r.status_code == 422


class TestCitizenLogin:
    def test_login_success(self, client):
        email = unique_email()
        client.post("/api/citizen/register", json={"email": email, "password": VALID_PASSWORD})
        r = client.post("/api/citizen/login", json={"email": email, "password": VALID_PASSWORD})
        assert r.status_code == 200
        assert "access_token" in r.json()

    def test_login_wrong_password(self, client):
        email = unique_email()
        client.post("/api/citizen/register", json={"email": email, "password": VALID_PASSWORD})
        r = client.post("/api/citizen/login", json={"email": email, "password": "ForkertPass1!"})
        assert r.status_code == 401

    def test_login_unknown_email(self, client):
        r = client.post("/api/citizen/login", json={
            "email": "ukendt@test.dk", "password": VALID_PASSWORD,
        })
        assert r.status_code == 401


class TestCitizenMe:
    def test_me_with_valid_token(self, client, citizen_token):
        r = client.get("/api/citizen/me", headers={"Authorization": f"Bearer {citizen_token}"})
        assert r.status_code == 200
        data = r.json()
        assert "email" in data
        assert "id" in data

    def test_me_without_token(self, client):
        r = client.get("/api/citizen/me")
        assert r.status_code == 401

    def test_me_with_invalid_token(self, client):
        r = client.get("/api/citizen/me", headers={"Authorization": "Bearer ugyldig.token.her"})
        assert r.status_code == 401


class TestCitizenChangePassword:
    def test_change_password_success(self, client):
        email = unique_email()
        client.post("/api/citizen/register", json={"email": email, "password": VALID_PASSWORD})
        login = client.post("/api/citizen/login", json={"email": email, "password": VALID_PASSWORD})
        token = login.json()["token"]

        r = client.put(
            "/api/citizen/change-password",
            json={"current_password": VALID_PASSWORD, "new_password": "NytPass99!", "confirm_password": "NytPass99!"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 200

    def test_change_password_wrong_current(self, client, citizen_token):
        r = client.put(
            "/api/citizen/change-password",
            json={"current_password": "ForkertGammelt1!", "new_password": "NytPass99!", "confirm_password": "NytPass99!"},
            headers={"Authorization": f"Bearer {citizen_token}"},
        )
        assert r.status_code == 401

    def test_change_password_weak_new(self, client, citizen_token):
        r = client.put(
            "/api/citizen/change-password",
            json={"current_password": VALID_PASSWORD, "new_password": WEAK_PASSWORD, "confirm_password": WEAK_PASSWORD},
            headers={"Authorization": f"Bearer {citizen_token}"},
        )
        assert r.status_code == 400


class TestCitizenExport:
    def test_export_returns_json(self, client, citizen_token):
        r = client.get("/api/citizen/export", headers={"Authorization": f"Bearer {citizen_token}"})
        assert r.status_code == 200
        data = r.json()
        assert "citizen" in data
        assert "responses" in data
