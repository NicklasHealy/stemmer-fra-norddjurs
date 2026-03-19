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
from datetime import datetime
from typing import Optional, List

from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
from sqlalchemy import func
from dotenv import load_dotenv

load_dotenv()

from database import get_db, init_db, engine
from models import (
    Theme, Question, Citizen, Response, ResponseMetadata,
    AnalysisCache, AdminUser, AISettings, Area, ModerationRule, Base,
)
from auth import (
    hash_password, verify_password, create_token,
    get_current_citizen, get_optional_citizen, get_current_admin,
)
from ai_service import generate_followup, generate_analysis
from transcribe import transcribe_file

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
    theme_id: str
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
def citizen_consent(data: ConsentUpdate, citizen: Citizen = Depends(get_current_citizen), db: Session = Depends(get_db)):
    citizen.consent_given = data.consent_given
    citizen.consent_given_at = datetime.utcnow() if data.consent_given else None
    db.commit()
    return {"ok": True, "consent_given": citizen.consent_given}


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
        t = db.query(Theme).filter(Theme.id == q.theme_id).first() if q else None
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

    # Hent tekster til perspektiv-blok
    other_texts = db.query(Response.text_content).filter(
        Response.question_id == data.question_id,
        Response.is_followup == False,
        Response.is_excluded == False,
        Response.is_flagged == False,
        Response.text_content.isnot(None),
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
        t = db.query(Theme).filter(Theme.id == q.theme_id).first() if q else None
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
    responses = db.query(Response).filter(
        Response.is_followup == False,
        Response.is_excluded == False,
    ).order_by(Response.created_at.desc()).all()

    output = io.StringIO()
    output.write("\ufeff")  # BOM for Excel
    writer = csv.writer(output)
    writer.writerow(["ID", "Tema", "Spørgsmål", "Svar", "Type", "Flagget", "Opfølgningsspørgsmål", "Opfølgningssvar", "Dato", "Alder", "Område", "Rolle"])

    for r in responses:
        q = db.query(Question).filter(Question.id == r.question_id).first()
        t = db.query(Theme).filter(Theme.id == q.theme_id).first() if q else None
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
    # Ekskluder udgåede besvarelser fra statistik
    total_responses = db.query(Response).filter(
        Response.is_followup == False,
        Response.is_excluded == False,
    ).count()
    flagged_count = db.query(Response).filter(
        Response.is_followup == False,
        Response.is_flagged == True,
        Response.is_excluded == False,
    ).count()
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
    query = db.query(Response.text_content).filter(
        Response.is_followup == False,
        Response.is_excluded == False,
        Response.is_flagged == False,
        Response.text_content.isnot(None),
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
# ─── HEALTH & STARTUP ─────────────────────────
# ═══════════════════════════════════════════════

@app.get("/api/health")
def health():
    from ai_service import check_ollama_health
    return {"status": "ok", "version": "1.0.0", "ai": check_ollama_health()}


def _citizen_dict(c: Citizen) -> dict:
    return {"id": c.id, "email": c.email, "consent_given": c.consent_given, "created_at": c.created_at.isoformat() if c.created_at else None}

def _theme_dict(t: Theme, db: Session) -> dict:
    q_count = db.query(Question).filter(Question.theme_id == t.id, Question.is_active == True).count()
    return {"id": t.id, "name": t.name, "icon": t.icon, "sort_order": t.sort_order, "question_count": q_count}

def _question_dict(q: Question) -> dict:
    return {"id": q.id, "theme_id": q.theme_id, "title": q.title, "body": q.body, "is_active": q.is_active, "allow_followup": q.allow_followup, "followup_prompt": q.followup_prompt, "sort_order": q.sort_order}

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

    print("Seeder database med temaer og spørgsmål...")

    themes_data = [
        ("t1", "Økonomi & Planlægning", "💰", 1),
        ("t2", "Børn, Unge & Sociale Forhold", "👨‍👩‍👧‍👦", 2),
        ("t3", "Beskæftigelse & Uddannelse", "🎓", 3),
        ("t4", "Klima, Natur & Miljø", "🌿", 4),
        ("t5", "Kultur, Fritid & Idræt", "🎭", 5),
    ]
    for tid, name, icon, order in themes_data:
        db.add(Theme(id=tid, name=name, icon=icon, sort_order=order))

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

    init_db()

    from database import SessionLocal
    db = SessionLocal()
    seed_data(db)
    db.close()

    # Tjek Ollama ved opstart
    from ai_service import check_ollama_health
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
