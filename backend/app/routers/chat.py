from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Request
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import or_, and_, delete, func
from typing import List, Optional
from datetime import datetime, timezone
import re
import os
import uuid
import shutil
import secrets
from pathlib import Path

from app.database import get_db
from app.models.entities import User, Room, Message, Friendship, RoomModerator, RoomMember, RoomAdmission
from app.schemas.schemas import (
    RoomCreate, RoomOut, RoomUpdate, UserOut, MessageOut,
    FriendRequestCreate, FriendRequestRespond, FriendRequestOut,
    UserProfileDetails, UserUpdate, ModeratorOut,
    AddModeratorPayload, RemoveModeratorPayload,
    AddRoomMemberPayload, RemoveRoomMemberPayload,
    RoomAdmissionOut, RespondAdmissionPayload, JoinRoomPayload,
    NotificationItem, NotificationListOut
)
from app.dependencies.auth import get_current_user, get_current_user_optional
from app.config import settings
from app.utils.hub import hub

router = APIRouter(prefix="/api", tags=["chat_rest"])

# Upload directories
UPLOADS_DIR = Path(settings.UPLOAD_DIR)
AVATAR_DIR = UPLOADS_DIR / "avatars"
ROOM_IMG_DIR = UPLOADS_DIR / "rooms"
AVATAR_DIR.mkdir(parents=True, exist_ok=True)
ROOM_IMG_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB
SAFE_FILENAME_RE = re.compile(r"^[a-zA-Z0-9._-]+$")


def _detect_image_extension(data: bytes) -> Optional[str]:
    """Validates image file magic bytes (JPEG, PNG, GIF, WebP) and returns canonical extension."""
    if not data or len(data) < 12:
        return None
    if data.startswith(b"\xff\xd8\xff"):
        return "jpg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if data.startswith((b"GIF87a", b"GIF89a")):
        return "gif"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    return None


def _is_safe_image_url(url_val: str) -> bool:
    """Ensures avatar/room picture URLs only use safe schemes (https://, http://, or local /api/uploads/)."""
    val = (url_val or "").strip()
    if not val:
        return True
    if val.startswith("/api/uploads/"):
        return ".." not in val and "\\" not in val
    if val.startswith(("https://", "http://")):
        return len(val) <= 500
    return False


def _moderator_out(mod: RoomModerator) -> ModeratorOut:
    user = getattr(mod, "user", None)
    return ModeratorOut(
        user_id=mod.user_id,
        username=user.username if user else "",
        name=user.name if user else "",
        avatar=user.avatar if user else None,
        is_prime=bool(getattr(mod, "is_prime", False))
    )


async def _get_room_with_moderators(db: AsyncSession, slug: str) -> Optional[Room]:
    res = await db.execute(select(Room).filter(Room.slug == slug.lower()))
    return res.scalars().first()


async def _is_moderator(db: AsyncSession, room_id: str, user_id: str) -> bool:
    try:
        res = await db.execute(
            select(RoomModerator).filter(
                RoomModerator.room_id == room_id,
                RoomModerator.user_id == user_id
            )
        )
        return res.scalars().first() is not None
    except Exception:
        return False


async def _is_prime_moderator(db: AsyncSession, room_id: str, user_id: str) -> bool:
    try:
        res = await db.execute(
            select(RoomModerator).filter(
                RoomModerator.room_id == room_id,
                RoomModerator.user_id == user_id,
                RoomModerator.is_prime == True
            )
        )
        return res.scalars().first() is not None
    except Exception:
        return False


async def _build_room_out(room: Room, db: AsyncSession, current_user_id: Optional[str] = None) -> RoomOut:
    moderator_list = []
    is_mod = False
    try:
        res_mods = await db.execute(select(RoomModerator).filter(RoomModerator.room_id == room.id))
        mods = res_mods.scalars().all()
        for m in mods:
            # Eager load user
            res_u = await db.execute(select(User).filter(User.id == m.user_id))
            m.user = res_u.scalars().first()
            moderator_list.append(_moderator_out(m))
            if current_user_id and m.user_id == current_user_id:
                is_mod = True
    except Exception as e:
        print(f"[WARN] Failed to load moderators for room {getattr(room, 'slug', '')}: {e}")

    # Count pending admissions for moderators
    pending_count = 0
    is_private_room = bool(getattr(room, "is_private", False))
    if is_mod and is_private_room:
        try:
            res_adm = await db.execute(
                select(func.count(RoomAdmission.id)).filter(
                    RoomAdmission.room_id == room.id,
                    RoomAdmission.status == "pending"
                )
            )
            pending_count = res_adm.scalar() or 0
        except Exception:
            pending_count = 0

    # Check membership (participant if creator, moderator, or joined RoomMember)
    is_member = False
    if current_user_id:
        if (getattr(room, "creator_id", None) == current_user_id) or is_mod:
            is_member = True
        else:
            try:
                res_mem = await db.execute(
                    select(RoomMember).filter(
                        RoomMember.room_id == room.id,
                        RoomMember.user_id == current_user_id
                    )
                )
                is_member = res_mem.scalars().first() is not None
            except Exception:
                is_member = False

    # Auto-generate invite_code for private room if missing
    invite_code = getattr(room, "invite_code", None)
    if is_private_room and not invite_code:
        try:
            room.invite_code = secrets.token_urlsafe(8)
            await db.commit()
            invite_code = room.invite_code
        except Exception:
            pass

    last_message_text = None
    last_message_at = None
    last_message_sender_name = None
    last_message_sender_id = None
    if is_member or is_mod or not is_private_room:
        try:
            res_last = await db.execute(
                select(Message, User.name)
                .outerjoin(User, Message.sender_id == User.id)
                .filter(Message.room_id == room.id)
                .order_by(Message.created_at.desc())
                .limit(1)
            )
            last_row = res_last.first()
            if last_row:
                msg_obj, sender_name = last_row
                last_message_text = msg_obj.content
                raw_dt = msg_obj.created_at
                if raw_dt and raw_dt.tzinfo is None:
                    raw_dt = raw_dt.replace(tzinfo=timezone.utc)
                last_message_at = raw_dt
                last_message_sender_name = sender_name
                last_message_sender_id = msg_obj.sender_id
        except Exception:
            pass

    room_created = getattr(room, "created_at", None) or datetime.utcnow()
    if room_created and room_created.tzinfo is None:
        room_created = room_created.replace(tzinfo=timezone.utc)

    return RoomOut(
        id=str(room.id),
        slug=room.slug,
        title=room.title,
        description=getattr(room, "description", None),
        picture=getattr(room, "picture", None),
        creator_id=getattr(room, "creator_id", None),
        is_private=is_private_room,
        invite_code=invite_code if (is_member or is_mod) else None,
        online_count=len(hub.get_room_user_ids(room.slug)),
        created_at=room_created,
        moderators=moderator_list,
        is_member=is_member,
        pending_admissions_count=pending_count,
        last_message=last_message_text,
        last_message_at=last_message_at,
        last_message_sender_name=last_message_sender_name,
        last_message_sender_id=last_message_sender_id
    )


# ─────────────────────────────────────────────────────────────────
# UPLOAD: User Avatar
# ─────────────────────────────────────────────────────────────────
@router.post("/upload/avatar")
async def upload_avatar(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, GIF, or WebP images are allowed")

    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File too large. Maximum size is 5 MB")

    ext = _detect_image_extension(contents)
    if not ext:
        raise HTTPException(status_code=400, detail="Invalid or corrupted image file")

    filename = f"{current_user.id}.{ext}"
    dest = (AVATAR_DIR / filename).resolve()
    if not str(dest).startswith(str(AVATAR_DIR.resolve())):
        raise HTTPException(status_code=400, detail="Invalid file destination")

    with open(dest, "wb") as f:
        f.write(contents)

    avatar_url = f"/api/uploads/avatars/{filename}"
    current_user.avatar = avatar_url
    await db.commit()
    await db.refresh(current_user)
    return {"avatar_url": avatar_url, "user": UserOut.from_orm(current_user)}


# ─────────────────────────────────────────────────────────────────
# UPLOAD: Room Picture (moderators only)
# ─────────────────────────────────────────────────────────────────
@router.post("/upload/room/{slug}/picture")
async def upload_room_picture(
    slug: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    room = await _get_room_with_moderators(db, slug)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    if not await _is_moderator(db, room.id, current_user.id):
        raise HTTPException(status_code=403, detail="Only moderators can change the room picture")

    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, GIF, or WebP images are allowed")

    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File too large. Maximum size is 5 MB")

    ext = _detect_image_extension(contents)
    if not ext:
        raise HTTPException(status_code=400, detail="Invalid or corrupted image file")

    filename = f"{room.id}.{ext}"
    dest = (ROOM_IMG_DIR / filename).resolve()
    if not str(dest).startswith(str(ROOM_IMG_DIR.resolve())):
        raise HTTPException(status_code=400, detail="Invalid file destination")

    with open(dest, "wb") as f:
        f.write(contents)

    picture_url = f"/api/uploads/rooms/{filename}"
    room.picture = picture_url
    await db.commit()
    return {"picture_url": picture_url}


# ─────────────────────────────────────────────────────────────────
# SERVE UPLOADED FILES
# ─────────────────────────────────────────────────────────────────
@router.get("/uploads/avatars/{filename}")
async def serve_avatar(filename: str):
    if not SAFE_FILENAME_RE.match(filename) or ".." in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    base_dir = AVATAR_DIR.resolve()
    path = (AVATAR_DIR / filename).resolve()
    if not str(path).startswith(str(base_dir)) or not path.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(str(path), headers={"X-Content-Type-Options": "nosniff"})


@router.get("/uploads/rooms/{filename}")
async def serve_room_image(filename: str):
    if not SAFE_FILENAME_RE.match(filename) or ".." in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    base_dir = ROOM_IMG_DIR.resolve()
    path = (ROOM_IMG_DIR / filename).resolve()
    if not str(path).startswith(str(base_dir)) or not path.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(str(path), headers={"X-Content-Type-Options": "nosniff"})


# ─────────────────────────────────────────────────────────────────
# ROOMS
# ─────────────────────────────────────────────────────────────────
@router.get("/rooms", response_model=List[RoomOut])
async def list_rooms(
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """
    Optimized O(1) DB round-trip room listing using batch hash-map joins
    instead of N+1 per-room queries.
    """
    try:
        res = await db.execute(select(Room).order_by(Room.created_at.asc()))
        rooms = res.scalars().all()
    except Exception as e:
        print(f"[ERROR] Failed to query rooms: {e}")
        return []

    if not rooms:
        return []

    current_user_id = current_user.id if current_user else None
    room_ids = [r.id for r in rooms]

    # 1. Batch-fetch all moderators + users in ONE query -> hash map room_id -> list[ModeratorOut]
    mods_by_room: dict[str, list[ModeratorOut]] = {rid: [] for rid in room_ids}
    user_mod_rooms: set[str] = set()
    try:
        res_mods = await db.execute(
            select(RoomModerator, User)
            .outerjoin(User, RoomModerator.user_id == User.id)
            .filter(RoomModerator.room_id.in_(room_ids))
        )
        for m, u in res_mods.all():
            m.user = u
            mods_by_room.setdefault(m.room_id, []).append(_moderator_out(m))
            if current_user_id and m.user_id == current_user_id:
                user_mod_rooms.add(m.room_id)
    except Exception as e:
        print(f"[WARN] Batch moderator load failed: {e}")

    # 2. Batch-fetch current user's RoomMember set in ONE query -> O(1) membership lookup
    member_room_ids: set[str] = set()
    if current_user_id:
        try:
            res_mem = await db.execute(
                select(RoomMember.room_id).filter(
                    RoomMember.room_id.in_(room_ids),
                    RoomMember.user_id == current_user_id
                )
            )
            member_room_ids = {row[0] for row in res_mem.all()}
        except Exception:
            pass

    # 3. Batch-fetch pending admission counts for rooms moderated by current user -> GROUP BY
    pending_by_room: dict[str, int] = {}
    if user_mod_rooms:
        try:
            res_adm = await db.execute(
                select(RoomAdmission.room_id, func.count(RoomAdmission.id))
                .filter(
                    RoomAdmission.room_id.in_(list(user_mod_rooms)),
                    RoomAdmission.status == "pending"
                )
                .group_by(RoomAdmission.room_id)
            )
            pending_by_room = {rid: cnt for rid, cnt in res_adm.all()}
        except Exception:
            pass

    # 4. Batch-fetch latest message per room via grouped subquery -> O(1) lookup per room
    last_msg_by_room: dict[str, tuple] = {}
    try:
        latest_subq = (
            select(Message.room_id, func.max(Message.created_at).label("max_ts"))
            .filter(Message.room_id.in_(room_ids))
            .group_by(Message.room_id)
            .subquery()
        )
        res_last = await db.execute(
            select(Message.room_id, Message.content, Message.created_at, Message.sender_id, User.name)
            .join(
                latest_subq,
                and_(Message.room_id == latest_subq.c.room_id, Message.created_at == latest_subq.c.max_ts)
            )
            .outerjoin(User, Message.sender_id == User.id)
        )
        for rid, content, created_at, sender_id, sender_name in res_last.all():
            if rid not in last_msg_by_room:
                dt = created_at
                if dt and dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                last_msg_by_room[rid] = (content, dt, sender_name, sender_id)
    except Exception as e:
        print(f"[WARN] Batch last-message load failed: {e}")

    # Assemble RoomOut list in O(R)
    result: List[RoomOut] = []
    dirty_invites = False
    for room in rooms:
        is_private_room = bool(getattr(room, "is_private", False))
        is_mod = room.id in user_mod_rooms
        is_member = bool(
            current_user_id and (
                getattr(room, "creator_id", None) == current_user_id
                or is_mod
                or room.id in member_room_ids
            )
        )
        invite_code = getattr(room, "invite_code", None)
        if is_private_room and not invite_code:
            room.invite_code = secrets.token_urlsafe(8)
            invite_code = room.invite_code
            dirty_invites = True

        last_text = last_at = last_sender_name = last_sender_id = None
        if (is_member or is_mod or not is_private_room) and room.id in last_msg_by_room:
            last_text, last_at, last_sender_name, last_sender_id = last_msg_by_room[room.id]
            if last_text is not None and not last_sender_name:
                last_sender_name = "Guest User"

        room_created = getattr(room, "created_at", None) or datetime.utcnow()
        if room_created and room_created.tzinfo is None:
            room_created = room_created.replace(tzinfo=timezone.utc)

        result.append(RoomOut(
            id=str(room.id),
            slug=room.slug,
            title=room.title,
            description=getattr(room, "description", None),
            picture=getattr(room, "picture", None),
            creator_id=getattr(room, "creator_id", None),
            is_private=is_private_room,
            invite_code=invite_code if (is_member or is_mod) else None,
            online_count=len(hub.get_room_user_ids(room.slug)),
            created_at=room_created,
            moderators=mods_by_room.get(room.id, []),
            is_member=is_member,
            pending_admissions_count=pending_by_room.get(room.id, 0) if (is_mod and is_private_room) else 0,
            last_message=last_text,
            last_message_at=last_at,
            last_message_sender_name=last_sender_name,
            last_message_sender_id=last_sender_id
        ))

    if dirty_invites:
        try:
            await db.commit()
        except Exception:
            pass

    result.sort(
        key=lambda r: (
            r.last_message_at is not None,
            r.last_message_at or r.created_at or datetime.min.replace(tzinfo=timezone.utc)
        ),
        reverse=True
    )
    return result


@router.post("/rooms", response_model=RoomOut)
async def create_room(
    payload: RoomCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.provider == "demo":
        raise HTTPException(
            status_code=403,
            detail="Instant Pass users cannot create rooms. Sign in with Google and connect with more than 5 friends to create rooms."
        )

    res_fc = await db.execute(
        select(func.count(Friendship.id)).filter(
            Friendship.status == "accepted",
            or_(
                Friendship.requester_id == current_user.id,
                Friendship.addressee_id == current_user.id
            )
        )
    )
    friends_count = res_fc.scalar() or 0
    if friends_count <= 5:
        raise HTTPException(
            status_code=403,
            detail=f"You need more than 5 friends to create a room (you currently have {friends_count})."
        )

    slug = re.sub(r"[^a-zA-Z0-9_-]", "", payload.slug.lower())
    if not slug:
        raise HTTPException(status_code=400, detail="Invalid room slug")

    res = await db.execute(select(Room).filter(Room.slug == slug))
    if res.scalars().first():
        raise HTTPException(status_code=400, detail="Room with this name already exists")

    is_priv = bool(payload.is_private)
    invite_code = secrets.token_urlsafe(8) if is_priv else None

    room = Room(
        slug=slug,
        title=payload.title.strip(),
        description=payload.description.strip() if payload.description else None,
        creator_id=current_user.id,
        is_private=is_priv,
        invite_code=invite_code
    )
    db.add(room)
    await db.flush()  # flush to get room.id

    try:
        # Auto-add creator as prime moderator
        prime_mod = RoomModerator(
            room_id=room.id,
            user_id=current_user.id,
            is_prime=True
        )
        db.add(prime_mod)
    except Exception as e:
        print(f"[WARN] Failed to auto-add prime moderator: {e}")

    try:
        # Auto-add creator as room member
        room_mem = RoomMember(
            room_id=room.id,
            user_id=current_user.id,
            added_by=current_user.id
        )
        db.add(room_mem)
    except Exception as e:
        print(f"[WARN] Failed to auto-add room member: {e}")

    await db.commit()
    await db.refresh(room)

    return await _build_room_out(room, db, current_user.id)


@router.get("/rooms/{slug}", response_model=RoomOut)
async def get_room(
    slug: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    room = await _get_room_with_moderators(db, slug)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    current_user_id = current_user.id if current_user else None
    return await _build_room_out(room, db, current_user_id)


@router.put("/rooms/{slug}", response_model=RoomOut)
async def update_room(
    slug: str,
    payload: RoomUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Moderators can update room title, description, picture, and public/private visibility."""
    room = await _get_room_with_moderators(db, slug)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    if not await _is_moderator(db, room.id, current_user.id):
        raise HTTPException(status_code=403, detail="Only moderators can edit this room")

    if payload.title is not None:
        room.title = payload.title.strip()[:150]
    if payload.description is not None:
        room.description = payload.description.strip()[:1000]
    if payload.picture is not None:
        if not _is_safe_image_url(payload.picture):
            raise HTTPException(status_code=400, detail="Invalid room picture URL")
        room.picture = payload.picture.strip()
    if payload.is_private is not None:
        room.is_private = bool(payload.is_private)
        if room.is_private and not room.invite_code:
            room.invite_code = secrets.token_urlsafe(8)

    await db.commit()
    await db.refresh(room)
    return await _build_room_out(room, db, current_user.id)


@router.delete("/rooms/{slug}")
async def delete_room(
    slug: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Only the room creator or prime moderator can delete a room."""
    room = await _get_room_with_moderators(db, slug)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    is_owner = room.creator_id == current_user.id or await _is_prime_moderator(db, room.id, current_user.id)
    if not is_owner:
        raise HTTPException(status_code=403, detail="Only the room creator or prime moderator can delete this room")

    room_id, room_slug = room.id, room.slug
    # SQLite does not enforce ON DELETE CASCADE by default, so clean related rows explicitly
    for model in (RoomAdmission, RoomMember, RoomModerator, Message):
        await db.execute(delete(model).where(model.room_id == room_id))
    await db.execute(delete(Room).where(Room.id == room_id))
    await db.commit()

    await hub.broadcast_to_room(room_slug, {
        "type": "room_deleted",
        "room_slug": room_slug,
        "notice": "This room was deleted by its moderator."
    })
    return {"status": "deleted", "message": f"Room #{room_slug} has been deleted"}


# ─────────────────────────────────────────────────────────────────
# ROOM MODERATOR MANAGEMENT
# ─────────────────────────────────────────────────────────────────
@router.get("/rooms/{slug}/moderators", response_model=List[ModeratorOut])
async def list_room_moderators(slug: str, db: AsyncSession = Depends(get_db)):
    room = await _get_room_with_moderators(db, slug)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    return await _build_room_out(room, db) and (await _build_room_out(room, db)).moderators


@router.post("/rooms/{slug}/moderators/add")
async def add_moderator(
    slug: str,
    payload: AddModeratorPayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Prime moderator can add up to 4 other moderators (max 5 total)."""
    room = await _get_room_with_moderators(db, slug)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    if not await _is_prime_moderator(db, room.id, current_user.id):
        raise HTTPException(status_code=403, detail="Only the prime moderator can add other moderators")

    target = None
    if payload.user_id and payload.user_id.strip():
        res_u = await db.execute(select(User).filter(User.id == payload.user_id.strip()))
        target = res_u.scalars().first()
    elif payload.username and payload.username.strip():
        clean_user = payload.username.strip().lstrip("@")
        res_u = await db.execute(select(User).filter(User.username.ilike(clean_user)))
        target = res_u.scalars().first()
    else:
        raise HTTPException(status_code=400, detail="User ID or username must be provided")

    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    if target.id == current_user.id:
        raise HTTPException(status_code=400, detail="You are already the prime moderator")

    # Check max moderators (5 total)
    res_count = await db.execute(select(RoomModerator).filter(RoomModerator.room_id == room.id))
    current_mods = res_count.scalars().all()
    if len(current_mods) >= 5:
        raise HTTPException(status_code=400, detail="Room already has the maximum of 5 moderators")

    # Check if already a mod
    res_existing = await db.execute(
        select(RoomModerator).filter(
            RoomModerator.room_id == room.id,
            RoomModerator.user_id == target.id
        )
    )
    if res_existing.scalars().first():
        raise HTTPException(status_code=400, detail="User is already a moderator of this room")

    new_mod = RoomModerator(
        room_id=room.id,
        user_id=target.id,
        is_prime=False
    )
    db.add(new_mod)
    await db.commit()
    return {"status": "added", "message": f"{target.name} is now a moderator of #{room.slug}", "user_id": target.id}


@router.post("/rooms/{slug}/moderators/remove")
async def remove_moderator(
    slug: str,
    payload: RemoveModeratorPayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Prime moderator can remove any other moderator (cannot remove themselves)."""
    room = await _get_room_with_moderators(db, slug)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    if not await _is_prime_moderator(db, room.id, current_user.id):
        raise HTTPException(status_code=403, detail="Only the prime moderator can remove other moderators")

    if payload.user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Prime moderator cannot remove themselves")

    res_mod = await db.execute(
        select(RoomModerator).filter(
            RoomModerator.room_id == room.id,
            RoomModerator.user_id == payload.user_id,
            RoomModerator.is_prime == False
        )
    )
    mod_entry = res_mod.scalars().first()
    if not mod_entry:
        raise HTTPException(status_code=404, detail="Moderator not found in this room")

    await db.delete(mod_entry)
    await db.commit()
    return {"status": "removed", "message": "Moderator has been removed"}


# ─────────────────────────────────────────────────────────────────
# ROOM MEMBER MANAGEMENT (moderators can add/remove members)
# ─────────────────────────────────────────────────────────────────
@router.post("/rooms/{slug}/members/add")
async def add_room_member(
    slug: str,
    payload: AddRoomMemberPayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    room = await _get_room_with_moderators(db, slug)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    if not await _is_moderator(db, room.id, current_user.id):
        raise HTTPException(status_code=403, detail="Only moderators can add members to this room")

    res_u = await db.execute(select(User).filter(User.id == payload.user_id))
    target = res_u.scalars().first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    # Prevent adding demo guests
    if target.provider == "demo":
        raise HTTPException(status_code=400, detail="Cannot add temporary guest accounts as room members")

    res_existing = await db.execute(
        select(RoomMember).filter(
            RoomMember.room_id == room.id,
            RoomMember.user_id == payload.user_id
        )
    )
    if res_existing.scalars().first():
        return {"status": "already_member", "message": "User is already a member"}

    member = RoomMember(
        room_id=room.id,
        user_id=payload.user_id,
        added_by=current_user.id
    )
    db.add(member)
    await db.commit()
    return {"status": "added", "message": f"{target.name} has been added to #{room.slug}"}


@router.post("/rooms/{slug}/members/remove")
async def remove_room_member(
    slug: str,
    payload: RemoveRoomMemberPayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    room = await _get_room_with_moderators(db, slug)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    if not await _is_moderator(db, room.id, current_user.id):
        raise HTTPException(status_code=403, detail="Only moderators can remove participants from this room")

    if payload.user_id == room.creator_id:
        raise HTTPException(status_code=400, detail="Cannot remove the room creator")

    # Check if target is prime moderator
    res_mod = await db.execute(
        select(RoomModerator).filter(RoomModerator.room_id == room.id, RoomModerator.user_id == payload.user_id)
    )
    target_mod = res_mod.scalars().first()
    if target_mod and target_mod.is_prime:
        raise HTTPException(status_code=400, detail="Cannot remove the prime moderator")

    res_target = await db.execute(select(User).filter(User.id == payload.user_id))
    target_user = res_target.scalars().first()
    target_name = target_user.name if target_user else "User"

    # Delete RoomMember if exists
    res_member = await db.execute(
        select(RoomMember).filter(
            RoomMember.room_id == room.id,
            RoomMember.user_id == payload.user_id
        )
    )
    member_entry = res_member.scalars().first()
    if member_entry:
        await db.delete(member_entry)

    # Delete non-prime moderator if exists
    if target_mod and not target_mod.is_prime:
        await db.delete(target_mod)

    # Delete or revoke RoomAdmission
    res_adm = await db.execute(
        select(RoomAdmission).filter(
            RoomAdmission.room_id == room.id,
            RoomAdmission.user_id == payload.user_id
        )
    )
    adm = res_adm.scalars().first()
    if adm:
        await db.delete(adm)

    await db.commit()

    # Notify room participants via WebSocket
    await hub.broadcast_to_room(slug, {
        "type": "room_member_removed",
        "room_slug": slug,
        "user_id": payload.user_id,
        "notice": f"{target_name} was removed from the room by {current_user.name}."
    })

    return {"status": "removed", "message": f"{target_name} has been removed from the room"}


@router.post("/rooms/{slug}/exit")
async def exit_room(
    slug: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Allows any participant/moderator to exit the room (except the creator)."""
    room = await _get_room_with_moderators(db, slug)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    if current_user.id == room.creator_id:
        raise HTTPException(status_code=400, detail="Room creator cannot exit their own room. You can delete the room in Room Settings.")

    # Remove RoomMember
    res_member = await db.execute(
        select(RoomMember).filter(
            RoomMember.room_id == room.id,
            RoomMember.user_id == current_user.id
        )
    )
    member_entry = res_member.scalars().first()
    if member_entry:
        await db.delete(member_entry)

    # Remove non-prime RoomModerator if any
    res_mod = await db.execute(
        select(RoomModerator).filter(
            RoomModerator.room_id == room.id,
            RoomModerator.user_id == current_user.id
        )
    )
    mod_entry = res_mod.scalars().first()
    if mod_entry and not mod_entry.is_prime:
        await db.delete(mod_entry)

    # Remove RoomAdmission if any
    res_adm = await db.execute(
        select(RoomAdmission).filter(
            RoomAdmission.room_id == room.id,
            RoomAdmission.user_id == current_user.id
        )
    )
    adm = res_adm.scalars().first()
    if adm:
        await db.delete(adm)

    await db.commit()

    # Broadcast notice to room
    await hub.broadcast_to_room(slug, {
        "type": "room_member_left",
        "room_slug": slug,
        "user_id": current_user.id,
        "notice": f"{current_user.name} has left the room."
    })

    return {"status": "exited", "message": f"You have exited #{room.title}"}


@router.delete("/rooms/{slug}/messages")
async def clear_room_messages(
    slug: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Moderators can clear all messages in a room."""
    room = await _get_room_with_moderators(db, slug)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    if not await _is_moderator(db, room.id, current_user.id):
        raise HTTPException(status_code=403, detail="Only moderators can clear room chat")

    await db.execute(
        delete(Message).filter(Message.room_id == room.id)
    )
    await db.commit()

    # Broadcast cleared notice
    await hub.broadcast_to_room(slug, {
        "type": "room_messages_cleared",
        "room_slug": slug,
        "notice": f"Chat history was cleared by moderator {current_user.name}."
    })

    return {"status": "cleared", "message": f"Chat history for #{room.title} cleared"}


@router.get("/rooms/{slug}/participants", response_model=List[UserOut])
async def get_room_participants(
    slug: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """Returns active participants for a room (room members, moderators, creator)."""
    room = await _get_room_with_moderators(db, slug)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    if room.is_private:
        if not current_user:
            raise HTTPException(status_code=403, detail="Only room members can view participants of a private room")
        is_creator = (room.creator_id == current_user.id)
        is_mod = await _is_moderator(db, room.id, current_user.id)
        res_mem = await db.execute(select(RoomMember).filter(RoomMember.room_id == room.id, RoomMember.user_id == current_user.id))
        if not (is_creator or is_mod or res_mem.scalars().first()):
            raise HTTPException(status_code=403, detail="Only room members can view participants of a private room")

    participant_ids = set()

    # 1. Explicit members
    members_res = await db.execute(
        select(RoomMember.user_id).filter(RoomMember.room_id == room.id)
    )
    for row in members_res.all():
        if row[0]:
            participant_ids.add(row[0])

    # 2. Moderators & Creator
    mods_res = await db.execute(
        select(RoomModerator.user_id).filter(RoomModerator.room_id == room.id)
    )
    for row in mods_res.all():
        if row[0]:
            participant_ids.add(row[0])

    if room.creator_id:
        participant_ids.add(room.creator_id)

    # 3. Fallback only if no explicit members exist yet
    if not participant_ids:
        msg_users_res = await db.execute(
            select(Message.sender_id).filter(Message.room_id == room.id).distinct()
        )
        for row in msg_users_res.all():
            if row[0]:
                participant_ids.add(row[0])

    if not participant_ids:
        return []

    users_res = await db.execute(
        select(User).filter(User.id.in_(participant_ids)).order_by(User.name.asc())
    )
    return users_res.scalars().all()


# ─────────────────────────────────────────────────────────────────
# ROOM INVITATIONS & ADMISSIONS
# ─────────────────────────────────────────────────────────────────
@router.get("/rooms/{slug}/invite")
async def get_room_invite(
    slug: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Anyone in the room (or moderator) can get the invitation link."""
    room = await _get_room_with_moderators(db, slug)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    is_mod = await _is_moderator(db, room.id, current_user.id)
    res_m = await db.execute(select(RoomMember).filter(RoomMember.room_id == room.id, RoomMember.user_id == current_user.id))
    is_member = res_m.scalars().first() is not None

    if room.is_private and not (is_mod or is_member):
        raise HTTPException(status_code=403, detail="Only room members can access the invitation link")

    if not room.invite_code:
        room.invite_code = secrets.token_urlsafe(8)
        await db.commit()

    return {
        "invite_code": room.invite_code,
        "invite_url": f"/invite/{room.slug}?code={room.invite_code}",
        "room_slug": room.slug,
        "room_title": room.title,
        "is_private": bool(room.is_private)
    }


@router.post("/rooms/{slug}/join")
async def join_room(
    slug: str,
    payload: JoinRoomPayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Join a room or request admission if private.
    If public: adds user directly as member.
    If private: verifies invite_code and creates an admission request for moderators.
    """
    room = await _get_room_with_moderators(db, slug)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    is_mod = await _is_moderator(db, room.id, current_user.id)
    res_mem = await db.execute(select(RoomMember).filter(RoomMember.room_id == room.id, RoomMember.user_id == current_user.id))
    existing_member = res_mem.scalars().first()

    if is_mod or existing_member:
        return {"status": "joined", "message": "You are already a member of this room."}

    if not room.is_private:
        new_mem = RoomMember(room_id=room.id, user_id=current_user.id, added_by=current_user.id)
        db.add(new_mem)
        await db.commit()
        return {"status": "joined", "message": f"Successfully joined #{room.title}"}

    # Private room: verify invite code
    if not payload.code or payload.code != room.invite_code:
        raise HTTPException(status_code=403, detail="Invalid or missing invitation link for this private room")

    # Check existing admission
    res_adm = await db.execute(select(RoomAdmission).filter(RoomAdmission.room_id == room.id, RoomAdmission.user_id == current_user.id))
    existing_adm = res_adm.scalars().first()

    if existing_adm:
        if existing_adm.status == "accepted":
            new_mem = RoomMember(room_id=room.id, user_id=current_user.id, added_by=existing_adm.reviewed_by)
            db.add(new_mem)
            await db.commit()
            return {"status": "joined", "message": "Your admission was accepted. You are now a member!"}
        elif existing_adm.status == "pending":
            return {"status": "pending", "message": "Your admission request is awaiting moderator approval."}
        else: # rejected -> allow re-requesting
            existing_adm.status = "pending"
            existing_adm.created_at = datetime.utcnow()
            await db.commit()
    else:
        new_adm = RoomAdmission(
            room_id=room.id,
            user_id=current_user.id,
            status="pending"
        )
        db.add(new_adm)
        await db.commit()

    # Notify moderators in real-time
    res_mods = await db.execute(select(RoomModerator).filter(RoomModerator.room_id == room.id))
    for mod in res_mods.scalars().all():
        await hub.send_to_user(mod.user_id, {
            "type": "room_admission_received",
            "room_slug": room.slug,
            "room_title": room.title,
            "user_id": current_user.id,
            "name": current_user.name
        })

    return {
        "status": "pending",
        "message": f"Admission requested for #{room.title}. A moderator will review your request."
    }


@router.get("/rooms/{slug}/admissions", response_model=List[RoomAdmissionOut])
async def list_room_admissions(
    slug: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Moderators can view pending admission requests for the private room."""
    room = await _get_room_with_moderators(db, slug)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    if not await _is_moderator(db, room.id, current_user.id):
        raise HTTPException(status_code=403, detail="Only moderators can view room admissions")

    res = await db.execute(
        select(RoomAdmission).filter(
            RoomAdmission.room_id == room.id,
            RoomAdmission.status == "pending"
        ).order_by(RoomAdmission.created_at.desc())
    )
    admissions = res.scalars().all()
    result = []
    for adm in admissions:
        res_u = await db.execute(select(User).filter(User.id == adm.user_id))
        u = res_u.scalars().first()
        if u:
            result.append(RoomAdmissionOut(
                id=adm.id,
                room_id=room.id,
                room_slug=room.slug,
                room_title=room.title,
                user_id=u.id,
                user_name=u.name,
                user_username=u.username,
                user_avatar=u.avatar,
                user_gender=u.gender,
                name=u.name,
                username=u.username,
                avatar=u.avatar,
                gender=u.gender,
                status=adm.status,
                created_at=adm.created_at
            ))
    return result


@router.post("/rooms/{slug}/admissions/{admission_id}/respond")
async def respond_to_admission(
    slug: str,
    admission_id: str,
    payload: RespondAdmissionPayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Moderators accept or reject incoming persons into the room."""
    room = await _get_room_with_moderators(db, slug)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    if not await _is_moderator(db, room.id, current_user.id):
        raise HTTPException(status_code=403, detail="Only moderators can respond to admissions")

    res = await db.execute(select(RoomAdmission).filter(RoomAdmission.id == admission_id, RoomAdmission.room_id == room.id))
    admission = res.scalars().first()
    if not admission:
        raise HTTPException(status_code=404, detail="Admission request not found")

    status_choice = payload.status.lower()
    if status_choice not in ["accepted", "rejected"]:
        raise HTTPException(status_code=400, detail="Invalid status, must be 'accepted' or 'rejected'")

    admission.status = status_choice
    admission.reviewed_at = datetime.utcnow()
    admission.reviewed_by = current_user.id

    if status_choice == "accepted":
        res_m = await db.execute(select(RoomMember).filter(RoomMember.room_id == room.id, RoomMember.user_id == admission.user_id))
        if not res_m.scalars().first():
            db.add(RoomMember(room_id=room.id, user_id=admission.user_id, added_by=current_user.id))

    await db.commit()

    # Notify applicant via WebSocket
    await hub.send_to_user(admission.user_id, {
        "type": "room_admission_status",
        "room_slug": room.slug,
        "room_title": room.title,
        "status": status_choice
    })

    return {
        "status": status_choice,
        "message": f"Admission request has been {status_choice}."
    }


# ─────────────────────────────────────────────────────────────────
# DIRECT CHATS (INITIATED CONVERSATIONS)
# ─────────────────────────────────────────────────────────────────
@router.get("/direct-conversations", response_model=List[UserOut])
async def list_direct_conversations(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Returns only profiles where a chat has actually been initiated
    (either current_user sent a message to them, or they sent a message to current_user),
    ordered with the most recently active conversation on top, including last message preview.
    """
    res = await db.execute(
        select(Message.sender_id, Message.recipient_id, Message.content, Message.created_at)
        .filter(
            Message.room_id.is_(None),
            or_(
                Message.sender_id == current_user.id,
                Message.recipient_id == current_user.id
            )
        )
        .order_by(Message.created_at.desc())
        .limit(1000)
    )
    partner_last_info = {}
    for s_id, r_id, content, created_at in res.all():
        pid = r_id if s_id == current_user.id else s_id
        if pid and pid != current_user.id:
            if pid not in partner_last_info:
                msg_time = created_at
                if msg_time and msg_time.tzinfo is None:
                    msg_time = msg_time.replace(tzinfo=timezone.utc)
                partner_last_info[pid] = {
                    "content": content,
                    "created_at": msg_time,
                    "sort_time": created_at or datetime.min,
                    "sender_id": s_id
                }

    if not partner_last_info:
        return []

    sorted_partner_ids = sorted(
        partner_last_info.keys(),
        key=lambda p: partner_last_info[p]["sort_time"],
        reverse=True
    )
    res_users = await db.execute(select(User).filter(User.id.in_(sorted_partner_ids)))
    user_map = {u.id: u for u in res_users.scalars().all()}

    out = []
    for pid in sorted_partner_ids:
        u = user_map.get(pid)
        if not u:
            continue
        u_out = UserOut.from_orm(u)
        info = partner_last_info[pid]
        u_out.last_message = info["content"]
        u_out.last_message_at = info["created_at"]
        u_out.last_message_sender_id = info["sender_id"]
        out.append(u_out)
    return out


# ─────────────────────────────────────────────────────────────────
# EXPLORE FRIENDS & SEARCH
# ─────────────────────────────────────────────────────────────────
@router.get("/explore-users", response_model=List[UserOut])
async def explore_users(
    query: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Explore & Recommendations:
    - Without query: recommends users who recently interacted in rooms shared with current_user,
      followed by all other users in common rooms (plus accepted friends for the My Friends tab).
    - With query: searches registered users by username or display name.
    """
    # 1. Batch-fetch friendship links for current_user into O(1) hash maps
    res_f = await db.execute(
        select(Friendship).filter(
            or_(
                Friendship.requester_id == current_user.id,
                Friendship.addressee_id == current_user.id
            )
        )
    )
    friendships = res_f.scalars().all()
    status_map = {}
    req_id_map = {}
    accepted_friend_ids = set()
    for f in friendships:
        other_id = f.addressee_id if f.requester_id == current_user.id else f.requester_id
        if f.status == "accepted":
            status_map[other_id] = "accepted"
            accepted_friend_ids.add(other_id)
        elif f.status == "pending":
            if f.requester_id == current_user.id:
                status_map[other_id] = "pending_sent"
            else:
                status_map[other_id] = "pending_received"
                req_id_map[other_id] = f.id

    # Explicit search mode
    if query and query.strip():
        q_clean = f"%{query.strip().lower()}%"
        res = await db.execute(
            select(User)
            .filter(
                User.id != current_user.id,
                or_(User.username.ilike(q_clean), User.name.ilike(q_clean))
            )
            .order_by(User.name.asc())
            .limit(50)
        )
        users = res.scalars().all()
        result = []
        for u in users:
            u_out = UserOut.from_orm(u)
            u_out.friendship_status = status_map.get(u.id)
            u_out.friend_request_id = req_id_map.get(u.id)
            result.append(u_out)
        return result

    # 2. Recommendations mode: find all rooms current_user participates in (O(1) batch queries)
    res_my_mem = await db.execute(select(RoomMember.room_id).filter(RoomMember.user_id == current_user.id))
    res_my_mod = await db.execute(select(RoomModerator.room_id).filter(RoomModerator.user_id == current_user.id))
    res_my_created = await db.execute(select(Room.id).filter(Room.creator_id == current_user.id))
    my_room_ids = (
        {r[0] for r in res_my_mem.all()}
        | {r[0] for r in res_my_mod.all()}
        | {r[0] for r in res_my_created.all()}
    )

    recent_interacted: dict[str, datetime] = {}
    common_room_user_ids: set[str] = set()

    if my_room_ids:
        my_room_list = list(my_room_ids)

        # Users who recently sent messages in shared rooms
        res_msgs = await db.execute(
            select(Message.sender_id, Message.created_at)
            .filter(
                Message.room_id.in_(my_room_list),
                Message.sender_id.isnot(None),
                Message.sender_id != current_user.id
            )
            .order_by(Message.created_at.desc())
            .limit(300)
        )
        for sid, ts in res_msgs.all():
            if sid and sid not in recent_interacted:
                recent_interacted[sid] = ts or datetime.min

        # All members, moderators, and creators in shared rooms
        res_other_mem = await db.execute(
            select(RoomMember.user_id).filter(
                RoomMember.room_id.in_(my_room_list),
                RoomMember.user_id != current_user.id
            )
        )
        res_other_mod = await db.execute(
            select(RoomModerator.user_id).filter(
                RoomModerator.room_id.in_(my_room_list),
                RoomModerator.user_id != current_user.id
            )
        )
        res_other_creator = await db.execute(
            select(Room.creator_id).filter(
                Room.id.in_(my_room_list),
                Room.creator_id.isnot(None),
                Room.creator_id != current_user.id
            )
        )
        common_room_user_ids = (
            {r[0] for r in res_other_mem.all()}
            | {r[0] for r in res_other_mod.all()}
            | {r[0] for r in res_other_creator.all()}
        )

    # 3. LinkedIn-style multi-hop mutual friend BFS (up to 3 hops in 2 batch DB queries)
    hop2_mutual_counts: dict[str, int] = {}
    hop3_bridge_counts: dict[str, int] = {}
    visited = {current_user.id} | accepted_friend_ids

    if accepted_friend_ids:
        hop1_list = list(accepted_friend_ids)[:250]
        res_hop2 = await db.execute(
            select(Friendship.requester_id, Friendship.addressee_id).filter(
                Friendship.status == "accepted",
                or_(
                    Friendship.requester_id.in_(hop1_list),
                    Friendship.addressee_id.in_(hop1_list)
                )
            )
        )
        for req_id, addr_id in res_hop2.all():
            if req_id in accepted_friend_ids and addr_id not in visited:
                hop2_mutual_counts[addr_id] = hop2_mutual_counts.get(addr_id, 0) + 1
            elif addr_id in accepted_friend_ids and req_id not in visited:
                hop2_mutual_counts[req_id] = hop2_mutual_counts.get(req_id, 0) + 1

        hop2_ids = set(hop2_mutual_counts.keys())
        visited |= hop2_ids

        if hop2_ids:
            # Expand top 200 2nd-degree nodes to discover 3rd-degree connections (Hop 3)
            top_hop2 = sorted(hop2_ids, key=lambda uid: hop2_mutual_counts[uid], reverse=True)[:200]
            top_hop2_set = set(top_hop2)
            res_hop3 = await db.execute(
                select(Friendship.requester_id, Friendship.addressee_id).filter(
                    Friendship.status == "accepted",
                    or_(
                        Friendship.requester_id.in_(top_hop2),
                        Friendship.addressee_id.in_(top_hop2)
                    )
                )
            )
            for req_id, addr_id in res_hop3.all():
                if req_id in top_hop2_set and addr_id not in visited:
                    hop3_bridge_counts[addr_id] = hop3_bridge_counts.get(addr_id, 0) + 1
                elif addr_id in top_hop2_set and req_id not in visited:
                    hop3_bridge_counts[req_id] = hop3_bridge_counts.get(req_id, 0) + 1

    hop2_ids = set(hop2_mutual_counts.keys())
    hop3_ids = set(hop3_bridge_counts.keys())

    candidate_ids = (
        common_room_user_ids
        | set(recent_interacted.keys())
        | hop2_ids
        | hop3_ids
        | accepted_friend_ids
    )
    candidate_ids.discard(current_user.id)
    if not candidate_ids:
        return []

    res_users = await db.execute(
        select(User).filter(User.id.in_(list(candidate_ids)))
    )
    users = res_users.scalars().all()

    result = []
    for u in users:
        u_out = UserOut.from_orm(u)
        u_out.friendship_status = status_map.get(u.id)
        u_out.friend_request_id = req_id_map.get(u.id)

        mutual_cnt = hop2_mutual_counts.get(u.id, 0)
        if u.id in recent_interacted:
            if mutual_cnt > 0:
                plural = "friend" if mutual_cnt == 1 else "friends"
                u_out.recommendation_reason = f"Recently active in your room · {mutual_cnt} mutual {plural}"
            else:
                u_out.recommendation_reason = "Recently active in your room"
        elif mutual_cnt > 0:
            plural = "friend" if mutual_cnt == 1 else "friends"
            u_out.recommendation_reason = f"{mutual_cnt} mutual {plural}"
        elif u.id in common_room_user_ids:
            u_out.recommendation_reason = "Common room member"
        elif u.id in hop3_ids:
            u_out.recommendation_reason = "3rd-degree connection"
        result.append(u_out)

    # Sort: recently interacted -> 2nd-degree mutual friends (most mutuals first)
    #       -> common room members -> 3rd-degree connections (most bridges first) -> other friends
    def _rec_sort_key(u: UserOut):
        if u.id in recent_interacted:
            ts = recent_interacted[u.id].timestamp() if recent_interacted[u.id] != datetime.min else 0
            return (0, -ts, -hop2_mutual_counts.get(u.id, 0), (u.name or "").lower())
        if u.id in hop2_mutual_counts:
            return (1, -hop2_mutual_counts[u.id], 0, (u.name or "").lower())
        if u.id in common_room_user_ids:
            return (2, 0, 0, (u.name or "").lower())
        if u.id in hop3_bridge_counts:
            return (3, -hop3_bridge_counts[u.id], 0, (u.name or "").lower())
        return (4, 0, 0, (u.name or "").lower())

    result.sort(key=_rec_sort_key)
    return result


# ─────────────────────────────────────────────────────────────────
# USER PROFILE & UPDATE
# ─────────────────────────────────────────────────────────────────
@router.get("/users/{user_id}/profile", response_model=UserProfileDetails)
async def get_user_profile(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    res_u = await db.execute(select(User).filter(User.id == user_id))
    user = res_u.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Determine friendship status between current_user and target user
    friendship_status = None
    if current_user.id != user_id:
        res_f = await db.execute(
            select(Friendship).filter(
                or_(
                    and_(Friendship.requester_id == current_user.id, Friendship.addressee_id == user_id),
                    and_(Friendship.requester_id == user_id, Friendship.addressee_id == current_user.id)
                )
            )
        )
        f_row = res_f.scalars().first()
        if f_row:
            if f_row.status == "accepted":
                friendship_status = "accepted"
            elif f_row.requester_id == current_user.id:
                friendship_status = "pending_sent"
            else:
                friendship_status = "pending_received"

    # List accepted friends of target user
    res_friends = await db.execute(
        select(Friendship).filter(
            Friendship.status == "accepted",
            or_(Friendship.requester_id == user_id, Friendship.addressee_id == user_id)
        )
    )
    friend_links = res_friends.scalars().all()
    friend_ids = set()
    for fl in friend_links:
        fid = fl.addressee_id if fl.requester_id == user_id else fl.requester_id
        friend_ids.add(fid)

    friends_list = []
    if friend_ids:
        res_fl = await db.execute(select(User).filter(User.id.in_(friend_ids)))
        friends_list = res_fl.scalars().all()

    # If viewing own profile, also show pending requests received
    pending_list = []
    if current_user.id == user_id:
        res_pending = await db.execute(
            select(Friendship).filter(
                Friendship.addressee_id == current_user.id,
                Friendship.status == "pending"
            ).order_by(Friendship.created_at.desc())
        )
        for req in res_pending.scalars().all():
            req_u = await db.execute(select(User).filter(User.id == req.requester_id))
            u_obj = req_u.scalars().first()
            if u_obj:
                pending_list.append(FriendRequestOut(
                    id=req.id,
                    requester_id=req.requester_id,
                    addressee_id=req.addressee_id,
                    status=req.status,
                    created_at=req.created_at,
                    requester=UserOut.from_orm(u_obj)
                ))

    return UserProfileDetails(
        user=UserOut.from_orm(user),
        friendship_status=friendship_status,
        friends_count=len(friends_list),
        friends=[UserOut.from_orm(f) for f in friends_list],
        pending_requests=pending_list
    )


@router.put("/users/me", response_model=UserOut)
async def update_my_profile(
    payload: UserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if payload.username and payload.username.lower() != current_user.username.lower():
        clean_u = re.sub(r"[^a-zA-Z0-9_]", "", payload.username.lower())
        if len(clean_u) < 3 or len(clean_u) > 30:
            raise HTTPException(status_code=400, detail="Username must be between 3 and 30 letters, numbers, or underscores")

        res_dup = await db.execute(select(User).filter(User.username == clean_u, User.id != current_user.id))
        if res_dup.scalars().first():
            raise HTTPException(status_code=400, detail="Username is already taken")
        current_user.username = clean_u

    if payload.name:
        current_user.name = payload.name.strip()[:80]
    if payload.avatar is not None:
        if not _is_safe_image_url(payload.avatar):
            raise HTTPException(status_code=400, detail="Invalid avatar URL")
        current_user.avatar = payload.avatar.strip()
    if payload.gender:
        current_user.gender = payload.gender.strip()[:30]
    if payload.bio is not None:
        current_user.bio = payload.bio.strip()[:500]
    if payload.interests is not None:
        current_user.interests = payload.interests.strip()[:300]
    ghost_changed = False
    if payload.is_ghost is not None:
        current_user.is_ghost = bool(payload.is_ghost)
        ghost_changed = True

    await db.commit()
    await db.refresh(current_user)
    if ghost_changed:
        await hub.set_ghost_mode(current_user.id, bool(current_user.is_ghost))
    return current_user


# ─────────────────────────────────────────────────────────────────
# FRIEND REQUESTS & SYSTEM
# ─────────────────────────────────────────────────────────────────
@router.get("/friends/pending", response_model=List[FriendRequestOut])
async def get_pending_requests(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Returns incoming pending friend requests for current user."""
    res_pending = await db.execute(
        select(Friendship).filter(
            Friendship.addressee_id == current_user.id,
            Friendship.status == "pending"
        ).order_by(Friendship.created_at.desc())
    )
    pending_list = []
    for req in res_pending.scalars().all():
        req_u = await db.execute(select(User).filter(User.id == req.requester_id))
        u_obj = req_u.scalars().first()
        if u_obj:
            pending_list.append(FriendRequestOut(
                id=req.id,
                requester_id=req.requester_id,
                addressee_id=req.addressee_id,
                status=req.status,
                created_at=req.created_at,
                requester=UserOut.from_orm(u_obj)
            ))
    return pending_list


@router.post("/friends/request")
async def send_friend_request(
    payload: FriendRequestCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.provider == "demo":
        raise HTTPException(
            status_code=403,
            detail="You should login to use these features."
        )

    if current_user.id == payload.addressee_id:
        raise HTTPException(status_code=400, detail="Cannot send friend request to yourself")

    res_target = await db.execute(select(User).filter(User.id == payload.addressee_id))
    target = res_target.scalars().first()
    if not target:
        raise HTTPException(status_code=404, detail="Target user not found")

    # Check existing friendship or request
    res_f = await db.execute(
        select(Friendship).filter(
            or_(
                and_(Friendship.requester_id == current_user.id, Friendship.addressee_id == payload.addressee_id),
                and_(Friendship.requester_id == payload.addressee_id, Friendship.addressee_id == current_user.id)
            )
        )
    )
    existing = res_f.scalars().first()
    if existing:
        if existing.status == "accepted":
            return {"status": "accepted", "message": "Already friends"}
        if existing.requester_id == current_user.id:
            return {"status": "pending_sent", "message": "Friend request already sent"}
        else:
            return {"status": "pending_received", "message": "User already sent you a friend request"}

    new_f = Friendship(
        requester_id=current_user.id,
        addressee_id=payload.addressee_id,
        status="pending"
    )
    db.add(new_f)
    await db.commit()

    # Real-time WebSocket notify addressee
    await hub.send_to_user(payload.addressee_id, {
        "type": "friend_request_received",
        "requester_id": current_user.id,
        "name": current_user.name,
        "username": current_user.username
    })

    return {"status": "pending_sent", "message": "Friend request sent"}


@router.post("/friends/respond/{request_id}")
async def respond_to_friend_request(
    request_id: str,
    payload: FriendRequestRespond,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    res_f = await db.execute(
        select(Friendship).filter(
            Friendship.id == request_id,
            Friendship.addressee_id == current_user.id
        )
    )
    friendship = res_f.scalars().first()
    if not friendship:
        raise HTTPException(status_code=404, detail="Friend request not found")

    status_req = payload.status.lower()
    if status_req == "accepted":
        friendship.status = "accepted"
        await db.commit()
        # Real-time WebSocket notify requester
        await hub.send_to_user(friendship.requester_id, {
            "type": "friend_request_accepted",
            "friend_id": current_user.id,
            "name": current_user.name
        })
        return {"status": "accepted", "message": "Friend request accepted"}
    elif status_req in ["declined", "ignored"]:
        await db.delete(friendship)
        await db.commit()
        return {"status": "ignored", "message": "Friend request ignored"}
    else:
        raise HTTPException(status_code=400, detail="Invalid response status")


# ─────────────────────────────────────────────────────────────────
# NOTIFICATIONS (Action-required items)
# ─────────────────────────────────────────────────────────────────
@router.get("/notifications", response_model=NotificationListOut)
async def get_notifications(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Optimized O(1) DB round-trip notifications loader using batch IN-queries
    and hash-map lookups instead of N+1 queries.
    """
    items = []

    # 1. Pending Friend Requests
    res_f = await db.execute(
        select(Friendship).filter(
            Friendship.addressee_id == current_user.id,
            Friendship.status == "pending"
        ).order_by(Friendship.created_at.desc())
    )
    pending_friends = res_f.scalars().all()

    # 2. Pending Room Admissions for Moderated Rooms
    res_mods = await db.execute(
        select(RoomModerator.room_id).filter(RoomModerator.user_id == current_user.id)
    )
    mod_room_ids = [row[0] for row in res_mods.all()]

    pending_admissions = []
    if mod_room_ids:
        res_adms = await db.execute(
            select(RoomAdmission).filter(
                RoomAdmission.room_id.in_(mod_room_ids),
                RoomAdmission.status == "pending"
            ).order_by(RoomAdmission.created_at.desc())
        )
        pending_admissions = res_adms.scalars().all()

    # Batch-fetch all referenced Users and Rooms in constant O(1) queries
    user_ids = {f.requester_id for f in pending_friends} | {a.user_id for a in pending_admissions}
    room_ids = {a.room_id for a in pending_admissions}

    user_map = {}
    if user_ids:
        res_users = await db.execute(select(User).filter(User.id.in_(list(user_ids))))
        user_map = {u.id: u for u in res_users.scalars().all()}

    room_map = {}
    if room_ids:
        res_rooms = await db.execute(select(Room).filter(Room.id.in_(list(room_ids))))
        room_map = {r.id: r for r in res_rooms.scalars().all()}

    for f in pending_friends:
        u = user_map.get(f.requester_id)
        if u:
            items.append(NotificationItem(
                id=f"friend_{f.id}",
                raw_id=f.id,
                type="friend_request",
                title="Friend Request",
                description=f"@{u.username} sent you a friend request",
                avatar=u.avatar,
                user_id=u.id,
                user_name=u.name,
                user_username=u.username,
                created_at=f.created_at
            ))

    for adm in pending_admissions:
        room = room_map.get(adm.room_id)
        u = user_map.get(adm.user_id)
        if room and u:
            items.append(NotificationItem(
                id=f"admission_{adm.id}",
                raw_id=adm.id,
                type="room_admission",
                title="Room Admission Request",
                description=f"{u.name} requested to join #{room.title}",
                avatar=u.avatar,
                user_id=u.id,
                user_name=u.name,
                user_username=u.username,
                room_slug=room.slug,
                room_title=room.title,
                created_at=adm.created_at
            ))

    items.sort(key=lambda x: x.created_at, reverse=True)

    return NotificationListOut(
        items=items,
        unread_count=len(items)
    )


# ─────────────────────────────────────────────────────────────────
# MESSAGE HISTORIES
# ─────────────────────────────────────────────────────────────────
@router.get("/rooms/{slug}/messages", response_model=List[MessageOut])
async def get_room_messages(
    slug: str,
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    res_r = await db.execute(select(Room).filter(Room.slug == slug.lower()))
    room = res_r.scalars().first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    if not current_user:
        raise HTTPException(status_code=403, detail="Please log in and join this room to view messages.")
    is_creator = (room.creator_id == current_user.id)
    is_mod = await _is_moderator(db, room.id, current_user.id)
    if not (is_creator or is_mod):
        res_m = await db.execute(select(RoomMember).filter(RoomMember.room_id == room.id, RoomMember.user_id == current_user.id))
        if not res_m.scalars().first():
            detail_msg = "This room is private. You must be an admitted member to view messages." if room.is_private else "You are not a participant in this room. Please join to view messages."
            raise HTTPException(status_code=403, detail=detail_msg)

    res = await db.execute(
        select(Message, User)
        .outerjoin(User, Message.sender_id == User.id)
        .filter(Message.room_id == room.id)
        .order_by(Message.created_at.desc())
        .limit(limit)
    )
    rows = res.all()
    messages = []
    for msg, sender in reversed(rows):
        msg_date = msg.created_at
        if msg_date and msg_date.tzinfo is None:
            msg_date = msg_date.replace(tzinfo=timezone.utc)
        is_deleted_guest = sender is None
        messages.append(MessageOut(
            id=msg.id,
            content=msg.content,
            sender_id=sender.id if sender else None,
            sender_name=sender.name if sender else "Guest User",
            sender_username=sender.username if sender else "guest",
            sender_gender=(sender.gender or "Prefer not to say") if sender else "Prefer not to say",
            sender_avatar=sender.avatar if sender else None,
            is_guest_deleted=is_deleted_guest,
            room_id=room.id,
            recipient_id=None,
            created_at=msg_date
        ))
    return messages


@router.get("/direct/{recipient_id}/messages", response_model=List[MessageOut])
async def get_direct_messages(
    recipient_id: str,
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    res_rec = await db.execute(select(User).filter(User.id == recipient_id))
    recipient = res_rec.scalars().first()
    if not recipient:
        raise HTTPException(status_code=404, detail="Recipient not found")

    res = await db.execute(
        select(Message, User)
        .join(User, Message.sender_id == User.id)
        .filter(
            Message.room_id.is_(None),
            (
                ((Message.sender_id == current_user.id) & (Message.recipient_id == recipient_id)) |
                ((Message.sender_id == recipient_id) & (Message.recipient_id == current_user.id))
            )
        )
        .order_by(Message.created_at.desc())
        .limit(limit)
    )
    rows = res.all()
    messages = []
    for msg, sender in reversed(rows):
        msg_date = msg.created_at
        if msg_date and msg_date.tzinfo is None:
            msg_date = msg_date.replace(tzinfo=timezone.utc)
        messages.append(MessageOut(
            id=msg.id,
            content=msg.content,
            sender_id=sender.id,
            sender_name=sender.name,
            sender_username=sender.username,
            sender_gender=sender.gender or "Prefer not to say",
            sender_avatar=sender.avatar,
            room_id=None,
            recipient_id=msg.recipient_id,
            created_at=msg_date
        ))
    return messages


@router.delete("/direct/{recipient_id}/messages")
async def clear_direct_messages(
    recipient_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Clears all direct messages between current user and recipient."""
    await db.execute(
        delete(Message).filter(
            Message.room_id.is_(None),
            or_(
                and_(Message.sender_id == current_user.id, Message.recipient_id == recipient_id),
                and_(Message.sender_id == recipient_id, Message.recipient_id == current_user.id)
            )
        )
    )
    await db.commit()
    return {"status": "cleared", "message": "Direct chat cleared successfully"}


@router.delete("/friends/{target_user_id}")
@router.post("/friends/{target_user_id}/remove")
async def remove_friend(
    target_user_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Removes a friendship between current user and target user."""
    res_f = await db.execute(
        select(Friendship).filter(
            or_(
                and_(Friendship.requester_id == current_user.id, Friendship.addressee_id == target_user_id),
                and_(Friendship.requester_id == target_user_id, Friendship.addressee_id == current_user.id)
            )
        )
    )
    friendship = res_f.scalars().first()
    if not friendship:
        raise HTTPException(status_code=404, detail="Friendship not found")

    await db.delete(friendship)
    await db.commit()

    # Real-time WebSocket notify both users
    await hub.send_to_user(target_user_id, {
        "type": "friend_removed",
        "user_id": current_user.id
    })
    await hub.send_to_user(current_user.id, {
        "type": "friend_removed",
        "user_id": target_user_id
    })

    return {"status": "removed", "message": "Friend removed successfully"}

