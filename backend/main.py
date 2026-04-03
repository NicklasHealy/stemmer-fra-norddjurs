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
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

load_dotenv()

from limiter import limiter
from database import init_db
from auth import _UNSAFE_KEYS
from routers import citizen, public, responses, admin

_raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173")
ALLOWED_ORIGINS = [o.strip() for o in _raw_origins.split(",") if o.strip()]


def _startup_security_check():
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


@asynccontextmanager
async def lifespan(app: FastAPI):
    _startup_security_check()
    yield


# ─── App setup ───
app = FastAPI(title="Stemmer fra Norddjurs", version="1.0.0", lifespan=lifespan)

# ─── Rate limiting ───
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ─── CORS ───
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

# ─── Routers ───
app.include_router(citizen.router)
app.include_router(public.router)
app.include_router(responses.router)
app.include_router(admin.router)


if __name__ == "__main__":
    from seed import seed_data
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
