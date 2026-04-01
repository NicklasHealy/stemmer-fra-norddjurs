"""Offentlige endpoints: privatlivspolitik, forløb, temaer, områder."""

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import Forloeb, Theme, Question, Citizen, Area
from auth import get_current_citizen
from schemas import AreaCreate, CitizenQuestionCreate
from serializers import (
    forloeb_dict, theme_dict, question_dict,
    CURRENT_CONSENT_VERSION, PRIVACY_POLICY_TEXT,
)
from constants import CITIZEN_QUESTION_MIN_LENGTH, CITIZEN_QUESTION_MAX_LENGTH
from email_service import notify_citizen_question

router = APIRouter(prefix="/api", tags=["public"])


@router.get("/privacy-policy")
def get_privacy_policy():
    """Returnerer privatlivspolitikken som Markdown-tekst."""
    return {"version": CURRENT_CONSENT_VERSION, "text": PRIVACY_POLICY_TEXT}


@router.get("/forloeb")
def get_forloeb(db: Session = Depends(get_db)):
    """Aktive forløb — returnerer temaer (themes-mode) eller spørgsmålsantal (questions-mode)."""
    forloeb_list = db.query(Forloeb).filter(Forloeb.is_active == True).order_by(Forloeb.sort_order).all()
    return [forloeb_dict(f, db) for f in forloeb_list]


@router.get("/forloeb/{forloeb_id}/questions")
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
        d = question_dict(q)
        if q.is_citizen_submitted and not q.is_anonymous and q.submitted_by_citizen_id:
            submitter = db.query(Citizen).filter(Citizen.id == q.submitted_by_citizen_id).first()
            d["submitted_by_name"] = submitter.email if submitter else None
        else:
            d["submitted_by_name"] = None
        result.append(d)
    return result


@router.post("/forloeb/{forloeb_id}/citizen-question")
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
    if len(body) < CITIZEN_QUESTION_MIN_LENGTH:
        raise HTTPException(400, f"Spørgsmålet skal være mindst {CITIZEN_QUESTION_MIN_LENGTH} tegn")
    if len(body) > CITIZEN_QUESTION_MAX_LENGTH:
        raise HTTPException(400, f"Spørgsmålet må højst være {CITIZEN_QUESTION_MAX_LENGTH} tegn")

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
    return {"ok": True, "message": "Dit spørgsmål er tilføjet til forløbet", "question": question_dict(q)}


@router.get("/themes")
def get_themes(db: Session = Depends(get_db)):
    themes = db.query(Theme).order_by(Theme.sort_order).all()
    return [theme_dict(t, db) for t in themes]


@router.get("/themes/{theme_id}/questions")
def get_theme_questions(theme_id: str, db: Session = Depends(get_db)):
    questions = db.query(Question).filter(
        Question.theme_id == theme_id, Question.is_active == True
    ).order_by(Question.sort_order).all()
    return [question_dict(q) for q in questions]


@router.get("/areas")
def get_areas(db: Session = Depends(get_db)):
    areas = db.query(Area).order_by(Area.sort_order, Area.name).all()
    return [a.name for a in areas]


@router.post("/areas")
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
