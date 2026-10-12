from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from jose import jwt, JWTError
import httpx
from app.config import settings

def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
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
    Production-safe, handles token verification without external heavy libs.
    """
    url = f"https://oauth2.googleapis.com/tokeninfo?id_token={id_token_str}"
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.get(url)
            if resp.status_code == 200:
                data = resp.json()
                # If GOOGLE_CLIENT_ID is set, verify audience
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
