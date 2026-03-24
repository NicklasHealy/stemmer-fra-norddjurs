"""Database connection og session management."""

from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv
import os

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./norddjurs.db")

# Konfigurér engine baseret på database-type
connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}
    engine = create_engine(DATABASE_URL, connect_args=connect_args)

    # SQLite: aktivér foreign keys (deaktiveret som standard)
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()
else:
    engine = create_engine(DATABASE_URL, pool_pre_ping=True)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    """FastAPI dependency: yield a DB session, auto-close after request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Opret alle tabeller der ikke eksisterer endnu."""
    Base.metadata.create_all(bind=engine)


def migrate_db():
    """Kør database-migrationer for nye kolonner (idempotent — sikker at køre gentagne gange).

    Håndterer:
    - citizens.consent_version  (opgave 14b)
    - citizens.frozen            (opgave 13b)
    - Ny tabel: consent_logs     (opgave 14a) — oprettes via init_db()
    """
    # Opret evt. nye tabeller (f.eks. consent_logs) der endnu ikke eksisterer
    init_db()

    is_sqlite = DATABASE_URL.startswith("sqlite")
    inspector = inspect(engine)

    try:
        existing_columns = {col["name"] for col in inspector.get_columns("citizens")}
    except Exception:
        # Tabellen eksisterer endnu ikke — init_db() opretter den
        return

    migrations = []

    if "consent_version" not in existing_columns:
        if is_sqlite:
            migrations.append("ALTER TABLE citizens ADD COLUMN consent_version INTEGER NOT NULL DEFAULT 1")
        else:
            # SQL Server
            migrations.append("ALTER TABLE citizens ADD consent_version INT NOT NULL DEFAULT 1")

    if "frozen" not in existing_columns:
        if is_sqlite:
            migrations.append("ALTER TABLE citizens ADD COLUMN frozen BOOLEAN NOT NULL DEFAULT 0")
        else:
            migrations.append("ALTER TABLE citizens ADD frozen BIT NOT NULL DEFAULT 0")

    if "must_change_password" not in existing_columns:
        if is_sqlite:
            migrations.append("ALTER TABLE citizens ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT 0")
        else:
            migrations.append("ALTER TABLE citizens ADD must_change_password BIT NOT NULL DEFAULT 0")

    if "temp_password_expires" not in existing_columns:
        if is_sqlite:
            migrations.append("ALTER TABLE citizens ADD COLUMN temp_password_expires DATETIME NULL")
        else:
            migrations.append("ALTER TABLE citizens ADD temp_password_expires DATETIME NULL")

    # ── Forløb-migrationer ──────────────────────────────────────────
    # themes.forloeb_id
    try:
        themes_cols = {col["name"] for col in inspector.get_columns("themes")}
        if "forloeb_id" not in themes_cols:
            if is_sqlite:
                migrations.append("ALTER TABLE themes ADD COLUMN forloeb_id VARCHAR(36) NULL")
            else:
                migrations.append("ALTER TABLE themes ADD forloeb_id VARCHAR(36) NULL")
    except Exception:
        pass

    # questions: nye kolonner
    try:
        q_cols = {col["name"] for col in inspector.get_columns("questions")}
        if "forloeb_id" not in q_cols:
            if is_sqlite:
                migrations.append("ALTER TABLE questions ADD COLUMN forloeb_id VARCHAR(36) NULL")
            else:
                migrations.append("ALTER TABLE questions ADD forloeb_id VARCHAR(36) NULL")
        if "is_citizen_submitted" not in q_cols:
            if is_sqlite:
                migrations.append("ALTER TABLE questions ADD COLUMN is_citizen_submitted BOOLEAN NOT NULL DEFAULT 0")
            else:
                migrations.append("ALTER TABLE questions ADD is_citizen_submitted BIT NOT NULL DEFAULT 0")
        if "submitted_by_citizen_id" not in q_cols:
            if is_sqlite:
                migrations.append("ALTER TABLE questions ADD COLUMN submitted_by_citizen_id VARCHAR(36) NULL")
            else:
                migrations.append("ALTER TABLE questions ADD submitted_by_citizen_id VARCHAR(36) NULL")
        if "is_approved" not in q_cols:
            if is_sqlite:
                migrations.append("ALTER TABLE questions ADD COLUMN is_approved BOOLEAN NOT NULL DEFAULT 1")
            else:
                migrations.append("ALTER TABLE questions ADD is_approved BIT NOT NULL DEFAULT 1")
        if "is_anonymous" not in q_cols:
            if is_sqlite:
                migrations.append("ALTER TABLE questions ADD COLUMN is_anonymous BOOLEAN NOT NULL DEFAULT 0")
            else:
                migrations.append("ALTER TABLE questions ADD is_anonymous BIT NOT NULL DEFAULT 0")
    except Exception:
        pass

    if migrations:
        with engine.connect() as conn:
            for sql in migrations:
                print(f"Migration: {sql}")
                conn.execute(text(sql))
            conn.commit()
        print(f"Migration fuldført: {len(migrations)} kolonne(r) tilføjet.")
    else:
        print("Migration: ingen ændringer nødvendige.")