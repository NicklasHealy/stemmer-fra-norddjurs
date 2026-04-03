"""Admin-endpoints: auth, indhold, besvarelser, analyse, moderation, borgerstyring."""

import csv
import io
import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from models import (
    Theme, Question, Citizen, Response, ResponseMetadata,
    AnalysisCache, AdminUser, AISettings, ModerationRule,
    ConsentLog, PasswordResetLog, Forloeb,
)
from auth import hash_password, verify_password, create_token, get_current_admin
from schemas import (
    AdminLogin, ThemeCreate, ForloebCreate, ForloebUpdate, ReorderItem,
    QuestionCreate, QuestionUpdate, QuestionFork,
    AISettingsUpdate, AnalysisRequest, ModerationRuleCreate,
)
from serializers import (
    citizen_dict, theme_dict, question_dict, forloeb_dict,
    response_dict, meta_dict, rule_dict, CURRENT_CONSENT_VERSION,
)
from utils import generate_temp_password, validate_citizen_password
from limiter import limiter
from ai_service import generate_analysis
from email_service import notify_citizen_question
from constants import TEMP_PASSWORD_EXPIRY_HOURS

router = APIRouter(prefix="/api/admin", tags=["admin"])


# ─── Auth ────────────────────────────────────────────────────────────────────

@router.post("/login")
@limiter.limit("10/minute")
def admin_login(request: Request, data: AdminLogin, db: Session = Depends(get_db)):
    admin = db.query(AdminUser).filter(AdminUser.email == data.email.lower()).first()
    if not admin or not verify_password(data.password, admin.password_hash):
        raise HTTPException(401, "Forkert email eller adgangskode")
    token = create_token({"sub": admin.id, "role": "admin"})
    return {"token": token, "admin": {"id": admin.id, "email": admin.email, "name": admin.name}}


# ─── Temaer ──────────────────────────────────────────────────────────────────

@router.post("/themes")
def admin_create_theme(data: ThemeCreate, admin: AdminUser = Depends(get_current_admin), db: Session = Depends(get_db)):
    name = data.name.strip()
    if not name or len(name) > 200:
        raise HTTPException(400, "Ugyldigt temanavn")
    theme = Theme(id=str(uuid.uuid4()), name=name, icon=data.icon, sort_order=data.sort_order)
    db.add(theme)
    db.commit()
    db.refresh(theme)
    return theme_dict(theme, db)


@router.delete("/themes/{theme_id}")
def admin_delete_theme(theme_id: str, admin: AdminUser = Depends(get_current_admin), db: Session = Depends(get_db)):
    theme = db.query(Theme).filter(Theme.id == theme_id).first()
    if not theme:
        raise HTTPException(404, "Tema ikke fundet")
    db.query(Question).filter(Question.theme_id == theme_id).update({"is_active": False})
    db.delete(theme)
    db.commit()
    return {"ok": True}


@router.put("/themes/{theme_id}/forloeb")
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
    theme.forloeb_id = forloeb_id if forloeb_id else None
    db.commit()
    return theme_dict(theme, db)


# ─── Forløb ───────────────────────────────────────────────────────────────────

@router.get("/forloeb")
def admin_list_forloeb(admin: AdminUser = Depends(get_current_admin), db: Session = Depends(get_db)):
    forloeb_list = db.query(Forloeb).order_by(Forloeb.sort_order).all()
    return [forloeb_dict(f, db) for f in forloeb_list]


@router.post("/forloeb")
def admin_create_forloeb(data: ForloebCreate, admin: AdminUser = Depends(get_current_admin), db: Session = Depends(get_db)):
    slug = data.slug.strip().lower().replace(" ", "-")
    if db.query(Forloeb).filter(Forloeb.slug == slug).first():
        raise HTTPException(409, "Et forløb med dette URL-navn eksisterer allerede")
    f = Forloeb(id=str(uuid.uuid4()), **{**data.model_dump(), "slug": slug})
    db.add(f)
    db.commit()
    db.refresh(f)
    return forloeb_dict(f, db)


@router.put("/forloeb/{forloeb_id}")
def admin_update_forloeb(forloeb_id: str, data: ForloebUpdate, admin: AdminUser = Depends(get_current_admin), db: Session = Depends(get_db)):
    f = db.query(Forloeb).filter(Forloeb.id == forloeb_id).first()
    if not f:
        raise HTTPException(404, "Forløb ikke fundet")
    for key, val in data.model_dump(exclude_none=True).items():
        setattr(f, key, val)
    f.updated_at = datetime.now(timezone.utc)
    db.commit()
    return forloeb_dict(f, db)


@router.delete("/forloeb/{forloeb_id}")
def admin_delete_forloeb(forloeb_id: str, admin: AdminUser = Depends(get_current_admin), db: Session = Depends(get_db)):
    f = db.query(Forloeb).filter(Forloeb.id == forloeb_id).first()
    if not f:
        raise HTTPException(404, "Forløb ikke fundet")
    db.query(Theme).filter(Theme.forloeb_id == forloeb_id).update({"forloeb_id": None})
    db.delete(f)
    db.commit()
    return {"ok": True}


@router.get("/forloeb/{forloeb_id}/pending-questions")
def admin_pending_questions(forloeb_id: str, admin: AdminUser = Depends(get_current_admin), db: Session = Depends(get_db)):
    """Borgerspørgsmål der afventer godkendelse."""
    questions = db.query(Question).filter(
        Question.forloeb_id == forloeb_id,
        Question.is_citizen_submitted == True,
        Question.is_approved == False,
    ).order_by(Question.created_at.desc()).all()
    # Batch-load submitters i stedet for én query pr. spørgsmål
    submitter_ids = {q.submitted_by_citizen_id for q in questions if q.submitted_by_citizen_id}
    submitters = {c.id: c for c in db.query(Citizen).filter(Citizen.id.in_(submitter_ids)).all()} if submitter_ids else {}
    result = []
    for q in questions:
        d = question_dict(q)
        if q.submitted_by_citizen_id:
            s = submitters.get(q.submitted_by_citizen_id)
            d["submitted_by_email"] = s.email if s else None
        result.append(d)
    return result


@router.put("/forloeb/{forloeb_id}/publish")
def admin_publish_forloeb(forloeb_id: str, admin: AdminUser = Depends(get_current_admin), db: Session = Depends(get_db)):
    """Publicér et forløb — validerer at titel, beskrivelse og mindst ét spørgsmål er udfyldt."""
    f = db.query(Forloeb).filter(Forloeb.id == forloeb_id).first()
    if not f:
        raise HTTPException(404, "Forløb ikke fundet")
    if not f.title or not f.title.strip():
        raise HTTPException(422, "Forløbet mangler en titel")
    if not f.description or not f.description.strip():
        raise HTTPException(422, "Forløbet mangler en beskrivelse")
    if f.mode == "questions":
        q_count = db.query(Question).filter(Question.forloeb_id == forloeb_id, Question.is_active == True).count()
    else:
        theme_ids = [t.id for t in db.query(Theme).filter(Theme.forloeb_id == forloeb_id).all()]
        q_count = db.query(Question).filter(Question.theme_id.in_(theme_ids), Question.is_active == True).count() if theme_ids else 0
    if q_count == 0:
        raise HTTPException(422, "Forløbet skal have mindst ét aktivt spørgsmål")
    f.status = "published"
    f.is_active = True
    f.updated_at = datetime.now(timezone.utc)
    db.commit()
    return forloeb_dict(f, db)


@router.put("/forloeb/{forloeb_id}/reorder-themes")
def admin_reorder_themes(forloeb_id: str, items: List[ReorderItem], admin: AdminUser = Depends(get_current_admin), db: Session = Depends(get_db)):
    """Gem ny rækkefølge for temaer i et forløb."""
    for item in items:
        db.query(Theme).filter(Theme.id == item.id).update({"sort_order": item.sort_order})
    db.commit()
    return {"ok": True}


@router.put("/forloeb/{forloeb_id}/reorder-questions")
def admin_reorder_questions(forloeb_id: str, items: List[ReorderItem], admin: AdminUser = Depends(get_current_admin), db: Session = Depends(get_db)):
    """Gem ny rækkefølge for spørgsmål i et forløb."""
    for item in items:
        db.query(Question).filter(Question.id == item.id).update({"sort_order": item.sort_order})
    db.commit()
    return {"ok": True}


# ─── Spørgsmål ────────────────────────────────────────────────────────────────

@router.post("/questions/{question_id}/fork")
def admin_fork_question(question_id: str, data: QuestionFork, admin: AdminUser = Depends(get_current_admin), db: Session = Depends(get_db)):
    """Kopiér et spørgsmål til nyt med ny tilknytning."""
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
    return question_dict(new_q)


@router.put("/questions/{question_id}/approve")
def admin_approve_question(question_id: str, admin: AdminUser = Depends(get_current_admin), db: Session = Depends(get_db)):
    """Godkend et borgerstillet spørgsmål."""
    q = db.query(Question).filter(Question.id == question_id).first()
    if not q:
        raise HTTPException(404, "Spørgsmål ikke fundet")
    q.is_approved = True
    q.updated_at = datetime.now(timezone.utc)
    db.commit()
    return question_dict(q)


@router.delete("/questions/{question_id}")
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


@router.get("/questions")
def admin_list_questions(admin: AdminUser = Depends(get_current_admin), db: Session = Depends(get_db)):
    questions = db.query(Question).order_by(Question.theme_id, Question.sort_order).all()
    return [question_dict(q) for q in questions]


@router.post("/questions")
def admin_create_question(data: QuestionCreate, admin: AdminUser = Depends(get_current_admin), db: Session = Depends(get_db)):
    q = Question(id=str(uuid.uuid4()), **data.model_dump())
    db.add(q)
    db.commit()
    db.refresh(q)
    return question_dict(q)


@router.put("/questions/{question_id}")
def admin_update_question(question_id: str, data: QuestionUpdate, admin: AdminUser = Depends(get_current_admin), db: Session = Depends(get_db)):
    q = db.query(Question).filter(Question.id == question_id).first()
    if not q:
        raise HTTPException(404, "Spørgsmål ikke fundet")
    for key, val in data.model_dump(exclude_none=True).items():
        setattr(q, key, val)
    q.updated_at = datetime.now(timezone.utc)
    db.commit()
    return question_dict(q)


# ─── Besvarelser & export ─────────────────────────────────────────────────────

@router.get("/responses")
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

    # Batch-load relaterede data for at undgå N+1 queries
    question_ids = {r.question_id for r in responses}
    questions_map = {q.id: q for q in db.query(Question).filter(Question.id.in_(question_ids)).all()} if question_ids else {}
    theme_ids = {q.theme_id for q in questions_map.values() if q.theme_id}
    themes_map = {t.id: t for t in db.query(Theme).filter(Theme.id.in_(theme_ids)).all()} if theme_ids else {}
    cit_ids = {r.citizen_id for r in responses if r.citizen_id}
    metas_map = {m.citizen_id: m for m in db.query(ResponseMetadata).filter(ResponseMetadata.citizen_id.in_(cit_ids)).all()} if cit_ids else {}
    resp_ids = {r.id for r in responses}
    followups_map = {f.parent_response_id: f for f in db.query(Response).filter(Response.parent_response_id.in_(resp_ids)).all()} if resp_ids else {}

    result = []
    for r in responses:
        q = questions_map.get(r.question_id)
        t = themes_map.get(q.theme_id) if q and q.theme_id else None
        met = metas_map.get(r.citizen_id)
        followup = followups_map.get(r.id)
        result.append({
            **response_dict(r),
            "question": question_dict(q) if q else None,
            "theme": {"id": t.id, "name": t.name, "icon": t.icon} if t else None,
            "metadata": meta_dict(met) if met else None,
            "followup_response": response_dict(followup) if followup else None,
        })
    return {"total": total, "responses": result}


@router.put("/responses/{response_id}/exclude")
def admin_exclude_response(response_id: str, admin: AdminUser = Depends(get_current_admin), db: Session = Depends(get_db)):
    r = db.query(Response).filter(Response.id == response_id).first()
    if not r:
        raise HTTPException(404, "Besvarelse ikke fundet")
    r.is_excluded = True
    db.commit()
    return {"ok": True}


@router.put("/responses/{response_id}/approve")
def admin_approve_response(response_id: str, admin: AdminUser = Depends(get_current_admin), db: Session = Depends(get_db)):
    r = db.query(Response).filter(Response.id == response_id).first()
    if not r:
        raise HTTPException(404, "Besvarelse ikke fundet")
    r.is_flagged = False
    db.commit()
    return {"ok": True}


@router.get("/export/csv")
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

    # Batch-load relaterede data for at undgå N+1 queries
    csv_question_ids = {r.question_id for r in responses}
    csv_questions_map = {q.id: q for q in db.query(Question).filter(Question.id.in_(csv_question_ids)).all()} if csv_question_ids else {}
    csv_theme_ids = {q.theme_id for q in csv_questions_map.values() if q.theme_id}
    csv_themes_map = {t.id: t for t in db.query(Theme).filter(Theme.id.in_(csv_theme_ids)).all()} if csv_theme_ids else {}
    csv_cit_ids = {r.citizen_id for r in responses if r.citizen_id}
    csv_metas_map = {m.citizen_id: m for m in db.query(ResponseMetadata).filter(ResponseMetadata.citizen_id.in_(csv_cit_ids)).all()} if csv_cit_ids else {}
    csv_resp_ids = {r.id for r in responses}
    csv_followups_map = {f.parent_response_id: f for f in db.query(Response).filter(Response.parent_response_id.in_(csv_resp_ids)).all()} if csv_resp_ids else {}

    for r in responses:
        q = csv_questions_map.get(r.question_id)
        t = csv_themes_map.get(q.theme_id) if q and q.theme_id else None
        met = csv_metas_map.get(r.citizen_id)
        followup = csv_followups_map.get(r.id)
        writer.writerow([
            r.id, t.name if t else "", q.body if q else "",
            r.text_content or "", r.response_type,
            "Ja" if r.is_flagged else "Nej",
            followup.followup_question_text if followup else "",
            followup.text_content if followup else "",
            r.created_at.isoformat() if r.created_at else "",
            met.age_group if met else "", met.area if met else "", met.role if met else "",
        ])

    output.seek(0)
    return StreamingResponse(
        output,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=norddjurs-besvarelser.csv"},
    )


# ─── Dashboard ────────────────────────────────────────────────────────────────

@router.get("/dashboard")
def admin_dashboard(
    forloeb_id: Optional[str] = Query(None),
    admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    frozen_ids = [c.id for c in db.query(Citizen.id).filter(Citizen.frozen == True).all()]

    def base_resp(extra_filters=()):
        q = db.query(Response).filter(
            Response.is_followup == False,
            Response.is_excluded == False,
            *extra_filters,
        )
        if forloeb_id:
            q = q.join(Question, Question.id == Response.question_id).filter(
                Question.forloeb_id == forloeb_id
            )
        if frozen_ids:
            q = q.filter(~Response.citizen_id.in_(frozen_ids))
        return q

    total_responses = base_resp().count()
    flagged_count = base_resp((Response.is_flagged == True,)).count()
    total_citizens = db.query(Citizen).count()

    themes_q = db.query(Theme).order_by(Theme.sort_order)
    if forloeb_id:
        themes_q = themes_q.filter(Theme.forloeb_id == forloeb_id)
    themes = themes_q.all()

    theme_counts_q = (
        db.query(Theme.id, func.count(Response.id))
        .join(Question, Question.theme_id == Theme.id)
        .join(Response, Response.question_id == Question.id)
        .filter(Response.is_followup == False, Response.is_excluded == False)
    )
    if forloeb_id:
        theme_counts_q = theme_counts_q.filter(Question.forloeb_id == forloeb_id)
    if frozen_ids:
        theme_counts_q = theme_counts_q.filter(~Response.citizen_id.in_(frozen_ids))
    theme_counts = dict(theme_counts_q.group_by(Theme.id).all())
    per_theme = [
        {"theme_id": t.id, "name": t.name, "icon": t.icon, "count": theme_counts.get(t.id, 0)}
        for t in themes
    ]

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


@router.get("/dashboard/sentiment")
def admin_dashboard_sentiment(
    forloeb_id: Optional[str] = Query(None),
    admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    q = (
        db.query(Response, Question, Theme)
        .join(Question, Question.id == Response.question_id)
        .join(Theme, Theme.id == Question.theme_id, isouter=True)
        .filter(Response.is_followup == False, Response.is_excluded == False)
    )
    if forloeb_id:
        q = q.filter(Question.forloeb_id == forloeb_id)
    rows = q.order_by(Theme.sort_order, Question.sort_order).all()

    forloeb_counts = {"positiv": 0, "neutral": 0, "negativ": 0, "total": 0, "analyseret": 0}
    temaer_map: dict = {}

    for resp, question, theme in rows:
        forloeb_counts["total"] += 1
        if resp.sentiment_label:
            forloeb_counts["analyseret"] += 1
            if resp.sentiment_label in forloeb_counts:
                forloeb_counts[resp.sentiment_label] += 1

        if theme:
            if theme.id not in temaer_map:
                temaer_map[theme.id] = {
                    "tema_id": theme.id, "navn": theme.name, "icon": theme.icon,
                    "positiv": 0, "neutral": 0, "negativ": 0, "total": 0, "lav_enighed": 0,
                    "_spoergsmaal": {},
                }
            t = temaer_map[theme.id]
            t["total"] += 1
            if resp.sentiment_label in ("positiv", "neutral", "negativ"):
                t[resp.sentiment_label] += 1
            if resp.sentiment_low_agreement:
                t["lav_enighed"] += 1

            if question.id not in t["_spoergsmaal"]:
                t["_spoergsmaal"][question.id] = {
                    "id": question.id, "titel": question.title,
                    "positiv": 0, "neutral": 0, "negativ": 0, "total": 0, "lav_enighed": 0,
                }
            sq = t["_spoergsmaal"][question.id]
            sq["total"] += 1
            if resp.sentiment_label in ("positiv", "neutral", "negativ"):
                sq[resp.sentiment_label] += 1
            if resp.sentiment_low_agreement:
                sq["lav_enighed"] += 1

    temaer_out = []
    for t in temaer_map.values():
        spoergsmaal = list(t.pop("_spoergsmaal").values())
        temaer_out.append({**t, "spoergsmaal": spoergsmaal})

    return {"forloeb": forloeb_counts, "temaer": temaer_out}


# ─── AI-analyse ───────────────────────────────────────────────────────────────

@router.post("/analysis")
def admin_run_analysis(data: AnalysisRequest, admin: AdminUser = Depends(get_current_admin), db: Session = Depends(get_db)):
    # Sentiment bruger gemte kolonner fra lokal BERT-analyse i stedet for Ollama
    if data.analysis_type == "sentiment":
        query = db.query(Response).filter(
            Response.is_followup == False,
            Response.is_excluded == False,
            Response.sentiment_label.isnot(None),
        )
        if data.question_id:
            query = query.filter(Response.question_id == data.question_id)
        elif data.theme_id:
            q_ids = [q.id for q in db.query(Question.id).filter(Question.theme_id == data.theme_id).all()]
            query = query.filter(Response.question_id.in_(q_ids))
        rows = query.all()
        counts = {"positiv": 0, "neutral": 0, "negativ": 0}
        for r in rows:
            if r.sentiment_label in counts:
                counts[r.sentiment_label] += 1
        return {"analysis_type": "sentiment", "result": counts, "response_count": len(rows)}

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

    try:
        result = generate_analysis(texts, data.analysis_type)
    except Exception as e:
        raise HTTPException(500, f"AI-analyse fejlede: {e}")
    if not result:
        raise HTTPException(500, "AI returnerede tomt resultat")

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


# ─── AI-indstillinger ─────────────────────────────────────────────────────────

@router.get("/ai-settings")
def admin_get_ai_settings(admin: AdminUser = Depends(get_current_admin), db: Session = Depends(get_db)):
    settings = db.query(AISettings).filter(AISettings.id == "default").first()
    if not settings:
        return {"system_prompt": "", "perspective_threshold": 30}
    return {"system_prompt": settings.system_prompt, "perspective_threshold": settings.perspective_threshold}


@router.put("/ai-settings")
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


# ─── Indholdsmoderation ───────────────────────────────────────────────────────

@router.get("/moderation-rules")
def admin_get_moderation_rules(admin: AdminUser = Depends(get_current_admin), db: Session = Depends(get_db)):
    rules = db.query(ModerationRule).order_by(ModerationRule.created_at).all()
    return [rule_dict(r) for r in rules]


@router.post("/moderation-rules")
def admin_create_moderation_rule(data: ModerationRuleCreate, admin: AdminUser = Depends(get_current_admin), db: Session = Depends(get_db)):
    if not data.pattern.strip():
        raise HTTPException(400, "Mønster må ikke være tomt")
    if data.rule_type == "regex":
        try:
            re.compile(data.pattern)
        except re.error as e:
            raise HTTPException(400, f"Ugyldigt regex-mønster: {e}")
    rule = ModerationRule(
        id=str(uuid.uuid4()),
        rule_type=data.rule_type,
        pattern=data.pattern.strip(),
        description=data.description,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule_dict(rule)


@router.delete("/moderation-rules/{rule_id}")
def admin_delete_moderation_rule(rule_id: str, admin: AdminUser = Depends(get_current_admin), db: Session = Depends(get_db)):
    rule = db.query(ModerationRule).filter(ModerationRule.id == rule_id).first()
    if not rule:
        raise HTTPException(404, "Regel ikke fundet")
    db.delete(rule)
    db.commit()
    return {"ok": True}


@router.put("/moderation-rules/{rule_id}/toggle")
def admin_toggle_moderation_rule(rule_id: str, admin: AdminUser = Depends(get_current_admin), db: Session = Depends(get_db)):
    rule = db.query(ModerationRule).filter(ModerationRule.id == rule_id).first()
    if not rule:
        raise HTTPException(404, "Regel ikke fundet")
    rule.is_active = not rule.is_active
    db.commit()
    return rule_dict(rule)


# ─── Samtykke-oversigt ────────────────────────────────────────────────────────

@router.get("/consent-overview")
def admin_consent_overview(admin: AdminUser = Depends(get_current_admin), db: Session = Depends(get_db)):
    """Returnerer statistik over borgeres samtykker, fordelt på version og status."""
    total_citizens = db.query(Citizen).count()
    consent_given = db.query(Citizen).filter(Citizen.consent_given == True).count()
    consent_withdrawn = db.query(Citizen).filter(Citizen.consent_given == False).count()
    frozen_count = db.query(Citizen).filter(Citizen.frozen == True).count()

    by_version = db.query(Citizen.consent_version, func.count(Citizen.id)).filter(
        Citizen.consent_given == True
    ).group_by(Citizen.consent_version).all()

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


# ─── Borgerstyring ────────────────────────────────────────────────────────────

@router.get("/citizens")
def admin_search_citizens(
    q: Optional[str] = None,
    limit: int = 50,
    admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Søg efter borgere via email."""
    query = db.query(Citizen)
    if q:
        query = query.filter(Citizen.email.ilike(f"%{q}%"))
    citizens = query.order_by(Citizen.created_at.desc()).limit(limit).all()
    # Ét GROUP BY-query for response-count pr. borger i stedet for N queries
    cit_ids = [c.id for c in citizens]
    counts = dict(
        db.query(Response.citizen_id, func.count(Response.id))
        .filter(Response.citizen_id.in_(cit_ids), Response.is_followup == False)
        .group_by(Response.citizen_id)
        .all()
    ) if cit_ids else {}
    result = [
        {
            **citizen_dict(c),
            "response_count": counts.get(c.id, 0),
            "temp_password_expires": c.temp_password_expires.isoformat() if c.temp_password_expires else None,
        }
        for c in citizens
    ]
    return result


@router.post("/citizens/{citizen_id}/reset-password")
def admin_reset_citizen_password(
    citizen_id: str,
    admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Genererer en midlertidig adgangskode og returnerer den ÉN GANG til admin.
    Borgeren tvinges til at skifte kode ved næste login. Koden udløber efter 24 timer.
    """
    citizen = db.query(Citizen).filter(Citizen.id == citizen_id).first()
    if not citizen:
        raise HTTPException(404, "Borger ikke fundet")

    temp_pw = generate_temp_password()
    expires_at = datetime.now(timezone.utc) + timedelta(hours=TEMP_PASSWORD_EXPIRY_HOURS)

    citizen.password_hash = hash_password(temp_pw)
    citizen.must_change_password = True
    citizen.temp_password_expires = expires_at

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
        "temp_password": temp_pw,
        "expires_at": expires_at.isoformat(),
        "citizen_email": citizen.email,
    }
