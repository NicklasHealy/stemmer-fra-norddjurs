"""Auth: password hashing, JWT tokens, dependencies."""

from datetime import datetime, timedelta
from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session
from dotenv import load_dotenv
import os

from database import get_db
from models import Citizen, AdminUser

load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY", "")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "10080"))  # 7 dage

# Kendte usikre standardværdier der aldrig må bruges i produktion
_UNSAFE_KEYS = {
    "",
    "dev-secret-skift-mig-i-produktion",
    "skift-mig-til-en-lang-tilfældig-streng-i-produktion",
    "change-me",
    "secret",
}

if SECRET_KEY in _UNSAFE_KEYS or len(SECRET_KEY) < 32:
    import warnings
    warnings.warn(
        "\n" + "=" * 70 + "\n"
        "SIKKERHEDSADVARSEL: SECRET_KEY er ikke sat korrekt.\n"
        "Minimumskrav: 32 tegn, unik og tilfældig.\n"
        "Generér en ny nøgle med:\n"
        "  python -c \"import secrets; print(secrets.token_hex(32))\"\n"
        "Sæt den i backend/.env som SECRET_KEY=<din-nøgle>\n"
        + "=" * 70,
        stacklevel=1,
    )
    if not SECRET_KEY:
        SECRET_KEY = "unsafe-dev-fallback-DO-NOT-USE-IN-PRODUCTION-please-set-env"

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Ugyldig eller udløbet token")


# ─── Dependencies ───

async def get_current_citizen(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db),
) -> Citizen:
    """Kræver gyldig borger-token."""
    if not credentials:
        raise HTTPException(status_code=401, detail="Ikke logget ind")
    payload = decode_token(credentials.credentials)
    citizen_id = payload.get("sub")
    role = payload.get("role")
    if not citizen_id or role != "citizen":
        raise HTTPException(status_code=401, detail="Ugyldig token")
    citizen = db.query(Citizen).filter(Citizen.id == citizen_id).first()
    if not citizen:
        raise HTTPException(status_code=401, detail="Bruger ikke fundet")
    return citizen


async def get_optional_citizen(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db),
) -> Optional[Citizen]:
    """Returnerer borger hvis token er givet, ellers None."""
    if not credentials:
        return None
    try:
        payload = decode_token(credentials.credentials)
        citizen_id = payload.get("sub")
        if citizen_id and payload.get("role") == "citizen":
            return db.query(Citizen).filter(Citizen.id == citizen_id).first()
    except HTTPException:
        pass
    except Exception as e:
        print(f"[Auth] Uventet fejl i get_optional_citizen: {e}")
    return None


async def get_current_admin(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db),
) -> AdminUser:
    """Kræver gyldig admin-token."""
    if not credentials:
        raise HTTPException(status_code=401, detail="Ikke logget ind")
    payload = decode_token(credentials.credentials)
    admin_id = payload.get("sub")
    role = payload.get("role")
    if not admin_id or role != "admin":
        raise HTTPException(status_code=403, detail="Ingen admin-adgang")
    admin = db.query(AdminUser).filter(AdminUser.id == admin_id).first()
    if not admin:
        raise HTTPException(status_code=401, detail="Admin ikke fundet")
    return admin
