from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func, or_
from typing import List, Optional, Dict
from datetime import datetime, timezone, timedelta
import time

from app.database import get_db
from app.models.entities import (
    User, Room, Message, Friendship, MateConversation, MateMessage, MateQueue,
    AdminAccount, Feedback, SiteUpdateLog, SiteSetting
)
from app.schemas.schemas import (
    FeedbackCreate, FeedbackOut,
    AdminLoginRequest, AdminGoogleLoginRequest, AdminOut, AdminToken,
    AdminCreateRequest, AdminUpdateSelfRequest,
    SiteUpdateCreate, SiteUpdateOut,
    MaintenanceUpdateRequest, MaintenanceStatusOut
)
from app.services.auth_service import (
    create_access_token, decode_access_token,
    verify_google_id_token, exchange_google_code,
    hash_password, verify_password
)
from app.dependencies.auth import oauth2_scheme, get_current_user_optional
from app.utils.hub import hub

router = APIRouter(prefix="/api", tags=["admin_and_feedback"])

# Brute-force & flood rate-limiting stores (IP -> list of epoch timestamps)
_ADMIN_LOGIN_ATTEMPTS: Dict[str, List[float]] = {}
_FEEDBACK_SUBMIT_ATTEMPTS: Dict[str, List[float]] = {}


def _get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _check_rate_limit(store: Dict[str, List[float]], key: str, max_attempts: int, window_seconds: int, error_msg: str):
    now = time.time()
    cutoff = now - window_seconds
    history = [ts for ts in store.get(key, []) if ts > cutoff]
    if len(history) >= max_attempts:
        store[key] = history
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=error_msg
        )
    history.append(now)
    store[key] = history


def _clear_rate_limit(store: Dict[str, List[float]], key: str):
    store.pop(key, None)


def _utc_dt(dt: Optional[datetime]) -> datetime:
    if not dt:
        return datetime.now(timezone.utc)
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


async def get_current_admin(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db)
) -> AdminAccount:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired admin credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        raise credentials_exception

    payload = decode_access_token(token)
    if not payload or payload.get("role") != "admin":
        raise credentials_exception

    admin_id: str = payload.get("sub")
    if not admin_id:
        raise credentials_exception

    res = await db.execute(select(AdminAccount).filter(AdminAccount.id == admin_id))
    admin = res.scalars().first()
    if not admin:
        raise credentials_exception

    return admin


# ─────────────────────────────────────────────────────────────────
# PUBLIC SYSTEM STATUS & USER FEEDBACK SUBMISSION
# ─────────────────────────────────────────────────────────────────
@router.get("/system/status", response_model=MaintenanceStatusOut)
async def get_system_status(db: AsyncSession = Depends(get_db)):
    res_mode = await db.execute(select(SiteSetting).filter(SiteSetting.key == "maintenance_mode"))
    mode_setting = res_mode.scalars().first()

    res_msg = await db.execute(select(SiteSetting).filter(SiteSetting.key == "maintenance_message"))
    msg_setting = res_msg.scalars().first()

    is_maint = (mode_setting.value.lower() == "true") if (mode_setting and mode_setting.value) else False
    maint_msg = (
        msg_setting.value
        if (msg_setting and msg_setting.value)
        else "PairUP is currently undergoing scheduled maintenance. Please check back shortly!"
    )
    return MaintenanceStatusOut(maintenance_mode=is_maint, maintenance_message=maint_msg)


@router.post("/feedback", response_model=FeedbackOut)
async def submit_feedback(
    payload: FeedbackCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    client_ip = _get_client_ip(request)
    _check_rate_limit(
        _FEEDBACK_SUBMIT_ATTEMPTS,
        f"fb:{client_ip}",
        max_attempts=8,
        window_seconds=600,
        error_msg="Too many feedback submissions. Please wait a few minutes before submitting again."
    )

    fb = Feedback(
        user_id=current_user.id if current_user else None,
        user_name=current_user.name if current_user else "Anonymous User",
        user_username=current_user.username if current_user else "anonymous",
        user_avatar=current_user.avatar if current_user else None,
        rating=payload.rating,
        comment=payload.comment.strip(),
        is_resolved=False
    )
    db.add(fb)
    await db.commit()
    await db.refresh(fb)
    fb.created_at = _utc_dt(fb.created_at)
    return fb


# ─────────────────────────────────────────────────────────────────
# ADMIN AUTHENTICATION (USERNAME/PASSWORD & GOOGLE OAUTH)
# ─────────────────────────────────────────────────────────────────
@router.post("/admin/login", response_model=AdminToken)
async def admin_login(payload: AdminLoginRequest, request: Request, db: AsyncSession = Depends(get_db)):
    client_ip = _get_client_ip(request)
    rate_key = f"admin_login:{client_ip}"
    _check_rate_limit(
        _ADMIN_LOGIN_ATTEMPTS,
        rate_key,
        max_attempts=6,
        window_seconds=300,
        error_msg="Too many failed login attempts. Please wait 5 minutes before trying again."
    )

    identifier = payload.username.strip().lower()
    res = await db.execute(
        select(AdminAccount).filter(
            or_(
                func.lower(AdminAccount.username) == identifier,
                func.lower(AdminAccount.email) == identifier
            )
        )
    )
    admin = res.scalars().first()
    if not admin or not admin.password_hash:
        raise HTTPException(status_code=401, detail="Invalid admin username or password")

    if not verify_password(payload.password, admin.password_hash):
        raise HTTPException(status_code=401, detail="Invalid admin username or password")

    _clear_rate_limit(_ADMIN_LOGIN_ATTEMPTS, rate_key)

    token = create_access_token(
        {"sub": admin.id, "role": "admin", "username": admin.username},
        expires_delta=timedelta(hours=24)
    )
    admin.created_at = _utc_dt(admin.created_at)
    return AdminToken(access_token=token, admin=admin)


@router.post("/admin/google", response_model=AdminToken)
async def admin_google_login(payload: AdminGoogleLoginRequest, request: Request, db: AsyncSession = Depends(get_db)):
    client_ip = _get_client_ip(request)
    rate_key = f"admin_google:{client_ip}"
    _check_rate_limit(
        _ADMIN_LOGIN_ATTEMPTS,
        rate_key,
        max_attempts=10,
        window_seconds=300,
        error_msg="Too many login attempts. Please wait 5 minutes before trying again."
    )

    google_user_info = None
    if payload.credential:
        google_user_info = await verify_google_id_token(payload.credential)
    elif payload.code:
        google_user_info = await exchange_google_code(payload.code)

    if not google_user_info or "email" not in google_user_info:
        raise HTTPException(status_code=400, detail="Invalid or expired Google authentication credentials")

    email = google_user_info.get("email", "").strip().lower()
    name = google_user_info.get("name") or email.split("@")[0].lower()

    # Match admin strictly by verified email address (never by email prefix alone to prevent account hijacking)
    res = await db.execute(
        select(AdminAccount).filter(
            func.lower(AdminAccount.email) == email
        )
    )
    admin = res.scalars().first()
    if not admin:
        raise HTTPException(
            status_code=403,
            detail=f"Access denied: '{email}' is not linked to any administrator account. Sign in with username/password first or ask the Prime Admin to link your Google email."
        )

    _clear_rate_limit(_ADMIN_LOGIN_ATTEMPTS, rate_key)

    # Link email/name if not yet populated
    updated = False
    if not admin.email:
        admin.email = email
        updated = True
    if not admin.name and name:
        admin.name = name
        updated = True
    if updated:
        await db.commit()
        await db.refresh(admin)

    token = create_access_token(
        {"sub": admin.id, "role": "admin", "username": admin.username},
        expires_delta=timedelta(hours=24)
    )
    admin.created_at = _utc_dt(admin.created_at)
    return AdminToken(access_token=token, admin=admin)


@router.get("/admin/me", response_model=AdminOut)
async def get_admin_me(current_admin: AdminAccount = Depends(get_current_admin)):
    current_admin.created_at = _utc_dt(current_admin.created_at)
    return current_admin


@router.put("/admin/me", response_model=AdminOut)
async def update_admin_self(
    payload: AdminUpdateSelfRequest,
    db: AsyncSession = Depends(get_db),
    current_admin: AdminAccount = Depends(get_current_admin)
):
    if payload.email is not None:
        clean_email = payload.email.strip().lower() if payload.email.strip() else None
        if clean_email:
            res_dup = await db.execute(
                select(AdminAccount).filter(
                    func.lower(AdminAccount.email) == clean_email,
                    AdminAccount.id != current_admin.id
                )
            )
            if res_dup.scalars().first():
                raise HTTPException(status_code=400, detail="Email is already linked to another admin")
        current_admin.email = clean_email

    if payload.name is not None and payload.name.strip():
        current_admin.name = payload.name.strip()

    if payload.password is not None and payload.password.strip():
        if len(payload.password.strip()) < 6:
            raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
        current_admin.password_hash = hash_password(payload.password.strip())

    await db.commit()
    await db.refresh(current_admin)
    current_admin.created_at = _utc_dt(current_admin.created_at)
    return current_admin


# ─────────────────────────────────────────────────────────────────
# ANALYTICS DASHBOARD
# ─────────────────────────────────────────────────────────────────
@router.get("/admin/analytics")
async def get_admin_analytics(
    db: AsyncSession = Depends(get_db),
    current_admin: AdminAccount = Depends(get_current_admin)
):
    total_users = (await db.execute(select(func.count(User.id)))).scalar() or 0
    google_users = (await db.execute(select(func.count(User.id)).filter(User.provider == "google"))).scalar() or 0
    demo_users = (await db.execute(select(func.count(User.id)).filter(User.provider == "demo"))).scalar() or 0
    online_users_count = len(hub.get_online_user_ids())

    total_rooms = (await db.execute(select(func.count(Room.id)))).scalar() or 0
    private_rooms = (await db.execute(select(func.count(Room.id)).filter(Room.is_private == True))).scalar() or 0
    public_rooms = total_rooms - private_rooms

    total_messages = (await db.execute(select(func.count(Message.id)))).scalar() or 0
    room_messages = (await db.execute(select(func.count(Message.id)).filter(Message.room_id.isnot(None)))).scalar() or 0
    direct_messages = (await db.execute(select(func.count(Message.id)).filter(Message.recipient_id.isnot(None)))).scalar() or 0
    mate_messages = (await db.execute(select(func.count(MateMessage.id)))).scalar() or 0

    accepted_friendships = (await db.execute(select(func.count(Friendship.id)).filter(Friendship.status == "accepted"))).scalar() or 0
    pending_friendships = (await db.execute(select(func.count(Friendship.id)).filter(Friendship.status == "pending"))).scalar() or 0

    active_mate_chats = (await db.execute(select(func.count(MateConversation.id)).filter(MateConversation.status == "active"))).scalar() or 0
    mate_queue_count = (await db.execute(select(func.count(MateQueue.id)))).scalar() or 0

    # Feedback stats
    total_feedbacks = (await db.execute(select(func.count(Feedback.id)))).scalar() or 0
    unresolved_feedbacks = (await db.execute(select(func.count(Feedback.id)).filter(Feedback.is_resolved == False))).scalar() or 0
    avg_rating_raw = (await db.execute(select(func.avg(Feedback.rating)))).scalar()
    avg_rating = round(float(avg_rating_raw), 2) if avg_rating_raw is not None else 0.0

    rating_distribution = {str(star): 0 for star in range(1, 6)}
    res_dist = await db.execute(select(Feedback.rating, func.count(Feedback.id)).group_by(Feedback.rating))
    for star_val, cnt in res_dist.all():
        if star_val in range(1, 6):
            rating_distribution[str(star_val)] = cnt

    # Recent users
    res_recent_users = await db.execute(select(User).order_by(User.created_at.desc()).limit(8))
    recent_users = [
        {
            "id": u.id,
            "name": u.name,
            "username": u.username,
            "avatar": u.avatar,
            "provider": u.provider,
            "gender": u.gender,
            "is_online": u.id in hub.get_online_user_ids(),
            "created_at": _utc_dt(u.created_at).isoformat()
        }
        for u in res_recent_users.scalars().all()
    ]

    # Rooms list with message counts
    res_rooms = await db.execute(select(Room).order_by(Room.created_at.desc()).limit(10))
    rooms_summary = []
    for r in res_rooms.scalars().all():
        msg_cnt = (await db.execute(select(func.count(Message.id)).filter(Message.room_id == r.id))).scalar() or 0
        rooms_summary.append({
            "id": r.id,
            "slug": r.slug,
            "title": r.title,
            "is_private": bool(r.is_private),
            "online_count": hub.get_room_online_count(r.slug),
            "messages_count": msg_cnt,
            "created_at": _utc_dt(r.created_at).isoformat()
        })

    return {
        "users": {
            "total": total_users,
            "google": google_users,
            "guest": demo_users,
            "online": online_users_count
        },
        "rooms": {
            "total": total_rooms,
            "public": public_rooms,
            "private": private_rooms
        },
        "messages": {
            "total": total_messages + mate_messages,
            "room": room_messages,
            "direct": direct_messages,
            "mate": mate_messages
        },
        "social": {
            "friends_accepted": accepted_friendships,
            "friends_pending": pending_friendships,
            "active_mate_chats": active_mate_chats,
            "mate_queue": mate_queue_count
        },
        "feedbacks": {
            "total": total_feedbacks,
            "unresolved": unresolved_feedbacks,
            "average_rating": avg_rating,
            "distribution": rating_distribution
        },
        "recent_users": recent_users,
        "rooms_summary": rooms_summary
    }


# ─────────────────────────────────────────────────────────────────
# SITE UPDATES / CHANGELOG TRACKER
# ─────────────────────────────────────────────────────────────────
@router.get("/admin/updates", response_model=List[SiteUpdateOut])
async def list_site_updates(
    db: AsyncSession = Depends(get_db),
    current_admin: AdminAccount = Depends(get_current_admin)
):
    res = await db.execute(select(SiteUpdateLog).order_by(SiteUpdateLog.created_at.desc()))
    items = res.scalars().all()
    for item in items:
        item.created_at = _utc_dt(item.created_at)
    return items


@router.post("/admin/updates", response_model=SiteUpdateOut)
async def create_site_update(
    payload: SiteUpdateCreate,
    db: AsyncSession = Depends(get_db),
    current_admin: AdminAccount = Depends(get_current_admin)
):
    log = SiteUpdateLog(
        version=(payload.version or "v2.5").strip(),
        title=payload.title.strip(),
        category=(payload.category or "Feature").strip(),
        description=payload.description.strip(),
        author_username=current_admin.username
    )
    db.add(log)
    await db.commit()
    await db.refresh(log)
    log.created_at = _utc_dt(log.created_at)
    return log


@router.delete("/admin/updates/{update_id}")
async def delete_site_update(
    update_id: str,
    db: AsyncSession = Depends(get_db),
    current_admin: AdminAccount = Depends(get_current_admin)
):
    res = await db.execute(select(SiteUpdateLog).filter(SiteUpdateLog.id == update_id))
    log = res.scalars().first()
    if not log:
        raise HTTPException(status_code=404, detail="Update log entry not found")
    await db.delete(log)
    await db.commit()
    return {"status": "deleted", "id": update_id}


# ─────────────────────────────────────────────────────────────────
# ADMIN MANAGEMENT (PRIME ADMIN CAN ADD / REMOVE ADMINS)
# ─────────────────────────────────────────────────────────────────
@router.get("/admin/admins", response_model=List[AdminOut])
async def list_admins(
    db: AsyncSession = Depends(get_db),
    current_admin: AdminAccount = Depends(get_current_admin)
):
    res = await db.execute(select(AdminAccount).order_by(AdminAccount.is_prime.desc(), AdminAccount.created_at.asc()))
    admins = res.scalars().all()
    for a in admins:
        a.created_at = _utc_dt(a.created_at)
    return admins


@router.post("/admin/admins", response_model=AdminOut)
async def add_admin(
    payload: AdminCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_admin: AdminAccount = Depends(get_current_admin)
):
    if not current_admin.is_prime:
        raise HTTPException(status_code=403, detail="Only the Prime Admin can add new administrators")

    clean_username = payload.username.strip().lower()
    clean_email = payload.email.strip().lower() if (payload.email and payload.email.strip()) else None

    if not payload.password and not clean_email:
        raise HTTPException(
            status_code=400,
            detail="Please provide a password (for username login) or a Google email (for Google OAuth login), or both."
        )

    res_existing = await db.execute(
        select(AdminAccount).filter(func.lower(AdminAccount.username) == clean_username)
    )
    if res_existing.scalars().first():
        raise HTTPException(status_code=400, detail=f"Admin with username '{clean_username}' already exists")

    if clean_email:
        res_email = await db.execute(
            select(AdminAccount).filter(func.lower(AdminAccount.email) == clean_email)
        )
        if res_email.scalars().first():
            raise HTTPException(status_code=400, detail=f"Admin with email '{clean_email}' already exists")

    pw_hash = hash_password(payload.password.strip()) if (payload.password and payload.password.strip()) else None

    new_admin = AdminAccount(
        username=clean_username,
        email=clean_email,
        name=payload.name.strip() if (payload.name and payload.name.strip()) else clean_username.title(),
        password_hash=pw_hash,
        is_prime=False,
        added_by=current_admin.username
    )
    db.add(new_admin)
    await db.commit()
    await db.refresh(new_admin)
    new_admin.created_at = _utc_dt(new_admin.created_at)
    return new_admin


@router.delete("/admin/admins/{admin_id}")
async def remove_admin(
    admin_id: str,
    db: AsyncSession = Depends(get_db),
    current_admin: AdminAccount = Depends(get_current_admin)
):
    if not current_admin.is_prime:
        raise HTTPException(status_code=403, detail="Only the Prime Admin can remove administrators")

    res = await db.execute(select(AdminAccount).filter(AdminAccount.id == admin_id))
    target = res.scalars().first()
    if not target:
        raise HTTPException(status_code=404, detail="Admin account not found")

    if target.is_prime or target.username.lower() == "sandeep":
        raise HTTPException(status_code=400, detail="Cannot remove the Prime Admin")

    await db.delete(target)
    await db.commit()
    return {"status": "removed", "id": admin_id, "username": target.username}


# ─────────────────────────────────────────────────────────────────
# MAINTENANCE SWITCH
# ─────────────────────────────────────────────────────────────────
@router.get("/admin/maintenance", response_model=MaintenanceStatusOut)
async def get_maintenance_admin(
    db: AsyncSession = Depends(get_db),
    current_admin: AdminAccount = Depends(get_current_admin)
):
    return await get_system_status(db)


@router.put("/admin/maintenance", response_model=MaintenanceStatusOut)
async def update_maintenance_status(
    payload: MaintenanceUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_admin: AdminAccount = Depends(get_current_admin)
):
    res_mode = await db.execute(select(SiteSetting).filter(SiteSetting.key == "maintenance_mode"))
    mode_setting = res_mode.scalars().first()
    if not mode_setting:
        mode_setting = SiteSetting(key="maintenance_mode", value="true" if payload.maintenance_mode else "false")
        db.add(mode_setting)
    else:
        mode_setting.value = "true" if payload.maintenance_mode else "false"

    res_msg = await db.execute(select(SiteSetting).filter(SiteSetting.key == "maintenance_message"))
    msg_setting = res_msg.scalars().first()
    if payload.maintenance_message is not None:
        clean_msg = payload.maintenance_message.strip() or "PairUP is currently undergoing scheduled maintenance. Please check back shortly!"
        if not msg_setting:
            msg_setting = SiteSetting(key="maintenance_message", value=clean_msg)
            db.add(msg_setting)
        else:
            msg_setting.value = clean_msg

    await db.commit()

    status_out = await get_system_status(db)

    # Broadcast real-time maintenance status update to all connected clients
    await hub.broadcast_global({
        "type": "maintenance_status",
        "maintenance_mode": status_out.maintenance_mode,
        "maintenance_message": status_out.maintenance_message
    })

    return status_out


# ─────────────────────────────────────────────────────────────────
# FEEDBACKS MANAGEMENT
# ─────────────────────────────────────────────────────────────────
@router.get("/admin/feedbacks", response_model=List[FeedbackOut])
async def list_feedbacks(
    db: AsyncSession = Depends(get_db),
    current_admin: AdminAccount = Depends(get_current_admin)
):
    res = await db.execute(select(Feedback).order_by(Feedback.created_at.desc()))
    items = res.scalars().all()
    for f in items:
        f.created_at = _utc_dt(f.created_at)
    return items


@router.patch("/admin/feedbacks/{feedback_id}/resolve", response_model=FeedbackOut)
async def toggle_resolve_feedback(
    feedback_id: str,
    db: AsyncSession = Depends(get_db),
    current_admin: AdminAccount = Depends(get_current_admin)
):
    res = await db.execute(select(Feedback).filter(Feedback.id == feedback_id))
    fb = res.scalars().first()
    if not fb:
        raise HTTPException(status_code=404, detail="Feedback not found")

    fb.is_resolved = not bool(fb.is_resolved)
    await db.commit()
    await db.refresh(fb)
    fb.created_at = _utc_dt(fb.created_at)
    return fb


@router.delete("/admin/feedbacks/{feedback_id}")
async def delete_feedback(
    feedback_id: str,
    db: AsyncSession = Depends(get_db),
    current_admin: AdminAccount = Depends(get_current_admin)
):
    res = await db.execute(select(Feedback).filter(Feedback.id == feedback_id))
    fb = res.scalars().first()
    if not fb:
        raise HTTPException(status_code=404, detail="Feedback not found")

    await db.delete(fb)
    await db.commit()
    return {"status": "deleted", "id": feedback_id}

