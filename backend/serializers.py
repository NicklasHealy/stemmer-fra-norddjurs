"""Serializer-funktioner: konverterer ORM-objekter til dict for API-responses.

Samlet ét sted så alle routers bruger samme output-format.
"""

from sqlalchemy.orm import Session
from models import (
    Citizen, Theme, Question, Forloeb, Response,
    ResponseMetadata, ModerationRule,
)
from content import PRIVACY_POLICY_TEXT, CURRENT_CONSENT_VERSION  # noqa: F401 — re-exported

def citizen_dict(c: Citizen) -> dict:
    return {
        "id": c.id,
        "email": c.email,
        "consent_given": c.consent_given,
        "consent_version": c.consent_version if c.consent_version is not None else 1,
        "frozen": c.frozen if c.frozen is not None else False,
        "must_change_password": c.must_change_password if c.must_change_password is not None else False,
        "created_at": c.created_at.isoformat() if c.created_at else None,
    }


def theme_dict(t: Theme, db: Session) -> dict:
    q_count = db.query(Question).filter(
        Question.theme_id == t.id, Question.is_active == True
    ).count()
    return {
        "id": t.id, "name": t.name, "icon": t.icon, "sort_order": t.sort_order,
        "question_count": q_count,
        "forloeb_id": getattr(t, "forloeb_id", None),
    }


def question_dict(q: Question) -> dict:
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


def forloeb_dict(f: Forloeb, db: Session) -> dict:
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
        d["themes"] = [theme_dict(t, db) for t in f.themes]
    else:
        d["question_count"] = db.query(Question).filter(
            Question.forloeb_id == f.id,
            Question.is_active == True,
            Question.is_approved == True,
        ).count()
    return d


def response_dict(r: Response) -> dict:
    if not r:
        return None
    return {
        "id": r.id, "question_id": r.question_id, "citizen_id": r.citizen_id,
        "session_id": r.session_id, "response_type": r.response_type,
        "text_content": r.text_content, "has_audio": bool(r.audio_file_path),
        "is_followup": r.is_followup, "parent_response_id": r.parent_response_id,
        "followup_question_text": r.followup_question_text,
        "is_excluded": r.is_excluded, "is_flagged": r.is_flagged,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "sentiment_label": r.sentiment_label,
        "sentiment_score": r.sentiment_score,
        "sentiment_low_agreement": r.sentiment_low_agreement,
    }


def meta_dict(m: ResponseMetadata) -> dict:
    if not m:
        return None
    return {"age_group": m.age_group, "area": m.area, "role": m.role}


def rule_dict(r: ModerationRule) -> dict:
    return {
        "id": r.id, "rule_type": r.rule_type, "pattern": r.pattern,
        "description": r.description, "is_active": r.is_active,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }
