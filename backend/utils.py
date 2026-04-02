"""Delte forretningslogik-hjælpere: password-validering, moderation, temp-kodeord."""

import re
import secrets
import string
import concurrent.futures
from typing import Optional

from sqlalchemy.orm import Session
from models import ModerationRule
from constants import PASSWORD_MIN_LENGTH, MODERATION_REGEX_TIMEOUT_SECONDS


def validate_citizen_password(password: str) -> Optional[str]:
    """Returnerer fejlbesked hvis adgangskoden ikke opfylder kravene, ellers None."""
    if len(password) < PASSWORD_MIN_LENGTH:
        return f"Adgangskoden skal være mindst {PASSWORD_MIN_LENGTH} tegn"
    if not re.search(r"[A-Z]", password):
        return "Adgangskoden skal indeholde mindst ét stort bogstav (A-Z)"
    if not re.search(r"[a-z]", password):
        return "Adgangskoden skal indeholde mindst ét lille bogstav (a-z)"
    if not re.search(r"[0-9]", password):
        return "Adgangskoden skal indeholde mindst ét tal (0-9)"
    return None


def _safe_regex_match(pattern: str, text: str) -> bool:
    """Evaluér regex med timeout for at beskytte mod ReDoS (catastrophic backtracking)."""
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(re.search, pattern, text, re.IGNORECASE)
        try:
            return bool(future.result(timeout=MODERATION_REGEX_TIMEOUT_SECONDS))
        except concurrent.futures.TimeoutError:
            print(f"[Moderation] Regex timeout — mønster: {pattern[:60]!r}")
            return False


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
                if _safe_regex_match(rule.pattern, text):
                    return True
        except Exception:
            pass
    return False


def generate_temp_password() -> str:
    """Genererer en tilfældig midlertidig adgangskode (12 tegn, opfylder kravene)."""
    alphabet = string.ascii_letters + string.digits
    while True:
        pw = "".join(secrets.choice(alphabet) for _ in range(12))
        if any(c.isupper() for c in pw) and any(c.islower() for c in pw) and any(c.isdigit() for c in pw):
            return pw
