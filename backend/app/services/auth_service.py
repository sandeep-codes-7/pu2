from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from jose import jwt, JWTError
import httpx
import hashlib
import secrets
import hmac
from app.config import settings

def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 150000)
    return f"pbkdf2_sha256${salt}${dk.hex()}"

def verify_password(plain_password: str, stored_hash: str) -> bool:
    if not plain_password or not stored_hash:
        return False
    try:
        parts = stored_hash.split("$")
        if len(parts) == 3 and parts[0] == "pbkdf2_sha256":
            _, salt, expected_hex = parts
            # Support both 150000 and legacy 100000 iterations seamlessly
            dk_150 = hashlib.pbkdf2_hmac("sha256", plain_password.encode("utf-8"), salt.encode("utf-8"), 150000)
            if hmac.compare_digest(dk_150.hex(), expected_hex):
                return True
            dk_100 = hashlib.pbkdf2_hmac("sha256", plain_password.encode("utf-8"), salt.encode("utf-8"), 100000)
            return hmac.compare_digest(dk_100.hex(), expected_hex)
        return False
    except Exception:
        return False

def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire, "iat": datetime.utcnow()})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except JWTError:
        return None

async def verify_google_id_token(id_token_str: str) -> Optional[Dict[str, Any]]:
    """
    Verifies a Google ID token by checking against Google's tokeninfo endpoint.
    Enforces issuer, audience, and email verification checks.
    """
    if not id_token_str or len(id_token_str) > 4096:
        return None
    url = "https://oauth2.googleapis.com/tokeninfo"
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.get(url, params={"id_token": id_token_str})
            if resp.status_code == 200:
                data = resp.json()
                # Verify issuer
                iss = data.get("iss", "")
                if iss not in ("accounts.google.com", "https://accounts.google.com"):
                    return None
                # Verify email_verified is true
                email_verified = str(data.get("email_verified", "")).lower()
                if email_verified != "true":
                    return None
                # Verify audience matches configured GOOGLE_CLIENT_ID
                if settings.GOOGLE_CLIENT_ID and data.get("aud") != settings.GOOGLE_CLIENT_ID:
                    return None
                return data
            return None
        except Exception:
            return None

async def exchange_google_code(code: str) -> Optional[Dict[str, Any]]:
    """
    Exchanges an authorization code for an ID token / user info from Google.
    """
    if not code or len(code) > 2048:
        return None
    token_url = "https://oauth2.googleapis.com/token"
    params = {
        "code": code,
        "client_id": settings.GOOGLE_CLIENT_ID,
        "client_secret": settings.GOOGLE_CLIENT_SECRET,
        "redirect_uri": settings.GOOGLE_REDIRECT_URI,
        "grant_type": "authorization_code",
    }
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.post(token_url, data=params)
            if resp.status_code == 200:
                token_data = resp.json()
                id_token = token_data.get("id_token")
                if id_token:
                    return await verify_google_id_token(id_token)
            return None
        except Exception:
            return None
