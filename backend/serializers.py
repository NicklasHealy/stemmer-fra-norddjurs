"""Serializer-funktioner: konverterer ORM-objekter til dict for API-responses.

Samlet ét sted så alle routers bruger samme output-format.
"""

from sqlalchemy.orm import Session
from models import (
    Citizen, Theme, Question, Forloeb, Response,
    ResponseMetadata, ModerationRule,
)

# ─── Samtykke-version ─────────────────────────────────────────────────────────
# Bump denne ved ændring af samtykkebetingelser — borgere med lavere version
# bedes re-acceptere næste gang de logger ind.
CURRENT_CONSENT_VERSION = 1

# ─── Privatlivspolitik ────────────────────────────────────────────────────────
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


# ─── Serializer-funktioner ────────────────────────────────────────────────────

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
