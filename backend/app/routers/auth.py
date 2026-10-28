from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
import re
import uuid

from app.database import get_db
from app.models.entities import User
from app.schemas.schemas import GoogleAuthRequest, DemoLoginRequest, Token, UserOut
from app.services.auth_service import verify_google_id_token, exchange_google_code, create_access_token
from app.dependencies.auth import get_current_user
from app.config import settings

router = APIRouter(prefix="/api/auth", tags=["auth"])

@router.get("/config")
def get_auth_config():
    """Returns Google Client ID so frontend can configure Google Sign-In button dynamically."""
    return {
        "google_client_id": settings.GOOGLE_CLIENT_ID,
        "is_google_configured": bool(settings.GOOGLE_CLIENT_ID)
    }

@router.post("/google", response_model=Token)
async def google_auth(payload: GoogleAuthRequest, db: AsyncSession = Depends(get_db)):
    """Handles Google OAuth: verifies ID Token or exchanges Authorization Code."""
    google_user_info = None

    if payload.credential:
        google_user_info = await verify_google_id_token(payload.credential)
    elif payload.code:
        google_user_info = await exchange_google_code(payload.code)

    if not google_user_info or "email" not in google_user_info:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired Google authentication credentials"
        )

    email = google_user_info.get("email").lower()
    name = google_user_info.get("name") or email.split("@")[0]
    picture = google_user_info.get("picture")

    # Look up user or create
    res = await db.execute(select(User).filter(User.email == email))
    user = res.scalars().first()

    if not user:
        base_username = re.sub(r"[^a-zA-Z0-9_]", "", email.split("@")[0])[:15]
        if len(base_username) < 3:
            base_username = f"user_{base_username}"
        
        # Check uniqueness
        username = base_username
        res_u = await db.execute(select(User).filter(User.username == username))
        if res_u.scalars().first():
            username = f"{base_username}_{str(uuid.uuid4())[:4]}"

        user = User(
            email=email,
            name=name,
            username=username,
            avatar=picture,
            provider="google"
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
    else:
        # Only populate avatar or name if they are not already set.
        # This prevents Google OAuth from wiping out the user's customized display name or custom uploaded avatar.
        updated = False
        if not user.avatar and picture:
            user.avatar = picture
            updated = True
        if not user.name and name:
            user.name = name
            updated = True
        if updated:
            await db.commit()
            await db.refresh(user)

    token = create_access_token({"sub": user.id, "email": user.email})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": user
    }

@router.post("/demo-login", response_model=Token)
async def demo_login(payload: DemoLoginRequest, db: AsyncSession = Depends(get_db)):
    """Instant Pass login allows temporary access for testing."""
    clean_username = re.sub(r"[^a-zA-Z0-9_]", "", payload.username.lower())
    if len(clean_username) < 3:
        raise HTTPException(status_code=400, detail="Username must be at least 3 characters alphanumeric/underscore")

    # Check if user with clean_username already exists
    res_existing = await db.execute(select(User).filter(User.username == clean_username))
    existing_user = res_existing.scalars().first()

    if existing_user and existing_user.provider == "demo":
        user = existing_user
    else:
        if existing_user:
            clean_username = f"{clean_username[:10]}_{str(uuid.uuid4())[:4]}"

        email = f"{clean_username}_{str(uuid.uuid4())[:8]}@guest.pairup"
        name = payload.name or clean_username.title()
        gender = payload.gender or "Prefer not to say"

        avatar = f"https://api.dicebear.com/7.x/bottts/svg?seed={clean_username}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf"
        user = User(
            email=email,
            name=name,
            username=clean_username,
            avatar=avatar,
            gender=gender,
            provider="demo"
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

    token = create_access_token({"sub": user.id, "email": user.email})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": user
    }

@router.post("/logout")
async def logout(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """
    If the user came in with Instant Pass (provider=='demo'),
    all their data (messages, account) is wiped out upon leaving.
    """
    if current_user.provider == "demo":
        await db.delete(current_user)
        await db.commit()
        return {"status": "guest_purged", "message": "Instant Pass session and data removed"}
    return {"status": "ok", "message": "Logged out successfully"}

@router.get("/me", response_model=UserOut)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user
