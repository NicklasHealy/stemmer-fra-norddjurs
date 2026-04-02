"""
Stemmer fra Norddjurs — FastAPI Backend
========================================

Start:
  cp .env.example .env   (og udfyld)
  pip install -r requirements.txt
  python main.py

API docs: http://localhost:8321/docs
"""

import os
import uuid

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlalchemy.orm import Session

load_dotenv()

from limiter import limiter
from database import get_db, init_db
from auth import _UNSAFE_KEYS
from routers import citizen, public, responses, admin

# ─── App setup ───
app = FastAPI(title="Stemmer fra Norddjurs", version="1.0.0")

# ─── Rate limiting ───
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ─── CORS ───
_raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173")
ALLOWED_ORIGINS = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

# ─── Sikkerhedsheaders ───
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    return response

# Mappe til lydoptagelser
UPLOAD_DIR = os.getenv("UPLOAD_DIR", "./uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

# ─── Startup security check ───
@app.on_event("startup")
async def startup_security_check():
    from auth import SECRET_KEY
    issues = []
    if SECRET_KEY in _UNSAFE_KEYS or len(SECRET_KEY) < 32:
        issues.append("SECRET_KEY er ikke sat korrekt (min. 32 tegn, unik og tilfældig)")
    if "*" in ALLOWED_ORIGINS:
        issues.append("ALLOWED_ORIGINS tillader alle origins (*) — sæt konkrete domæner i produktion")
    if issues:
        print("\n" + "⚠️  " * 20)
        for issue in issues:
            print(f"⚠️  SIKKERHEDSADVARSEL: {issue}")
        print("⚠️  " * 20 + "\n")


# ─── Routers ───
app.include_router(citizen.router)
app.include_router(public.router)
app.include_router(responses.router)
app.include_router(admin.router)


def seed_data(db: Session):
    """Opret temaer, eksempelspørgsmål, areas og standard-admin hvis databasen er tom."""
    from models import Theme, Question, Area, AdminUser, AISettings, ModerationRule, Forloeb
    from auth import hash_password
    from utils import generate_temp_password
    from ai_service import DEFAULT_SYSTEM_PROMPT

    if db.query(Theme).count() > 0:
        return

    print("Seeder database med forløb, temaer og spørgsmål...")

    db.add(Forloeb(
        id="f1",
        title="Sammen om Norddjurs — Budget 2027",
        description="Del din holdning til kommunens prioriteringer for Budget 2027. Det tager kun 2-4 minutter.",
        slug="budget-2027",
        mode="themes",
        status="published",
        allow_citizen_questions=False,
        citizen_question_requires_approval=True,
        is_active=True,
        sort_order=1,
    ))

    themes_data = [
        ("t1", "Økonomi & Planlægning", "💰", 1),
        ("t2", "Børn, Unge & Sociale Forhold", "👨‍👩‍👧‍👦", 2),
        ("t3", "Beskæftigelse & Uddannelse", "🎓", 3),
        ("t4", "Klima, Natur & Miljø", "🌿", 4),
        ("t5", "Kultur, Fritid & Idræt", "🎭", 5),
    ]
    for tid, name, icon, order in themes_data:
        db.add(Theme(id=tid, name=name, icon=icon, sort_order=order, forloeb_id="f1"))

    questions_data = [
        ("q1", "t1", "Budget-prioritering", "Hvad synes du er vigtigst, når kommunen skal lægge budget for de næste år?", 1),
        ("q2", "t1", "Pengeforbrug", "Hvis du selv kunne bestemme, hvad ville du bruge flere penge på i Norddjurs?", 2),
        ("q3", "t2", "Børnefamilier", "Hvad fungerer godt for børnefamilier i Norddjurs — og hvad mangler?", 1),
        ("q4", "t2", "Udsatte borgere", "Hvad ville gøre den største forskel for udsatte borgere i kommunen?", 2),
        ("q5", "t3", "Bosætning", "Hvad skal der til for at flere vælger at arbejde og bo i Norddjurs?", 1),
        ("q6", "t3", "Arbejdsmarked", "Hvordan kan kommunen bedst hjælpe dem, der står uden for arbejdsmarkedet?", 2),
        ("q7", "t4", "Fremtidsvision", "Hvordan skal Norddjurs se ud om 10 år, når det handler om natur og klima?", 1),
        ("q8", "t4", "Klimahandling", "Hvad er det vigtigste, kommunen kan gøre for klimaet lige nu?", 2),
        ("q9", "t5", "Fritidstilbud", "Hvad mangler der af kultur- og fritidstilbud i dit område?", 1),
        ("q10", "t5", "Foreningsliv", "Hvordan kan vi få flere til at deltage i foreningslivet?", 2),
    ]
    for qid, tid, title, body, order in questions_data:
        db.add(Question(id=qid, theme_id=tid, title=title, body=body, sort_order=order))

    areas_data = [
        "Grenaa", "Auning", "Ørsted", "Glesborg", "Allingåbro",
        "Bønnerup", "Trustrup", "Vivild", "Hemmed", "Ørum",
    ]
    for i, name in enumerate(areas_data, start=1):
        db.add(Area(id=str(uuid.uuid4()), name=name, sort_order=i))

    admin_initial_password = os.getenv("ADMIN_INITIAL_PASSWORD", "").strip()
    if not admin_initial_password:
        admin_initial_password = generate_temp_password()
        print("\n" + "=" * 60)
        print(f"[SETUP] Admin email:    admin@norddjurs.dk")
        print(f"[SETUP] Admin kodeord: {admin_initial_password}")
        print("[SETUP] Gem dette og skift det straks efter første login!")
        print("=" * 60 + "\n")

    db.add(AdminUser(
        id=str(uuid.uuid4()),
        email="admin@norddjurs.dk",
        password_hash=hash_password(admin_initial_password),
        name="Administrator",
    ))

    db.add(AISettings(
        id="default",
        system_prompt=DEFAULT_SYSTEM_PROMPT,
        perspective_threshold=30,
    ))

    default_rules = [
        ("word", "fuck", "Bandeord"),
        ("word", "lort", "Bandeord"),
        ("word", "idiot", "Personangreb"),
        ("word", "dum", "Personangreb"),
        ("word", "inkompetent", "Personangreb"),
        ("regex", r"\b(han|hun|de)\s+er\s+(et\s+)?(svin|kriminel|løgner|idiot)", "Personangreb-mønster"),
        ("regex", r"\b(dræb|smid ud|af med)\b", "Trussel-mønster"),
    ]
    for rule_type, pattern, description in default_rules:
        db.add(ModerationRule(
            id=str(uuid.uuid4()),
            rule_type=rule_type,
            pattern=pattern,
            description=description,
        ))

    db.commit()
    print("Database seedet!")


if __name__ == "__main__":
    import uvicorn

    init_db()

    from database import SessionLocal
    db = SessionLocal()
    seed_data(db)
    db.close()

    from ai_service import check_ollama_health
    OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen3:8b")
    health = check_ollama_health()
    if health["ollama"] == "ok":
        if health["model_available"]:
            print(f"✅ Ollama kører — model '{health['model']}' er klar")
        else:
            print(f"⚠️  Ollama kører, men model '{health['model']}' er IKKE indlæst")
            print(f"   Kør: ollama pull {health['model']}")
            print(f"   Tilgængelige modeller: {', '.join(health['available_models']) or 'ingen'}")
    else:
        print(f"❌ Ollama er IKKE tilgængelig — AI-opfølgning virker ikke")
        print(f"   Start Ollama og kør: ollama pull {OLLAMA_MODEL}")

    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8321"))
    print(f"\n🗣️  Stemmer fra Norddjurs backend starter på http://{host}:{port}")
    print(f"📖 API docs: http://localhost:{port}/docs\n")
    uvicorn.run(app, host=host, port=port)
