"""Database-seeding med startdata til Stemmer fra Norddjurs."""

import os
import uuid

from sqlalchemy.orm import Session


def seed_data(db: Session) -> None:
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
