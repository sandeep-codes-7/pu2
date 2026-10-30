from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.database import get_db
from app.models.entities import User
from app.services.auth_service import decode_access_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token", auto_error=False)

async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db)
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        raise credentials_exception

    payload = decode_access_token(token)
    if payload is None or payload.get("role") == "admin":
        raise credentials_exception
    
    user_id: str = payload.get("sub")
    if user_id is None:
        raise credentials_exception

    result = await db.execute(select(User).filter(User.id == user_id))
    user = result.scalars().first()
    if user is None:
        raise credentials_exception

    return user

async def get_user_from_token_string(token: str, db: AsyncSession) -> User | None:
    """Helper for WebSocket auth via query string or header."""
    if not token:
        return None
    payload = decode_access_token(token)
    if not payload or payload.get("role") == "admin":
        return None
    user_id = payload.get("sub")
    if not user_id:
        return None
    result = await db.execute(select(User).filter(User.id == user_id))
    return result.scalars().first()

async def get_current_user_optional(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db)
) -> User | None:
    """Optional user dependency that returns None instead of raising 401 when unauthenticated."""
    if not token:
        return None
    payload = decode_access_token(token)
    if not payload or payload.get("role") == "admin":
        return None
    user_id = payload.get("sub")
    if not user_id:
        return None
    result = await db.execute(select(User).filter(User.id == user_id))
    return result.scalars().first()

async def get_authenticated_user(
    current_user: User = Depends(get_current_user)
) -> User:
    """Enforces that the user is a fully authenticated user and not an Instant Pass guest."""
    if current_user.provider == "demo":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You should login to use these features."
        )
    return current_user

