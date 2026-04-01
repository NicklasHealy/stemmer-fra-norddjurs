"""Fælles fixtures til alle tests."""

import uuid
import pytest

TEST_DATABASE_URL = "sqlite:///:memory:"


@pytest.fixture(scope="session")
def engine():
    from sqlalchemy import create_engine
    from database import Base
    import models  # noqa: F401 — registrér alle modeller på Base.metadata
    e = create_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=e)
    yield e
    e.dispose()


@pytest.fixture
def db(engine):
    """Giver en DB-session der rulles tilbage efter hver test."""
    from sqlalchemy.orm import sessionmaker
    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = TestingSession()
    yield session
    session.rollback()
    session.close()


@pytest.fixture
def client(db):
    """TestClient med DB-dependency overskrevet til test-session."""
    from fastapi.testclient import TestClient
    from main import app
    from database import get_db
    app.dependency_overrides[get_db] = lambda: db
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def citizen_token(client):
    """Registrér + log ind en test-borger og returnér JWT."""
    email = f"borger_{uuid.uuid4().hex[:8]}@test.dk"
    client.post("/api/citizen/register", json={"email": email, "password": "TestPass1!"})
    r = client.post("/api/citizen/login", json={"email": email, "password": "TestPass1!"})
    assert r.status_code == 200, f"Login fejlede: {r.text}"
    return r.json()["access_token"]


@pytest.fixture
def admin_token(client, db):
    """Opret en test-admin og returnér JWT."""
    from models import AdminUser
    from auth import hash_password
    admin = AdminUser(
        id=str(uuid.uuid4()),
        email=f"admin_{uuid.uuid4().hex[:8]}@test.dk",
        password_hash=hash_password("AdminPass1!"),
        name="Test Admin",
    )
    db.add(admin)
    db.commit()
    r = client.post("/api/admin/login", json={"email": admin.email, "password": "AdminPass1!"})
    assert r.status_code == 200, f"Admin login fejlede: {r.text}"
    return r.json()["token"]


@pytest.fixture
def seeded_theme(client, db, admin_token):
    """Opret et test-tema og returnér det."""
    r = client.post(
        "/api/admin/themes",
        json={"name": "Test Tema", "icon": "🧪", "sort_order": 1},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    return r.json()


@pytest.fixture
def seeded_question(client, db, admin_token, seeded_theme):
    """Opret et test-spørgsmål og returnér det."""
    r = client.post(
        "/api/admin/questions",
        json={
            "theme_id": seeded_theme["id"],
            "title": "Test spørgsmål",
            "body": "Hvad er dit syn på dette?",
            "is_active": True,
            "allow_followup": True,
            "followup_prompt": "",
            "sort_order": 1,
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    return r.json()
