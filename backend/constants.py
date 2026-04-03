"""Centrale konstanter for Stemmer fra Norddjurs backend.

Samler magiske tal og konfigurationsgrænser ét sted
så de er lette at finde og ændre.
"""

# ─── Adgangskode ───────────────────────────────────────────────────────────────
PASSWORD_MIN_LENGTH = 8
TEMP_PASSWORD_EXPIRY_HOURS = 24

# ─── Filupload ─────────────────────────────────────────────────────────────────
MAX_UPLOAD_SIZE_MB = 10

ALLOWED_AUDIO_EXTENSIONS = {".webm", ".mp3", ".wav", ".ogg", ".opus", ".mp4", ".m4a"}

ALLOWED_AUDIO_MIMETYPES = {
    "audio/webm",
    "audio/ogg",
    "audio/wav",
    "audio/wave",
    "audio/mpeg",
    "audio/mp3",
    "audio/mp4",
    "audio/m4a",
    "audio/x-m4a",
    "video/webm",           # Browsers sender ofte webm/opus som video/webm
    # application/octet-stream fjernet — for generisk og åbner for vilkårlig filupload
}

# ─── AI / analyse ──────────────────────────────────────────────────────────────
AI_ANALYSIS_SAMPLE_SIZE = 100
AI_PERSPECTIVES_SAMPLE_SIZE = 20
AI_DEFAULT_PERSPECTIVE_THRESHOLD = 30

# ─── Borgerspørgsmål ───────────────────────────────────────────────────────────
CITIZEN_QUESTION_MIN_LENGTH = 10
CITIZEN_QUESTION_MAX_LENGTH = 500

# ─── Indholdsmoderation ────────────────────────────────────────────────────────
MODERATION_REGEX_TIMEOUT_SECONDS = 0.5
