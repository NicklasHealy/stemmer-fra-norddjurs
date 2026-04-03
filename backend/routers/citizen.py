"""Borger-endpoints: registrering, login, profil, GDPR-rettigheder."""

import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from database import get_db
from models import Citizen, Response, ResponseMetadata, Question, Theme, ConsentLog
from auth import hash_password, verify_password, create_token, get_current_citizen
from schemas import (
    CitizenRegister, CitizenLogin, ConsentUpdate,
    MetadataUpdate, ChangePasswordRequest,
)
from serializers import (
    citizen_dict, response_dict, meta_dict,
    CURRENT_CONSENT_VERSION,
)
from utils import validate_citizen_password, generate_temp_password
from limiter import limiter

router = APIRouter(prefix="/api/citizen", tags=["citizen"])


@router.post("/register")
@limiter.limit("5/minute")
def citizen_register(request: Request, data: CitizenRegister, db: Session = Depends(get_db)):
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
    return {"token": token, "citizen": citizen_dict(citizen)}


@router.post("/login")
@limiter.limit("10/minute")
def citizen_login(request: Request, data: CitizenLogin, db: Session = Depends(get_db)):
    citizen = db.query(Citizen).filter(Citizen.email == data.email.lower().strip()).first()
    if not citizen or not verify_password(data.password, citizen.password_hash):
        raise HTTPException(401, "Forkert email eller adgangskode")

    if citizen.must_change_password and citizen.temp_password_expires:
        if datetime.now(timezone.utc) > citizen.temp_password_expires:
            raise HTTPException(401, "Den midlertidige adgangskode er udløbet. Kontakt en administrator for at få en ny.")

    token = create_token({"sub": citizen.id, "role": "citizen"})
    return {"token": token, "citizen": citizen_dict(citizen)}


@router.get("/me")
def citizen_me(citizen: Citizen = Depends(get_current_citizen), db: Session = Depends(get_db)):
    meta = db.query(ResponseMetadata).filter(ResponseMetadata.citizen_id == citizen.id).first()
    response_count = db.query(Response).filter(
        Response.citizen_id == citizen.id,
        Response.is_followup == False,
        Response.is_excluded == False,
    ).count()
    return {
        **citizen_dict(citizen),
        "metadata": meta_dict(meta) if meta else None,
        "response_count": response_count,
    }


@router.put("/consent")
def citizen_consent(
    data: ConsentUpdate,
    request: Request,
    citizen: Citizen = Depends(get_current_citizen),
    db: Session = Depends(get_db),
):
    citizen.consent_given = data.consent_given
    citizen.consent_given_at = datetime.now(timezone.utc) if data.consent_given else None
    if data.consent_given:
        citizen.consent_version = CURRENT_CONSENT_VERSION
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


@router.put("/metadata")
def citizen_update_metadata(data: MetadataUpdate, citizen: Citizen = Depends(get_current_citizen), db: Session = Depends(get_db)):
    meta = db.query(ResponseMetadata).filter(ResponseMetadata.citizen_id == citizen.id).first()
    if not meta:
        meta = ResponseMetadata(id=str(uuid.uuid4()), citizen_id=citizen.id)
        db.add(meta)
    if data.age_group is not None: meta.age_group = data.age_group
    if data.area is not None: meta.area = data.area
    if data.role is not None: meta.role = data.role
    meta.updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True, "metadata": meta_dict(meta)}


@router.delete("/delete-all")
def citizen_delete_all(citizen: Citizen = Depends(get_current_citizen), db: Session = Depends(get_db)):
    """GDPR: Slet alle data for borgeren — svar, metadata, lydoptagelser og konto."""
    responses = db.query(Response).filter(Response.citizen_id == citizen.id).all()
    for r in responses:
        if r.audio_file_path and os.path.exists(r.audio_file_path):
            os.remove(r.audio_file_path)
    db.delete(citizen)
    db.commit()
    return {"ok": True, "message": "Alle data er slettet"}


@router.get("/responses")
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
            **response_dict(r),
            "question": {"id": q.id, "body": q.body, "title": q.title} if q else None,
            "theme": {"id": t.id, "name": t.name, "icon": t.icon} if t else None,
            "followup_response": response_dict(followup) if followup else None,
        })
    return result


@router.delete("/responses/{response_id}")
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
    db.query(Response).filter(Response.parent_response_id == r.id).delete()
    if r.audio_file_path and os.path.exists(r.audio_file_path):
        os.remove(r.audio_file_path)
    db.delete(r)
    db.commit()
    return {"ok": True}


@router.put("/freeze")
def citizen_freeze(citizen: Citizen = Depends(get_current_citizen), db: Session = Depends(get_db)):
    """Skifter frys-status. Frosne borgeres svar ekskluderes fra dashboard, analyse og AI-perspektiver."""
    citizen.frozen = not citizen.frozen
    db.commit()
    return {"ok": True, "frozen": citizen.frozen}


@router.put("/change-password")
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


@router.get("/export")
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
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "citizen": {
            "email": citizen.email,
            "created_at": citizen.created_at.isoformat() if citizen.created_at else None,
            "consent_given": citizen.consent_given,
            "consent_given_at": citizen.consent_given_at.isoformat() if citizen.consent_given_at else None,
        },
        "metadata": meta_dict(meta) if meta else None,
        "responses": result,
    }
