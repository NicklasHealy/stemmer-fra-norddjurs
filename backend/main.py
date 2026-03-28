"""
Stemmer fra Norddjus — FastAPI Backend
========================================

Start:
  cp .env.example .env   (og udfyld)
  pip install -r requirements.txt
  python main.py

API docs: http://localhost:8321/docs
"""

import os
import re
import uuid
import shutil
import csv
import io
import secrets
import string
from datetime import datetime, timedelta
from typing import Optional, List

from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
from sqlalchemy import func
from dotenv import load_dotenv

load_dotenv()

from database import get_db, init_db, migrate_db, engine
from models import (
    Theme, Question, Citizen, Response, ResponseMetadata,
    AnalysisCache, AdminUser, AISettings, Area, ModerationRule, ConsentLog,
    PasswordResetLog, Forloeb, Base,
)
from auth import (
    hash_password, verify_password, create_token,
    get_current_citizen, get_optional_citizen, get_current_admin,
)
from ai_service import generate_followup, generate_analysis
from transcribe import transcribe_file
from email_service import notify_citizen_question, notify_flagged_response

# ─── App setup ───
app = FastAPI(title="Stemmer fra Norddjus", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # I produktion: begræns til din frontend-URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mappe til lydoptagelser
UPLOAD_DIR = os.getenv("UPLOAD_DIR", "./uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

# ─── Samtykke-version (opgave 14b) ───
# Bump denne ved ændring af samtykketerms — borgere med lavere version bedes re-acceptere
CURRENT_CONSENT_VERSION = 1

# ─── Privatlivspolitik-tekst (opgave 12) ───
PRIVACY_POLICY_TEXT = (
    "# Privatlivspolitik — Stemmer fra Norddjurs\n\n"
    "**Opdateret:** Maj 2026\n\n"
    "---\n\n"
    "## Dataansvarlig\n\n"
    "Norddjurs Kommune\nTorvet 3, 8500 Grenaa\nTlf. 89 59 10 00\nnorddjurs@norddjurs.dk\n\n"
    "## Databeskyttelsesrådgiver (DPO)\n\n"
    "Databeskyttelsesrådgiver\ndbr@norddjurs.dk\nTlf. 89 59 15 23\n\n"
    "---\n\n"
    "## Formål med behandlingen\n\n"
    "Norddjurs Kommune indsamler borgerholdninger via platformen 'Stemmer fra Norddjurs' til brug i kommunens "
    "budgetproces for Budget 2027. Formålet er at sikre bred borgerhøring i projektet 'Sammen om Norddjurs'.\n\n"
    "## Retsgrundlag\n\n"
    "Behandlingen sker på grundlag af dit samtykke, jf. GDPR artikel 6, stk. 1, litra a. "
    "Du kan til enhver tid trække dit samtykke tilbage.\n\n"
    "---\n\n"
    "## Hvilke oplysninger indsamler vi?\n\n"
    "- **Email-adresse** — bruges til login\n"
    "- **Adgangskode** — opbevares krypteret (bcrypt), aldrig i klartekst\n"
    "- **Dine besvarelser** — tekst og/eller lydoptagelser (max 90 sekunder)\n"
    "- **Frivillig metadata** — aldersgruppe og by/område\n\n"
    "---\n\n"
    "## AI-behandling\n\n"
    "Dine svar bruges til at generere opfølgningsspørgsmål via en lokal AI-model (Qwen 14B via Ollama). "
    "AI-modellen kører udelukkende på Norddjurs Kommunes egen server — ingen data sendes til eksterne tjenester. "
    "AI-modellen træffer ingen automatiserede beslutninger, der påvirker dig.\n\n"
    "---\n\n"
    "## Opbevaring og sletning\n\n"
    "Data opbevares sikkert på Norddjurs Kommunes servere og slettes senest februar 2027, "
    "medmindre du selv sletter dem tidligere via din profil.\n\n"
    "## Modtagere\n\n"
    "Dine data behandles udelukkende af projektmedarbejdere i Norddjurs Kommune. "
    "Anonymiserede og aggregerede resultater præsenteres for kommunens politikere.\n\n"
    "---\n\n"
    "## Dine rettigheder\n\n"
    "- **Indsigt (art. 15):** Se dine data via din profil eller ved henvendelse til kommunen.\n"
    "- **Berigtigelse (art. 16):** Ret oplysninger i din profil.\n"
    "- **Sletning (art. 17):** Slet alle dine data via 'Træk samtykke tilbage' i din profil.\n"
    "- **Begrænsning (art. 18):** Brug 'Frys mine data' i din profil — dine svar ekskluderes fra analyse.\n"
    "- **Dataportabilitet (art. 20):** Download dine data som JSON via din profil.\n"
    "- **Indsigelse (art. 21):** Kontakt DPO på dbr@norddjurs.dk.\n\n"
    "## Tilbagetrækning af samtykke\n\n"
    "Du kan til enhver tid trække dit samtykke tilbage via din profil. "
    "Alle dine data slettes permanent, og handlingen kan ikke fortrydes.\n\n"
    "---\n\n"
    "## Klageadgang\n\n"
    "Datatilsynet, Carl Jacobsens Vej 35, 2500 Valby\ndt@datatilsynet.dk\ndatatilsynet.dk\n\n"
    "---\n\n"
    "## Sikkerhed\n\n"
    "Platformen anvender HTTPS, krypterede adgangskoder og JWT-tokens. "
    "Al databehandling foregår inden for Norddjurs Kommunes netværk."
)


# ─── Password-validering (opgave 9b) ───

def validate_citizen_password(password: str) -> Optional[str]:
    """Returnerer fejlbesked hvis adgangskoden ikke opfylder kravene, ellers None."""
    if len(password) < 8:
        return "Adgangskoden skal være mindst 8 tegn"
    if not re.search(r"[A-Z]", password):
        return "Adgangskoden skal indeholde mindst ét stort bogstav (A-Z)"
    if not re.search(r"[a-z]", password):
        return "Adgangskoden skal indeholde mindst ét lille bogstav (a-z)"
    if not re.search(r"[0-9]", password):
        return "Adgangskoden skal indeholde mindst ét tal (0-9)"
    return None


# ─── Indholdsmoderation (opgave 8c) ───

def check_moderation(text: str, db: Session) -> bool:
    """Returnerer True hvis indholdet skal flagges til admin-review."""
    if not text or len(text.strip()) < 5:
        return False
    rules = db.query(ModerationRule).filter(ModerationRule.is_active == True).all()
    text_lower = text.lower()
    for rule in rules:
        try:
            if rule.rule_type == "word":
                if rule.pattern.lower() in text_lower:
                    return True
            elif rule.rule_type == "regex":
                if re.search(rule.pattern, text, re.IGNORECASE):
                    return True
        except Exception:
            pass
    return False


# ─── Pydantic schemas ───

class CitizenRegister(BaseModel):
    email: EmailStr
    password: str  # opgave 9b: nu med krav om 8 tegn, stort, lille, tal

class CitizenLogin(BaseModel):
    email: str
    password: str

class AdminLogin(BaseModel):
    email: str
    password: str

class ConsentUpdate(BaseModel):
    consent_given: bool

class MetadataUpdate(BaseModel):
    age_group: Optional[str] = None
    area: Optional[str] = None
    role: Optional[str] = None

class QuestionCreate(BaseModel):
    theme_id: Optional[str] = None    # None i questions-mode forløb
    forloeb_id: Optional[str] = None  # Sættes i questions-mode
    title: str
    body: str
    is_active: bool = True
    allow_followup: bool = True
    followup_prompt: str = ""
    sort_order: int = 0

class QuestionUpdate(BaseModel):
    title: Optional[str] = None
    body: Optional[str] = None
    theme_id: Optional[str] = None
    is_active: Optional[bool] = None
    allow_followup: Optional[bool] = None
    followup_prompt: Optional[str] = None
    sort_order: Optional[int] = None

class ThemeCreate(BaseModel):
    name: str
    icon: str = "📋"
    sort_order: int = 99

class SubmitResponse(BaseModel):
    question_id: str
    session_id: str
    text_content: str
    response_type: str = "text"
    is_followup: bool = False
    parent_response_id: Optional[str] = None
    followup_question_text: Optional[str] = None

class FollowupRequest(BaseModel):
    answer: str
    question_id: str
    theme_name: str
    question_text: str

class AISettingsUpdate(BaseModel):
    system_prompt: Optional[str] = None
    perspective_threshold: Optional[int] = None

class AnalysisRequest(BaseModel):
    analysis_type: str  # sentiment, themes, quotes, summary
    theme_id: Optional[str] = None
    question_id: Optional[str] = None

class AreaCreate(BaseModel):
    name: str

class ModerationRuleCreate(BaseModel):
    rule_type: str = "word"  # word, regex
    pattern: str
    description: Optional[str] = None

class ChangePasswordRequest(BaseModel):
    new_password: str
    confirm_password: str

class ForloebCreate(BaseModel):
    title: str
    description: Optional[str] = None
    slug: str
    mode: str = "themes"   # 'themes' | 'questions'
    status: str = "draft"  # 'draft' | 'published'
    image_url: Optional[str] = None
    allow_citizen_questions: bool = False
    citizen_question_requires_approval: bool = True
    is_active: bool = True
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    sort_order: int = 0

class ForloebUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    slug: Optional[str] = None
    mode: Optional[str] = None
    status: Optional[str] = None
    image_url: Optional[str] = None
    allow_citizen_questions: Optional[bool] = None
    citizen_question_requires_approval: Optional[bool] = None
    is_active: Optional[bool] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    sort_order: Optional[int] = None

class ReorderItem(BaseModel):
    id: str
    sort_order: int

class QuestionFork(BaseModel):
    theme_id: Optional[str] = None
    forloeb_id: Optional[str] = None

class CitizenQuestionCreate(BaseModel):
    body: str
    is_anonymous: bool = False


def generate_temp_password() -> str:
    """Genererer en tilfældig midlertidig adgangskode (12 tegn, opfylder kravene)."""
    alphabet = string.ascii_letters + string.digits
    while True:
        pw = "".join(secrets.choice(alphabet) for _ in range(12))
        if any(c.isupper() for c in pw) and any(c.islower() for c in pw) and any(c.isdigit() for c in pw):
            return pw


# ═══════════════════════════════════════════════
# ─── CITIZEN AUTH ──────────────────────────────
# ═══════════════════════════════════════════════

@app.post("/api/citizen/register")
def citizen_register(data: CitizenRegister, db: Session = Depends(get_db)):
    # Opgave 9b: password-validering
    err = validate_citizen_password(data.password)
    if err:
        raise HTTPException(400, err)
    if db.query(Citizen).filter(Citizen.email == data.email.lower()).first():
        raise HTTPException(409, "Denne email er allerede registreret")

    citizen = Citizen(
        id=str(uuid.uuid4()),
        email=data.email.lower().strip(),
        password_hash=hash_password(data.password),
    )
    db.add(citizen)
    db.commit()
    db.refresh(citizen)

    token = create_token({"sub": citizen.id, "role": "citizen"})
    return {"token": token, "citizen": _citizen_dict(citizen)}


@app.post("/api/citizen/login")
def citizen_login(data: CitizenLogin, db: Session = Depends(get_db)):
    citizen = db.query(Citizen).filter(Citizen.email == data.email.lower().strip()).first()
    if not citizen or not verify_password(data.password, citizen.password_hash):
        raise HTTPException(401, "Forkert email eller adgangskode")

    # Tjek om midlertidig adgangskode er udløbet
    if citizen.must_change_password and citizen.temp_password_expires:
        if datetime.utcnow() > citizen.temp_password_expires:
            raise HTTPException(401, "Den midlertidige adgangskode er udløbet. Kontakt en administrator for at få en ny.")

    token = create_token({"sub": citizen.id, "role": "citizen"})
    return {"token": token, "citizen": _citizen_dict(citizen)}


@app.get("/api/citizen/me")
def citizen_me(citizen: Citizen = Depends(get_current_citizen), db: Session = Depends(get_db)):
    meta = db.query(ResponseMetadata).filter(ResponseMetadata.citizen_id == citizen.id).first()
    response_count = db.query(Response).filter(
        Response.citizen_id == citizen.id,
        Response.is_followup == False,
        Response.is_excluded == False,
    ).count()
    return {
        **_citizen_dict(citizen),
        "metadata": _meta_dict(meta) if meta else None,
        "response_count": response_count,
    }


@app.put("/api/citizen/consent")
def citizen_consent(
    data: ConsentUpdate,
    request: Request,
    citizen: Citizen = Depends(get_current_citizen),
    db: Session = Depends(get_db),
):
    citizen.consent_given = data.consent_given
    citizen.consent_given_at = datetime.utcnow() if data.consent_given else None
    if data.consent_given:
        citizen.consent_version = CURRENT_CONSENT_VERSION
    # Opgave 14a: log samtykket
    ip = request.client.host if request.client else None
    log = ConsentLog(
        id=str(uuid.uuid4()),
        citizen_id=citizen.id,
        consent_given=data.consent_given,
        consent_version=CURRENT_CONSENT_VERSION,
        ip_address=ip,
    )
    db.add(log)
    db.commit()
    return {"ok": True, "consent_given": citizen.consent_given, "consent_version": citizen.consent_version}


@app.put("/api/citizen/metadata")
def citizen_update_metadata(data: MetadataUpdate, citizen: Citizen = Depends(get_current_citizen), db: Session = Depends(get_db)):
    meta = db.query(ResponseMetadata).filter(ResponseMetadata.citizen_id == citizen.id).first()
    if not meta:
        meta = ResponseMetadata(id=str(uuid.uuid4()), citizen_id=citizen.id)
        db.add(meta)
    if data.age_group is not None: meta.age_group = data.age_group
    if data.area is not None: meta.area = data.area
    if data.role is not None: meta.role = data.role
    meta.updated_at = datetime.utcnow()
    db.commit()
    return {"ok": True, "metadata": _meta_dict(meta)}


@app.delete("/api/citizen/delete-all")
def citizen_delete_all(citizen: Citizen = Depends(get_current_citizen), db: Session = Depends(get_db)):
    """GDPR: Slet alle data for borgeren — svar, metadata, lydoptagelser og konto."""
    responses = db.query(Response).filter(Response.citizen_id == citizen.id).all()
    for r in responses:
        if r.audio_file_path and os.path.exists(r.audio_file_path):
            os.remove(r.audio_file_path)
    db.delete(citizen)
    db.commit()
    return {"ok": True, "message": "Alle data er slettet"}


@app.get("/api/citizen/responses")
def citizen_responses(citizen: Citizen = Depends(get_current_citizen), db: Session = Depends(get_db)):
    responses = db.query(Response).filter(
        Response.citizen_id == citizen.id,
        Response.is_excluded == False,
    ).order_by(Response.created_at.desc()).all()
    result = []
    for r in responses:
        q = db.query(Question).filter(Question.id == r.question_id).first()
        t = db.query(Theme).filter(Theme.id == q.theme_id).first() if q and q.theme_id else None
        followup = db.query(Response).filter(Response.parent_response_id == r.id).first() if not r.is_followup else None
        result.append({
            **_response_dict(r),
            "question": {"id": q.id, "body": q.body, "title": q.title} if q else None,
            "theme": {"id": t.id, "name": t.name, "icon": t.icon} if t else None,
            "followup_response": _response_dict(followup) if followup else None,
        })
    return result


# Opgave 7a: Slet enkelt-svar
@app.delete("/api/citizen/responses/{response_id}")
def citizen_delete_response(
    response_id: str,
    citizen: Citizen = Depends(get_current_citizen),
    db: Session = Depends(get_db),
):
    r = db.query(Response).filter(
        Response.id == response_id,
        Response.citizen_id == citizen.id,
    ).first()
    if not r:
        raise HTTPException(404, "Besvarelse ikke fundet")
    # Slet evt. opfølgningssvar
    db.query(Response).filter(Response.parent_response_id == r.id).delete()
    # Slet lydfil
    if r.audio_file_path and os.path.exists(r.audio_file_path):
        os.remove(r.audio_file_path)
    db.delete(r)
    db.commit()
    return {"ok": True}


# Opgave 12: Privatlivspolitik
@app.get("/api/privacy-policy")
def get_privacy_policy():
    """Returnerer privatlivspolitikken som tekst (Markdown). Opdatér PRIVACY_POLICY_TEXT i main.py for at ændre indholdet."""
    return {"version": CURRENT_CONSENT_VERSION, "text": PRIVACY_POLICY_TEXT}


# Opgave 13b: Frys/frys-op borgers data
@app.put("/api/citizen/freeze")
def citizen_freeze(citizen: Citizen = Depends(get_current_citizen), db: Session = Depends(get_db)):
    """Skifter frys-status. Frosne borgeres svar ekskluderes fra dashboard, analyse og AI-perspektiver."""
    citizen.frozen = not citizen.frozen
    db.commit()
    return {"ok": True, "frozen": citizen.frozen}


# Tvungen kodeordsskift (efter admin-nulstilling)
@app.put("/api/citizen/change-password")
def citizen_change_password(
    data: ChangePasswordRequest,
    citizen: Citizen = Depends(get_current_citizen),
    db: Session = Depends(get_db),
):
    if data.new_password != data.confirm_password:
        raise HTTPException(400, "Adgangskoderne er ikke ens")
    err = validate_citizen_password(data.new_password)
    if err:
        raise HTTPException(400, err)
    citizen.password_hash = hash_password(data.new_password)
    citizen.must_change_password = False
    citizen.temp_password_expires = None
    db.commit()
    return {"ok": True}


# Opgave 13a: Dataportabilitet — download alle egne data
@app.get("/api/citizen/export")
def citizen_export(citizen: Citizen = Depends(get_current_citizen), db: Session = Depends(get_db)):
    """Returnerer alle borgerens data som JSON (art. 20 dataportabilitet)."""
    meta = db.query(ResponseMetadata).filter(ResponseMetadata.citizen_id == citizen.id).first()
    responses = db.query(Response).filter(Response.citizen_id == citizen.id).order_by(Response.created_at).all()
    result = []
    for r in responses:
        q = db.query(Question).filter(Question.id == r.question_id).first()
        t = db.query(Theme).filter(Theme.id == q.theme_id).first() if q and q.theme_id else None
        result.append({
            "id": r.id,
            "question": q.body if q else None,
            "theme": t.name if t else None,
            "response_type": r.response_type,
            "text_content": r.text_content,
            "is_followup": r.is_followup,
            "followup_question": r.followup_question_text,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        })
    return {
        "exported_at": datetime.utcnow().isoformat(),
        "citizen": {
            "email": citizen.email,
            "created_at": citizen.created_at.isoformat() if citizen.created_at else None,
            "consent_given": citizen.consent_given,
            "consent_given_at": citizen.consent_given_at.isoformat() if citizen.consent_given_at else None,
        },
        "metadata": _meta_dict(meta) if meta else None,
        "responses": result,
    }


# ═══════════════════════════════════════════════
# ─── PUBLIC: FORLØB ────────────────────────────
# ═══════════════════════════════════════════════

@app.get("/api/forloeb")
def get_forloeb(db: Session = Depends(get_db)):
    """Aktive forløb — returnerer temaer (themes-mode) eller spørgsmålsantal (questions-mode)."""
    forloeb_list = db.query(Forloeb).filter(Forloeb.is_active == True).order_by(Forloeb.sort_order).all()
    return [_forloeb_dict(f, db) for f in forloeb_list]


@app.get("/api/forloeb/{forloeb_id}/questions")
def get_forloeb_questions(forloeb_id: str, db: Session = Depends(get_db)):
    """Direkte spørgsmål i et forløb med mode='questions'."""
    f = db.query(Forloeb).filter(Forloeb.id == forloeb_id, Forloeb.is_active == True).first()
    if not f:
        raise HTTPException(404, "Forløb ikke fundet")
    questions = db.query(Question).filter(
        Question.forloeb_id == forloeb_id,
        Question.is_active == True,
        Question.is_approved == True,
    ).order_by(Question.sort_order).all()
    result = []
    for q in questions:
        d = _question_dict(q)
        if q.is_citizen_submitted and not q.is_anonymous and q.submitted_by_citizen_id:
            submitter = db.query(Citizen).filter(Citizen.id == q.submitted_by_citizen_id).first()
            d["submitted_by_name"] = submitter.email if submitter else None
        else:
            d["submitted_by_name"] = None
        result.append(d)
    return result


@app.post("/api/forloeb/{forloeb_id}/citizen-question")
def submit_citizen_question(
    forloeb_id: str,
    data: CitizenQuestionCreate,
    citizen: Citizen = Depends(get_current_citizen),
    db: Session = Depends(get_db),
):
    """Borger stiller et spørgsmål i et forløb."""
    f = db.query(Forloeb).filter(Forloeb.id == forloeb_id, Forloeb.is_active == True).first()
    if not f:
        raise HTTPException(404, "Forløb ikke fundet")
    if not f.allow_citizen_questions:
        raise HTTPException(403, "Dette forløb tillader ikke borgerspørgsmål")

    body = data.body.strip()
    if len(body) < 10:
        raise HTTPException(400, "Spørgsmålet skal være mindst 10 tegn")
    if len(body) > 500:
        raise HTTPException(400, "Spørgsmålet må højst være 500 tegn")

    needs_approval = f.citizen_question_requires_approval
    q = Question(
        id=str(uuid.uuid4()),
        theme_id=None,
        forloeb_id=forloeb_id,
        title="Borgerspørgsmål",
        body=body,
        is_active=True,
        allow_followup=True,
        followup_prompt="",
        sort_order=999,
        is_citizen_submitted=True,
        submitted_by_citizen_id=citizen.id,
        is_approved=not needs_approval,
        is_anonymous=data.is_anonymous,
    )
    db.add(q)
    db.commit()
    db.refresh(q)

    if needs_approval:
        notify_citizen_question(
            forloeb_title=f.title,
            question_body=body,
            citizen_email=citizen.email,
            is_anonymous=data.is_anonymous,
        )
        return {"ok": True, "message": "Dit spørgsmål er modtaget og vil blive gennemgået"}
    return {"ok": True, "message": "Dit spørgsmål er tilføjet til forløbet", "question": _question_dict(q)}


# ═══════════════════════════════════════════════
# ─── PUBLIC: THEMES & QUESTIONS ────────────────
# ═══════════════════════════════════════════════

@app.get("/api/themes")
def get_themes(db: Session = Depends(get_db)):
    themes = db.query(Theme).order_by(Theme.sort_order).all()
    return [_theme_dict(t, db) for t in themes]


@app.get("/api/themes/{theme_id}/questions")
def get_theme_questions(theme_id: str, db: Session = Depends(get_db)):
    questions = db.query(Question).filter(
        Question.theme_id == theme_id, Question.is_active == True
    ).order_by(Question.sort_order).all()
    return [_question_dict(q) for q in questions]


# ═══════════════════════════════════════════════
# ─── AREAS ─────────────────────────────────────
# ═══════════════════════════════════════════════

@app.get("/api/areas")
def get_areas(db: Session = Depends(get_db)):
    areas = db.query(Area).order_by(Area.sort_order, Area.name).all()
    return [a.name for a in areas]


@app.post("/api/areas")
def create_area(data: AreaCreate, db: Session = Depends(get_db)):
    name = data.name.strip()
    if not name or len(name) > 100:
        raise HTTPException(400, "Ugyldigt områdenavn")
    existing = db.query(Area).filter(Area.name == name).first()
    if existing:
        return {"name": existing.name}
    area = Area(id=str(uuid.uuid4()), name=name)
    db.add(area)
    db.commit()
    return {"name": area.name}


# ═══════════════════════════════════════════════
# ─── TRANSSKRIBERING (opgave 6b) ───────────────
# ═══════════════════════════════════════════════

@app.post("/api/transcribe")
async def transcribe_preview(file: UploadFile = File(...)):
    """Transskribér lyd til tekst uden at gemme som besvarelse — bruges til preview."""
    ext = os.path.splitext(file.filename or "audio.webm")[1] or ".webm"
    filename = f"tmp_{uuid.uuid4()}{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)
    try:
        with open(filepath, "wb") as f:
            shutil.copyfileobj(file.file, f)
        text = transcribe_file(filepath)
        return {"text": text}
    except Exception as e:
        print(f"Transcription preview error: {e}")
        raise HTTPException(500, "Transskribering fejlede")
    finally:
        if os.path.exists(filepath):
            os.remove(filepath)


# ═══════════════════════════════════════════════
# ─── RESPONSES ─────────────────────────────────
# ═══════════════════════════════════════════════

@app.post("/api/responses")
def submit_response(
    data: SubmitResponse,
    citizen: Optional[Citizen] = Depends(get_optional_citizen),
    db: Session = Depends(get_db),
):
    # Opgave 7b: Én besvarelse pr. spørgsmål
    if citizen and not data.is_followup:
        existing = db.query(Response).filter(
            Response.citizen_id == citizen.id,
            Response.question_id == data.question_id,
            Response.is_followup == False,
            Response.is_excluded == False,
        ).first()
        if existing:
            raise HTTPException(409, "Du har allerede besvaret dette spørgsmål")

    # Opgave 8c: Indholdsmoderation
    is_flagged = check_moderation(data.text_content, db) if not data.is_followup else False

    response = Response(
        id=str(uuid.uuid4()),
        question_id=data.question_id,
        citizen_id=citizen.id if citizen else None,
        session_id=data.session_id,
        response_type=data.response_type,
        text_content=data.text_content,
        is_followup=data.is_followup,
        parent_response_id=data.parent_response_id,
        followup_question_text=data.followup_question_text,
        is_flagged=is_flagged,
    )
    db.add(response)
    db.commit()
    db.refresh(response)

    if is_flagged and not data.is_followup:
        question = db.query(Question).filter(Question.id == data.question_id).first()
        notify_flagged_response(
            question_title=question.title if question else data.question_id,
            response_text=data.text_content or "",
            citizen_email=citizen.email if citizen else "Anonym",
        )

    return _response_dict(response)


@app.post("/api/responses/audio")
async def submit_audio_response(
    question_id: str = Query(...),
    session_id: str = Query(...),
    is_followup: bool = Query(False),
    parent_response_id: Optional[str] = Query(None),
    followup_question_text: Optional[str] = Query(None),
    file: UploadFile = File(...),
    citizen: Optional[Citizen] = Depends(get_optional_citizen),
    db: Session = Depends(get_db),
):
    """Upload lyd, transskribér, og gem som response."""

    # Opgave 7b: Én besvarelse pr. spørgsmål
    if citizen and not is_followup:
        existing = db.query(Response).filter(
            Response.citizen_id == citizen.id,
            Response.question_id == question_id,
            Response.is_followup == False,
            Response.is_excluded == False,
        ).first()
        if existing:
            raise HTTPException(409, "Du har allerede besvaret dette spørgsmål")

    # Gem lydfil
    ext = os.path.splitext(file.filename or "audio.webm")[1] or ".webm"
    filename = f"{uuid.uuid4()}{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)

    with open(filepath, "wb") as f:
        shutil.copyfileobj(file.file, f)

    # Transskribér
    try:
        text = transcribe_file(filepath)
    except Exception as e:
        print(f"Transcription error: {e}")
        text = "[Transskribering fejlede]"

    # Opgave 8c: Indholdsmoderation
    is_flagged = check_moderation(text, db) if not is_followup else False

    response = Response(
        id=str(uuid.uuid4()),
        question_id=question_id,
        citizen_id=citizen.id if citizen else None,
        session_id=session_id,
        response_type="audio",
        text_content=text,
        audio_file_path=filepath,
        is_followup=is_followup,
        parent_response_id=parent_response_id,
        followup_question_text=followup_question_text,
        is_flagged=is_flagged,
    )
    db.add(response)
    db.commit()
    db.refresh(response)

    if is_flagged and not is_followup:
        question = db.query(Question).filter(Question.id == question_id).first()
        notify_flagged_response(
            question_title=question.title if question else question_id,
            response_text=text or "",
            citizen_email=citizen.email if citizen else "Anonym",
        )

    return {**_response_dict(response), "transcription": text}


# ═══════════════════════════════════════════════
# ─── AI FOLLOWUP ───────────────────────────────
# ═══════════════════════════════════════════════

@app.post("/api/followup")
def get_followup_question(data: FollowupRequest, db: Session = Depends(get_db)):
    """Generér et AI-opfølgningsspørgsmål.

    Springer over (returnerer null) hvis antal besvarelser er under tærsklen sat i admin.
    """
    settings = db.query(AISettings).filter(AISettings.id == "default").first()
    system_prompt = settings.system_prompt if settings else None
    threshold = settings.perspective_threshold if settings else 30

    # Tæl totalt antal godkendte besvarelser på spørgsmålet
    total_responses = db.query(Response).filter(
        Response.question_id == data.question_id,
        Response.is_followup == False,
        Response.is_excluded == False,
        Response.is_flagged == False,
        Response.text_content.isnot(None),
    ).count()

    # Under tærskel — spring AI-kald over
    if total_responses < threshold:
        print(f"Opfølgning sprunget over: {total_responses} svar (tærskel: {threshold})")
        return {"followup_question": None}

    # Hent tekster til perspektiv-blok (ekskluder frosne borgeres svar — opgave 13b)
    frozen_citizen_ids = [c.id for c in db.query(Citizen.id).filter(Citizen.frozen == True).all()]
    other_texts = db.query(Response.text_content).filter(
        Response.question_id == data.question_id,
        Response.is_followup == False,
        Response.is_excluded == False,
        Response.is_flagged == False,
        Response.text_content.isnot(None),
        ~Response.citizen_id.in_(frozen_citizen_ids) if frozen_citizen_ids else True,
    ).all()
    other_texts = [r.text_content for r in other_texts if r.text_content and not r.text_content.startswith("[")]

    followup = generate_followup(
        answer=data.answer,
        question_text=data.question_text,
        theme_name=data.theme_name,
        system_prompt=system_prompt,
        other_perspectives=other_texts,
        perspective_threshold=threshold,
    )
    return {"followup_question": followup}


# ═══════════════════════════════════════════════
# ─── ADMIN AUTH ────────────────────────────────
# ═══════════════════════════════════════════════

@app.post("/api/admin/login")
def admin_login(data: AdminLogin, db: Session = Depends(get_db)):
    admin = db.query(AdminUser).filter(AdminUser.email == data.email.lower()).first()
    if not admin or not verify_password(data.password, admin.password_hash):
        raise HTTPException(401, "Forkert email eller adgangskode")
    token = create_token({"sub": admin.id, "role": "admin"})
    return {"token": token, "admin": {"id": admin.id, "email": admin.email, "name": admin.name}}


# ═══════════════════════════════════════════════
# ─── ADMIN: THEMES CRUD (opgave 8b) ────────────
# ═══════════════════════════════════════════════

@app.post("/api/admin/themes")
def admin_create_theme(data: ThemeCreate, admin: AdminUser = Depends(get_current_admin), db: Session = Depends(get_db)):
    name = data.name.strip()
    if not name or len(name) > 200:
        raise HTTPException(400, "Ugyldigt temanavn")
    theme = Theme(id=str(uuid.uuid4()), name=name, icon=data.icon, sort_order=data.sort_order)
    db.add(theme)
    db.commit()
    db.refresh(theme)
    return _theme_dict(theme, db)


@app.delete("/api/admin/themes/{theme_id}")
def admin_delete_theme(theme_id: str, admin: AdminUser = Depends(get_current_admin), db: Session = Depends(get_db)):
    theme = db.query(Theme).filter(Theme.id == theme_id).first()
    if not theme:
        raise HTTPException(404, "Tema ikke fundet")
    # Deaktivér spørgsmål under temaet (cascade delete af svar sker ikke — vi deaktiverer blot)
    db.query(Question).filter(Question.theme_id == theme_id).update({"is_active": False})
    db.delete(theme)
    db.commit()
    return {"ok": True}


# ═══════════════════════════════════════════════
# ─── ADMIN: FORLØB CRUD ─────────────────────────
# ═══════════════════════════════════════════════

@app.get("/api/admin/forloeb")
def admin_list_forloeb(admin: AdminUser = Depends(get_current_admin), db: Session = Depends(get_db)):
    forloeb_list = db.query(Forloeb).order_by(Forloeb.sort_order).all()
    return [_forloeb_dict(f, db) for f in forloeb_list]


@app.post("/api/admin/forloeb")
def admin_create_forloeb(data: ForloebCreate, admin: AdminUser = Depends(get_current_admin), db: Session = Depends(get_db)):
    slug = data.slug.strip().lower().replace(" ", "-")
    if db.query(Forloeb).filter(Forloeb.slug == slug).first():
        raise HTTPException(409, "Et forløb med dette URL-navn eksisterer allerede")
    f = Forloeb(id=str(uuid.uuid4()), **{**data.model_dump(), "slug": slug})
    db.add(f)
    db.commit()
    db.refresh(f)
    return _forloeb_dict(f, db)


@app.put("/api/admin/forloeb/{forloeb_id}")
def admin_update_forloeb(forloeb_id: str, data: ForloebUpdate, admin: AdminUser = Depends(get_current_admin), db: Session = Depends(get_db)):
    f = db.query(Forloeb).filter(Forloeb.id == forloeb_id).first()
    if not f:
        raise HTTPException(404, "Forløb ikke fundet")
    for key, val in data.model_dump(exclude_none=True).items():
        setattr(f, key, val)
    f.updated_at = datetime.utcnow()
    db.commit()
    return _forloeb_dict(f, db)


@app.delete("/api/admin/forloeb/{forloeb_id}")
def admin_delete_forloeb(forloeb_id: str, admin: AdminUser = Depends(get_current_admin), db: Session = Depends(get_db)):
    f = db.query(Forloeb).filter(Forloeb.id == forloeb_id).first()
    if not f:
        raise HTTPException(404, "Forløb ikke fundet")
    # Fjern forloeb_id-reference på tilknyttede temaer
    db.query(Theme).filter(Theme.forloeb_id == forloeb_id).update({"forloeb_id": None})
    db.delete(f)
    db.commit()
    return {"ok": True}


@app.put("/api/admin/themes/{theme_id}/forloeb")
def admin_set_theme_forloeb(
    theme_id: str,
    forloeb_id: Optional[str] = None,
    admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Tilknyt eller afknyt et tema fra et forløb."""
    theme = db.query(Theme).filter(Theme.id == theme_id).first()
    if not theme:
        raise HTTPException(404, "Tema ikke fundet")
    theme.forloeb_id = forloeb_id if forloeb_id else None  # tom streng → None
    db.commit()
    return _theme_dict(theme, db)


@app.get("/api/admin/forloeb/{forloeb_id}/pending-questions")
def admin_pending_questions(forloeb_id: str, admin: AdminUser = Depends(get_current_admin), db: Session = Depends(get_db)):
    """Borgerspørgsmål der afventer godkendelse."""
    questions = db.query(Question).filter(
        Question.forloeb_id == forloeb_id,
        Question.is_citizen_submitted == True,
        Question.is_approved == False,
    ).order_by(Question.created_at.desc()).all()
    result = []
    for q in questions:
        d = _question_dict(q)
        if q.submitted_by_citizen_id:
            submitter = db.query(Citizen).filter(Citizen.id == q.submitted_by_citizen_id).first()
            d["submitted_by_email"] = submitter.email if submitter else None
        result.append(d)
    return result


@app.put("/api/admin/forloeb/{forloeb_id}/publish")
def admin_publish_forloeb(forloeb_id: str, admin: AdminUser = Depends(get_current_admin), db: Session = Depends(get_db)):
    """Publicér et forløb — validerer at titel, beskrivelse og mindst ét spørgsmål er udfyldt."""
    f = db.query(Forloeb).filter(Forloeb.id == forloeb_id).first()
    if not f:
        raise HTTPException(404, "Forløb ikke fundet")
    if not f.title or not f.title.strip():
        raise HTTPException(422, "Forløbet mangler en titel")
    if not f.description or not f.description.strip():
        raise HTTPException(422, "Forløbet mangler en beskrivelse")
    # Tjek mindst ét aktivt spørgsmål
    if f.mode == "questions":
        q_count = db.query(Question).filter(Question.forloeb_id == forloeb_id, Question.is_active == True).count()
    else:
        theme_ids = [t.id for t in db.query(Theme).filter(Theme.forloeb_id == forloeb_id).all()]
        q_count = db.query(Question).filter(Question.theme_id.in_(theme_ids), Question.is_active == True).count() if theme_ids else 0
    if q_count == 0:
        raise HTTPException(422, "Forløbet skal have mindst ét aktivt spørgsmål")
    f.status = "published"
    f.is_active = True
    f.updated_at = datetime.utcnow()
    db.commit()
    return _forloeb_dict(f, db)


@app.put("/api/admin/forloeb/{forloeb_id}/reorder-themes")
def admin_reorder_themes(forloeb_id: str, items: List[ReorderItem], admin: AdminUser = Depends(get_current_admin), db: Session = Depends(get_db)):
    """Gem ny rækkefølge for temaer i et forløb."""
    for item in items:
        db.query(Theme).filter(Theme.id == item.id).update({"sort_order": item.sort_order})
    db.commit()
    return {"ok": True}


@app.put("/api/admin/forloeb/{forloeb_id}/reorder-questions")
def admin_reorder_questions(forloeb_id: str, items: List[ReorderItem], admin: AdminUser = Depends(get_current_admin), db: Session = Depends(get_db)):
    """Gem ny rækkefølge for spørgsmål (direkte eller via temaer) i et forløb."""
    for item in items:
        db.query(Question).filter(Question.id == item.id).update({"sort_order": item.sort_order})
    db.commit()
    return {"ok": True}


@app.post("/api/admin/questions/{question_id}/fork")
def admin_fork_question(question_id: str, data: QuestionFork, admin: AdminUser = Depends(get_current_admin), db: Session = Depends(get_db)):
    """Kopiér et spørgsmål til nyt med ny tilknytning (fork ved redigering af delt spørgsmål)."""
    orig = db.query(Question).filter(Question.id == question_id).first()
    if not orig:
        raise HTTPException(404, "Spørgsmål ikke fundet")
    new_q = Question(
        id=str(uuid.uuid4()),
        theme_id=data.theme_id,
        forloeb_id=data.forloeb_id,
        title=orig.title,
        body=orig.body,
        is_active=orig.is_active,
        allow_followup=orig.allow_followup,
        followup_prompt=orig.followup_prompt,
        sort_order=orig.sort_order,
    )
    db.add(new_q)
    db.commit()
    db.refresh(new_q)
    return _question_dict(new_q)


@app.put("/api/admin/questions/{question_id}/approve")
def admin_approve_question(question_id: str, admin: AdminUser = Depends(get_current_admin), db: Session = Depends(get_db)):
    """Godkend et borgerstillet spørgsmål."""
    q = db.query(Question).filter(Question.id == question_id).first()
    if not q:
        raise HTTPException(404, "Spørgsmål ikke fundet")
    q.is_approved = True
    q.updated_at = datetime.utcnow()
    db.commit()
    return _question_dict(q)


@app.delete("/api/admin/questions/{question_id}")
def admin_delete_question(question_id: str, admin: AdminUser = Depends(get_current_admin), db: Session = Depends(get_db)):
    """Slet et borgerstillet spørgsmål (afvis)."""
    q = db.query(Question).filter(Question.id == question_id).first()
    if not q:
        raise HTTPException(404, "Spørgsmål ikke fundet")
    if not getattr(q, "is_citizen_submitted", False):
        raise HTTPException(403, "Kun borgerstillede spørgsmål kan slettes via denne endpoint")
    db.delete(q)
    db.commit()
    return {"ok": True}


# ═══════════════════════════════════════════════
# ─── ADMIN: QUESTIONS CRUD ─────────────────────
# ═══════════════════════════════════════════════

@app.get("/api/admin/questions")
def admin_list_questions(admin: AdminUser = Depends(get_current_admin), db: Session = Depends(get_db)):
    questions = db.query(Question).order_by(Question.theme_id, Question.sort_order).all()
    return [_question_dict(q) for q in questions]


@app.post("/api/admin/questions")
def admin_create_question(data: QuestionCreate, admin: AdminUser = Depends(get_current_admin), db: Session = Depends(get_db)):
    q = Question(id=str(uuid.uuid4()), **data.model_dump())
    db.add(q)
    db.commit()
    db.refresh(q)
    return _question_dict(q)


@app.put("/api/admin/questions/{question_id}")
def admin_update_question(question_id: str, data: QuestionUpdate, admin: AdminUser = Depends(get_current_admin), db: Session = Depends(get_db)):
    q = db.query(Question).filter(Question.id == question_id).first()
    if not q:
        raise HTTPException(404, "Spørgsmål ikke fundet")
    for key, val in data.model_dump(exclude_none=True).items():
        setattr(q, key, val)
    q.updated_at = datetime.utcnow()
    db.commit()
    return _question_dict(q)


# ═══════════════════════════════════════════════
# ─── ADMIN: RESPONSES & EXPORT ─────────────────
# ═══════════════════════════════════════════════

@app.get("/api/admin/responses")
def admin_list_responses(
    theme_id: Optional[str] = None,
    age_group: Optional[str] = None,
    area: Optional[str] = None,
    flagged_only: bool = False,
    include_excluded: bool = False,
    limit: int = 200,
    offset: int = 0,
    admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    query = db.query(Response).filter(Response.is_followup == False)

    if not include_excluded:
        query = query.filter(Response.is_excluded == False)
    if flagged_only:
        query = query.filter(Response.is_flagged == True)

    if theme_id:
        question_ids = [q.id for q in db.query(Question.id).filter(Question.theme_id == theme_id).all()]
        query = query.filter(Response.question_id.in_(question_ids))

    if age_group or area:
        citizen_ids = db.query(ResponseMetadata.citizen_id)
        if age_group:
            citizen_ids = citizen_ids.filter(ResponseMetadata.age_group == age_group)
        if area:
            citizen_ids = citizen_ids.filter(ResponseMetadata.area == area)
        citizen_ids = [c.citizen_id for c in citizen_ids.all()]
        query = query.filter(Response.citizen_id.in_(citizen_ids))

    total = query.count()
    responses = query.order_by(Response.created_at.desc()).offset(offset).limit(limit).all()

    result = []
    for r in responses:
        q = db.query(Question).filter(Question.id == r.question_id).first()
        t = db.query(Theme).filter(Theme.id == q.theme_id).first() if q and q.theme_id else None
        meta = db.query(ResponseMetadata).filter(ResponseMetadata.citizen_id == r.citizen_id).first() if r.citizen_id else None
        followup = db.query(Response).filter(Response.parent_response_id == r.id).first()
        result.append({
            **_response_dict(r),
            "question": _question_dict(q) if q else None,
            "theme": {"id": t.id, "name": t.name, "icon": t.icon} if t else None,
            "metadata": _meta_dict(meta) if meta else None,
            "followup_response": _response_dict(followup) if followup else None,
        })
    return {"total": total, "responses": result}


# Opgave 8a: Markér besvarelse som udgået (soft delete)
@app.put("/api/admin/responses/{response_id}/exclude")
def admin_exclude_response(
    response_id: str,
    admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    r = db.query(Response).filter(Response.id == response_id).first()
    if not r:
        raise HTTPException(404, "Besvarelse ikke fundet")
    r.is_excluded = True
    db.commit()
    return {"ok": True}


# Opgave 8c: Admin godkender flagget besvarelse
@app.put("/api/admin/responses/{response_id}/approve")
def admin_approve_response(
    response_id: str,
    admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    r = db.query(Response).filter(Response.id == response_id).first()
    if not r:
        raise HTTPException(404, "Besvarelse ikke fundet")
    r.is_flagged = False
    db.commit()
    return {"ok": True}


@app.get("/api/admin/export/csv")
def admin_export_csv(admin: AdminUser = Depends(get_current_admin), db: Session = Depends(get_db)):
    frozen_ids = [c.id for c in db.query(Citizen.id).filter(Citizen.frozen == True).all()]
    responses_query = db.query(Response).filter(
        Response.is_followup == False,
        Response.is_excluded == False,
    )
    if frozen_ids:
        responses_query = responses_query.filter(~Response.citizen_id.in_(frozen_ids))
    responses = responses_query.order_by(Response.created_at.desc()).all()

    output = io.StringIO()
    output.write("\ufeff")  # BOM for Excel
    writer = csv.writer(output)
    writer.writerow(["ID", "Tema", "Spørgsmål", "Svar", "Type", "Flagget", "Opfølgningsspørgsmål", "Opfølgningssvar", "Dato", "Alder", "Område", "Rolle"])

    for r in responses:
        q = db.query(Question).filter(Question.id == r.question_id).first()
        t = db.query(Theme).filter(Theme.id == q.theme_id).first() if q and q.theme_id else None
        meta = db.query(ResponseMetadata).filter(ResponseMetadata.citizen_id == r.citizen_id).first() if r.citizen_id else None
        followup = db.query(Response).filter(Response.parent_response_id == r.id).first()
        writer.writerow([
            r.id, t.name if t else "", q.body if q else "",
            r.text_content or "", r.response_type,
            "Ja" if r.is_flagged else "Nej",
            followup.followup_question_text if followup else "",
            followup.text_content if followup else "",
            r.created_at.isoformat() if r.created_at else "",
            meta.age_group if meta else "", meta.area if meta else "", meta.role if meta else "",
        ])

    output.seek(0)
    return StreamingResponse(
        output,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=norddjurs-besvarelser.csv"},
    )


# ═══════════════════════════════════════════════
# ─── ADMIN: DASHBOARD ──────────────────────────
# ═══════════════════════════════════════════════

@app.get("/api/admin/dashboard")
def admin_dashboard(admin: AdminUser = Depends(get_current_admin), db: Session = Depends(get_db)):
    frozen_ids = [c.id for c in db.query(Citizen.id).filter(Citizen.frozen == True).all()]

    def not_frozen(q):
        return q.filter(~Response.citizen_id.in_(frozen_ids)) if frozen_ids else q

    # Ekskluder udgåede og frosne besvarelser fra statistik
    total_responses = not_frozen(db.query(Response).filter(
        Response.is_followup == False,
        Response.is_excluded == False,
    )).count()
    flagged_count = not_frozen(db.query(Response).filter(
        Response.is_followup == False,
        Response.is_flagged == True,
        Response.is_excluded == False,
    )).count()
    total_citizens = db.query(Citizen).count()

    themes = db.query(Theme).order_by(Theme.sort_order).all()
    per_theme = []
    for t in themes:
        q_ids = [q.id for q in db.query(Question.id).filter(Question.theme_id == t.id).all()]
        count = db.query(Response).filter(
            Response.question_id.in_(q_ids),
            Response.is_followup == False,
            Response.is_excluded == False,
        ).count() if q_ids else 0
        per_theme.append({"theme_id": t.id, "name": t.name, "icon": t.icon, "count": count})

    age_dist = db.query(ResponseMetadata.age_group, func.count(ResponseMetadata.id)).filter(
        ResponseMetadata.age_group.isnot(None)
    ).group_by(ResponseMetadata.age_group).all()

    area_dist = db.query(ResponseMetadata.area, func.count(ResponseMetadata.id)).filter(
        ResponseMetadata.area.isnot(None)
    ).group_by(ResponseMetadata.area).all()

    return {
        "total_responses": total_responses,
        "flagged_count": flagged_count,
        "total_citizens": total_citizens,
        "per_theme": per_theme,
        "age_distribution": [{"label": a, "value": c} for a, c in age_dist],
        "area_distribution": [{"label": a, "value": c} for a, c in area_dist],
    }


# ═══════════════════════════════════════════════
# ─── ADMIN: AI ANALYSIS ───────────────────────
# ═══════════════════════════════════════════════

@app.post("/api/admin/analysis")
def admin_run_analysis(data: AnalysisRequest, admin: AdminUser = Depends(get_current_admin), db: Session = Depends(get_db)):
    frozen_ids = [c.id for c in db.query(Citizen.id).filter(Citizen.frozen == True).all()]
    query = db.query(Response.text_content).filter(
        Response.is_followup == False,
        Response.is_excluded == False,
        Response.is_flagged == False,
        Response.text_content.isnot(None),
        ~Response.citizen_id.in_(frozen_ids) if frozen_ids else True,
    )
    if data.question_id:
        query = query.filter(Response.question_id == data.question_id)
    elif data.theme_id:
        q_ids = [q.id for q in db.query(Question.id).filter(Question.theme_id == data.theme_id).all()]
        query = query.filter(Response.question_id.in_(q_ids))

    texts = [r.text_content for r in query.all() if r.text_content and not r.text_content.startswith("[")]

    if len(texts) < 3:
        raise HTTPException(400, "Mindst 3 tekstbesvarelser krævet for analyse")

    result = generate_analysis(texts, data.analysis_type)
    if result is None:
        raise HTTPException(500, "Analyse fejlede")

    cache = AnalysisCache(
        id=str(uuid.uuid4()),
        question_id=data.question_id,
        theme_id=data.theme_id,
        analysis_type=data.analysis_type,
        result_json=result,
        response_count_at_generation=len(texts),
    )
    db.add(cache)
    db.commit()

    return {"analysis_type": data.analysis_type, "result": result, "response_count": len(texts)}


# ═══════════════════════════════════════════════
# ─── ADMIN: AI SETTINGS ───────────────────────
# ═══════════════════════════════════════════════

@app.get("/api/admin/ai-settings")
def admin_get_ai_settings(admin: AdminUser = Depends(get_current_admin), db: Session = Depends(get_db)):
    settings = db.query(AISettings).filter(AISettings.id == "default").first()
    if not settings:
        return {"system_prompt": "", "perspective_threshold": 30}
    return {"system_prompt": settings.system_prompt, "perspective_threshold": settings.perspective_threshold}


@app.put("/api/admin/ai-settings")
def admin_update_ai_settings(data: AISettingsUpdate, admin: AdminUser = Depends(get_current_admin), db: Session = Depends(get_db)):
    settings = db.query(AISettings).filter(AISettings.id == "default").first()
    if not settings:
        settings = AISettings(id="default", system_prompt=data.system_prompt or "", perspective_threshold=data.perspective_threshold or 30)
        db.add(settings)
    else:
        if data.system_prompt is not None: settings.system_prompt = data.system_prompt
        if data.perspective_threshold is not None: settings.perspective_threshold = data.perspective_threshold
    db.commit()
    return {"ok": True}


# ═══════════════════════════════════════════════
# ─── ADMIN: INDHOLDSMODERATION (opgave 8c) ─────
# ═══════════════════════════════════════════════

@app.get("/api/admin/moderation-rules")
def admin_get_moderation_rules(admin: AdminUser = Depends(get_current_admin), db: Session = Depends(get_db)):
    rules = db.query(ModerationRule).order_by(ModerationRule.created_at).all()
    return [_rule_dict(r) for r in rules]


@app.post("/api/admin/moderation-rules")
def admin_create_moderation_rule(data: ModerationRuleCreate, admin: AdminUser = Depends(get_current_admin), db: Session = Depends(get_db)):
    if not data.pattern.strip():
        raise HTTPException(400, "Mønster må ikke være tomt")
    rule = ModerationRule(
        id=str(uuid.uuid4()),
        rule_type=data.rule_type,
        pattern=data.pattern.strip(),
        description=data.description,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return _rule_dict(rule)


@app.delete("/api/admin/moderation-rules/{rule_id}")
def admin_delete_moderation_rule(rule_id: str, admin: AdminUser = Depends(get_current_admin), db: Session = Depends(get_db)):
    rule = db.query(ModerationRule).filter(ModerationRule.id == rule_id).first()
    if not rule:
        raise HTTPException(404, "Regel ikke fundet")
    db.delete(rule)
    db.commit()
    return {"ok": True}


@app.put("/api/admin/moderation-rules/{rule_id}/toggle")
def admin_toggle_moderation_rule(rule_id: str, admin: AdminUser = Depends(get_current_admin), db: Session = Depends(get_db)):
    rule = db.query(ModerationRule).filter(ModerationRule.id == rule_id).first()
    if not rule:
        raise HTTPException(404, "Regel ikke fundet")
    rule.is_active = not rule.is_active
    db.commit()
    return _rule_dict(rule)


# ═══════════════════════════════════════════════
# ─── ADMIN: SAMTYKKE-OVERSIGT (opgave 14c) ─────
# ═══════════════════════════════════════════════

@app.get("/api/admin/consent-overview")
def admin_consent_overview(admin: AdminUser = Depends(get_current_admin), db: Session = Depends(get_db)):
    """Returnerer statistik over borgeres samtykker, fordelt på version og status."""
    total_citizens = db.query(Citizen).count()
    consent_given = db.query(Citizen).filter(Citizen.consent_given == True).count()
    consent_withdrawn = db.query(Citizen).filter(Citizen.consent_given == False).count()
    frozen_count = db.query(Citizen).filter(Citizen.frozen == True).count()

    # Pr. samtykke-version
    by_version = db.query(Citizen.consent_version, func.count(Citizen.id)).filter(
        Citizen.consent_given == True
    ).group_by(Citizen.consent_version).all()

    # Nyeste samtykke-logs
    recent_logs = db.query(ConsentLog).order_by(ConsentLog.created_at.desc()).limit(20).all()

    return {
        "current_consent_version": CURRENT_CONSENT_VERSION,
        "total_citizens": total_citizens,
        "consent_given": consent_given,
        "consent_withdrawn": consent_withdrawn,
        "frozen_count": frozen_count,
        "by_version": [{"version": v, "count": c} for v, c in by_version],
        "recent_logs": [
            {
                "citizen_id": l.citizen_id,
                "consent_given": l.consent_given,
                "consent_version": l.consent_version,
                "ip_address": l.ip_address,
                "created_at": l.created_at.isoformat() if l.created_at else None,
            }
            for l in recent_logs
        ],
    }


# ═══════════════════════════════════════════════
# ─── ADMIN: BORGERSTYRING & KODE-NULSTILLING ───
# ═══════════════════════════════════════════════

@app.get("/api/admin/citizens")
def admin_search_citizens(
    q: Optional[str] = None,
    limit: int = 50,
    admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Søg efter borgere via email. Returnerer liste med status."""
    query = db.query(Citizen)
    if q:
        query = query.filter(Citizen.email.ilike(f"%{q}%"))
    citizens = query.order_by(Citizen.created_at.desc()).limit(limit).all()
    result = []
    for c in citizens:
        response_count = db.query(Response).filter(
            Response.citizen_id == c.id,
            Response.is_followup == False,
        ).count()
        result.append({
            **_citizen_dict(c),
            "response_count": response_count,
            "temp_password_expires": c.temp_password_expires.isoformat() if c.temp_password_expires else None,
        })
    return result


@app.post("/api/admin/citizens/{citizen_id}/reset-password")
def admin_reset_citizen_password(
    citizen_id: str,
    admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Genererer en midlertidig adgangskode og returnerer den ÉN GANG til admin.
    Borgeren tvinges til at skifte kode ved næste login.
    Koden udløber efter 24 timer.
    """
    citizen = db.query(Citizen).filter(Citizen.id == citizen_id).first()
    if not citizen:
        raise HTTPException(404, "Borger ikke fundet")

    temp_pw = generate_temp_password()
    expires_at = datetime.utcnow() + timedelta(hours=24)

    citizen.password_hash = hash_password(temp_pw)
    citizen.must_change_password = True
    citizen.temp_password_expires = expires_at

    # Audit-log
    log = PasswordResetLog(
        id=str(uuid.uuid4()),
        admin_user_id=admin.id,
        target_citizen_id=citizen.id,
        temp_password_expires=expires_at,
    )
    db.add(log)
    db.commit()

    return {
        "ok": True,
        "temp_password": temp_pw,         # Vises KUN denne ene gang
        "expires_at": expires_at.isoformat(),
        "citizen_email": citizen.email,
    }


# ═══════════════════════════════════════════════
# ─── HEALTH & STARTUP ─────────────────────────
# ═══════════════════════════════════════════════

@app.get("/api/health")
def health():
    from ai_service import check_ollama_health
    return {"status": "ok", "version": "1.0.0", "ai": check_ollama_health()}


def _citizen_dict(c: Citizen) -> dict:
    return {
        "id": c.id,
        "email": c.email,
        "consent_given": c.consent_given,
        "consent_version": c.consent_version if c.consent_version is not None else 1,
        "frozen": c.frozen if c.frozen is not None else False,
        "must_change_password": c.must_change_password if c.must_change_password is not None else False,
        "created_at": c.created_at.isoformat() if c.created_at else None,
    }

def _theme_dict(t: Theme, db: Session) -> dict:
    q_count = db.query(Question).filter(Question.theme_id == t.id, Question.is_active == True).count()
    return {
        "id": t.id, "name": t.name, "icon": t.icon, "sort_order": t.sort_order,
        "question_count": q_count,
        "forloeb_id": getattr(t, "forloeb_id", None),
    }

def _question_dict(q: Question) -> dict:
    return {
        "id": q.id,
        "theme_id": q.theme_id,
        "forloeb_id": getattr(q, "forloeb_id", None),
        "title": q.title,
        "body": q.body,
        "is_active": q.is_active,
        "allow_followup": q.allow_followup,
        "followup_prompt": q.followup_prompt,
        "sort_order": q.sort_order,
        "is_citizen_submitted": getattr(q, "is_citizen_submitted", False) or False,
        "is_approved": getattr(q, "is_approved", True),
        "is_anonymous": getattr(q, "is_anonymous", False) or False,
    }

def _forloeb_dict(f: Forloeb, db: Session) -> dict:
    d = {
        "id": f.id,
        "title": f.title,
        "description": f.description,
        "slug": f.slug,
        "mode": f.mode,
        "status": getattr(f, "status", "published"),
        "image_url": getattr(f, "image_url", None),
        "allow_citizen_questions": f.allow_citizen_questions,
        "citizen_question_requires_approval": f.citizen_question_requires_approval,
        "is_active": f.is_active,
        "start_date": f.start_date.isoformat() if f.start_date else None,
        "end_date": f.end_date.isoformat() if f.end_date else None,
        "sort_order": f.sort_order,
        "created_at": f.created_at.isoformat() if f.created_at else None,
    }
    if f.mode == "themes":
        d["themes"] = [_theme_dict(t, db) for t in f.themes]
    else:
        d["question_count"] = db.query(Question).filter(
            Question.forloeb_id == f.id,
            Question.is_active == True,
            Question.is_approved == True,
        ).count()
    return d

def _response_dict(r: Response) -> dict:
    if not r: return None
    return {
        "id": r.id, "question_id": r.question_id, "citizen_id": r.citizen_id,
        "session_id": r.session_id, "response_type": r.response_type,
        "text_content": r.text_content, "has_audio": bool(r.audio_file_path),
        "is_followup": r.is_followup, "parent_response_id": r.parent_response_id,
        "followup_question_text": r.followup_question_text,
        "is_excluded": r.is_excluded, "is_flagged": r.is_flagged,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }

def _meta_dict(m: ResponseMetadata) -> dict:
    if not m: return None
    return {"age_group": m.age_group, "area": m.area, "role": m.role}

def _rule_dict(r: ModerationRule) -> dict:
    return {
        "id": r.id, "rule_type": r.rule_type, "pattern": r.pattern,
        "description": r.description, "is_active": r.is_active,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


def seed_data(db: Session):
    """Opret temaer, eksempelspørgsmål, areas og standard-admin hvis databasen er tom."""
    if db.query(Theme).count() > 0:
        return

    print("Seeder database med forløb, temaer og spørgsmål...")

    # Standard forløb
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

    db.add(AdminUser(
        id=str(uuid.uuid4()),
        email="admin@norddjurs.dk",
        password_hash=hash_password("norddjurs2025"),
        name="Administrator",
    ))

    from ai_service import DEFAULT_SYSTEM_PROMPT
    db.add(AISettings(
        id="default",
        system_prompt=DEFAULT_SYSTEM_PROMPT,
        perspective_threshold=30,
    ))

    # Standard moderationsregler (opgave 8c)
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

    migrate_db()  # Opretter tabeller + tilføjer nye kolonner til eksisterende tabeller

    from database import SessionLocal
    db = SessionLocal()
    seed_data(db)
    db.close()

    # Tjek Ollama ved opstart
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
