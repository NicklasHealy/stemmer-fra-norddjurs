"""Responses, transskribering, AI-opfølgning og health-check."""

import os
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, Request
from sqlalchemy.orm import Session

import threading
from database import get_db, SessionLocal as _SessionLocal
from models import Citizen, Response, Question, AISettings
from auth import get_optional_citizen
from schemas import SubmitResponse, FollowupRequest
from serializers import response_dict
from utils import check_moderation
from limiter import limiter
from transcribe import transcribe_file
from ai_service import generate_followup
from email_service import notify_flagged_response
from constants import (
    MAX_UPLOAD_SIZE_MB, ALLOWED_AUDIO_MIMETYPES, ALLOWED_AUDIO_EXTENSIONS,
)

router = APIRouter(prefix="/api", tags=["responses"])

UPLOAD_DIR = os.getenv("UPLOAD_DIR", "./uploads")


def _analyse_sentiment_async(response_id: str, text: str):
    """Kør sentiment-analyse i baggrunden og gem resultatet på response."""
    def _run():
        try:
            from sentiment_analyse import analysér_sentiment
            result = analysér_sentiment(text)
            db = _SessionLocal()
            try:
                db.query(Response).filter(Response.id == response_id).update({
                    "sentiment_label": result["label"],
                    "sentiment_score": result["score"],
                    "sentiment_low_agreement": not result["enighed"],
                })
                db.commit()
            finally:
                db.close()
        except Exception as e:
            print(f"[Sentiment] Async analyse fejlede: {e}")
    threading.Thread(target=_run, daemon=True).start()
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_SIZE_MB", str(MAX_UPLOAD_SIZE_MB))) * 1024 * 1024


@router.post("/transcribe")
@limiter.limit("10/minute")
async def transcribe_preview(request: Request, file: UploadFile = File(...)):
    """Transskribér lyd til tekst uden at gemme som besvarelse — bruges til preview."""
    content_type = (file.content_type or "").split(";")[0].strip()
    if content_type and content_type not in ALLOWED_AUDIO_MIMETYPES:
        raise HTTPException(415, f"Ikke-understøttet filformat: {content_type}")

    contents = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, f"Filen er for stor (maks {MAX_UPLOAD_BYTES // 1024 // 1024} MB)")

    ext = os.path.splitext(file.filename or "")[-1].lower()
    if ext not in ALLOWED_AUDIO_EXTENSIONS:
        ext = ".webm"
    filename = f"tmp_{uuid.uuid4()}{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)
    try:
        with open(filepath, "wb") as f:
            f.write(contents)
        text = transcribe_file(filepath)
        return {"text": text}
    except Exception as e:
        print(f"Transcription preview error: {e}")
        raise HTTPException(500, "Transskribering fejlede")
    finally:
        if os.path.exists(filepath):
            os.remove(filepath)


@router.post("/responses")
def submit_response(
    data: SubmitResponse,
    citizen: Optional[Citizen] = Depends(get_optional_citizen),
    db: Session = Depends(get_db),
):
    if citizen and not data.is_followup:
        existing = db.query(Response).filter(
            Response.citizen_id == citizen.id,
            Response.question_id == data.question_id,
            Response.is_followup == False,
            Response.is_excluded == False,
        ).first()
        if existing:
            raise HTTPException(409, "Du har allerede besvaret dette spørgsmål")

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

    if response.text_content:
        _analyse_sentiment_async(response.id, response.text_content)

    if is_flagged and not data.is_followup:
        question = db.query(Question).filter(Question.id == data.question_id).first()
        try:
            notify_flagged_response(
                question_title=question.title if question else data.question_id,
                response_text=data.text_content or "",
                citizen_email=citizen.email if citizen else "Anonym",
            )
        except Exception as e:
            print(f"[Email] notify_flagged_response fejlede: {e}")

    return response_dict(response)


@router.post("/responses/audio")
@limiter.limit("20/minute")
async def submit_audio_response(
    request: Request,
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
    content_type = (file.content_type or "").split(";")[0].strip()
    if content_type and content_type not in ALLOWED_AUDIO_MIMETYPES:
        raise HTTPException(415, f"Ikke-understøttet filformat: {content_type}")

    contents = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, f"Filen er for stor (maks {MAX_UPLOAD_BYTES // 1024 // 1024} MB)")

    if citizen and not is_followup:
        existing = db.query(Response).filter(
            Response.citizen_id == citizen.id,
            Response.question_id == question_id,
            Response.is_followup == False,
            Response.is_excluded == False,
        ).first()
        if existing:
            raise HTTPException(409, "Du har allerede besvaret dette spørgsmål")

    ext = os.path.splitext(file.filename or "")[-1].lower()
    if ext not in ALLOWED_AUDIO_EXTENSIONS:
        ext = ".webm"
    filename = f"{uuid.uuid4()}{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)

    with open(filepath, "wb") as f:
        f.write(contents)

    try:
        try:
            text = transcribe_file(filepath)
        except Exception as e:
            print(f"Transcription error: {e}")
            text = "[Transskribering fejlede]"

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

        if response.text_content:
            _analyse_sentiment_async(response.id, response.text_content)
    except Exception:
        # Slet lydfilen hvis DB-operationen fejler for at undgå disk-leak
        if os.path.exists(filepath):
            os.remove(filepath)
        raise

    if is_flagged and not is_followup:
        question = db.query(Question).filter(Question.id == question_id).first()
        try:
            notify_flagged_response(
                question_title=question.title if question else question_id,
                response_text=text or "",
                citizen_email=citizen.email if citizen else "Anonym",
            )
        except Exception as e:
            print(f"[Email] notify_flagged_response fejlede: {e}")

    return {**response_dict(response), "transcription": text}


@router.post("/followup")
def get_followup_question(data: FollowupRequest, db: Session = Depends(get_db)):
    """Generér et AI-opfølgningsspørgsmål.

    Springer over (returnerer null) hvis antal besvarelser er under tærsklen sat i admin.
    """
    settings = db.query(AISettings).filter(AISettings.id == "default").first()
    system_prompt = settings.system_prompt if settings else None
    threshold = settings.perspective_threshold if settings else 30

    total_responses = db.query(Response).filter(
        Response.question_id == data.question_id,
        Response.is_followup == False,
        Response.is_excluded == False,
        Response.is_flagged == False,
        Response.text_content.isnot(None),
    ).count()

    if total_responses < threshold:
        print(f"Opfølgning sprunget over: {total_responses} svar (tærskel: {threshold})")
        return {"followup_question": None}

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

    try:
        followup = generate_followup(
            answer=data.answer,
            question_text=data.question_text,
            theme_name=data.theme_name,
            system_prompt=system_prompt,
            other_perspectives=other_texts,
            perspective_threshold=threshold,
        )
    except Exception as e:
        print(f"[AI] generate_followup fejlede: {e}")
        followup = None
    return {"followup_question": followup}


@router.get("/health")
def health():
    from ai_service import check_ollama_health
    try:
        ai_status = check_ollama_health()
    except Exception as e:
        ai_status = {"ollama": "error", "error": str(e)}
    return {"status": "ok", "version": "1.0.0", "ai": ai_status}
