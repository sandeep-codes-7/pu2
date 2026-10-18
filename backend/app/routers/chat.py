from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Request
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import or_, and_, delete
from typing import List, Optional
import re
import os
import uuid
import shutil
from pathlib import Path

from app.database import get_db
from app.models.entities import User, Room, Message, Friendship, RoomModerator, RoomMember
from app.schemas.schemas import (
    RoomCreate, RoomOut, RoomUpdate, UserOut, MessageOut,
    FriendRequestCreate, FriendRequestRespond, FriendRequestOut,
    UserProfileDetails, UserUpdate, ModeratorOut,
    AddModeratorPayload, RemoveModeratorPayload,
    AddRoomMemberPayload, RemoveRoomMemberPayload
)
from app.dependencies.auth import get_current_user

router = APIRouter(prefix="/api", tags=["chat_rest"])

# Upload directories
UPLOADS_DIR = Path(__file__).resolve().parent.parent / "uploads"
AVATAR_DIR = UPLOADS_DIR / "avatars"
ROOM_IMG_DIR = UPLOADS_DIR / "rooms"
AVATAR_DIR.mkdir(parents=True, exist_ok=True)
ROOM_IMG_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB


def _moderator_out(mod: RoomModerator) -> ModeratorOut:
    return ModeratorOut(
        user_id=mod.user_id,
        username=mod.user.username if mod.user else "",
        name=mod.user.name if mod.user else "",
        avatar=mod.user.avatar if mod.user else None,
        is_prime=mod.is_prime
    )


async def _get_room_with_moderators(db: AsyncSession, slug: str) -> Optional[Room]:
    res = await db.execute(select(Room).filter(Room.slug == slug.lower()))
    return res.scalars().first()


async def _is_moderator(db: AsyncSession, room_id: str, user_id: str) -> bool:
    res = await db.execute(
        select(RoomModerator).filter(
            RoomModerator.room_id == room_id,
            RoomModerator.user_id == user_id
        )
    )
    return res.scalars().first() is not None


async def _is_prime_moderator(db: AsyncSession, room_id: str, user_id: str) -> bool:
    res = await db.execute(
        select(RoomModerator).filter(
            RoomModerator.room_id == room_id,
            RoomModerator.user_id == user_id,
            RoomModerator.is_prime == True
        )
    )
    return res.scalars().first() is not None


async def _build_room_out(room: Room, db: AsyncSession) -> RoomOut:
    res_mods = await db.execute(select(RoomModerator).filter(RoomModerator.room_id == room.id))
    mods = res_mods.scalars().all()
    moderator_list = []
    for m in mods:
        # Eager load user
        res_u = await db.execute(select(User).filter(User.id == m.user_id))
        m.user = res_u.scalars().first()
        moderator_list.append(_moderator_out(m))

    return RoomOut(
        id=room.id,
        slug=room.slug,
        title=room.title,
        description=room.description,
        picture=room.picture,
        creator_id=room.creator_id,
        is_private=room.is_private,
        created_at=room.created_at,
        moderators=moderator_list
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

    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else "jpg"
    filename = f"{current_user.id}.{ext}"
    dest = AVATAR_DIR / filename
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

    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else "jpg"
    filename = f"{room.id}.{ext}"
    dest = ROOM_IMG_DIR / filename
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
    path = AVATAR_DIR / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(str(path))


@router.get("/uploads/rooms/{filename}")
async def serve_room_image(filename: str):
    path = ROOM_IMG_DIR / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(str(path))


# ─────────────────────────────────────────────────────────────────
# ROOMS
# ─────────────────────────────────────────────────────────────────
@router.get("/rooms", response_model=List[RoomOut])
async def list_rooms(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(Room).order_by(Room.created_at.asc()))
    rooms = res.scalars().all()
    # No default rooms - rooms are fully user-created
    result = []
    for room in rooms:
        result.append(await _build_room_out(room, db))
    return result


@router.post("/rooms", response_model=RoomOut)
async def create_room(
    payload: RoomCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    slug = re.sub(r"[^a-zA-Z0-9_-]", "", payload.slug.lower())
    if not slug:
        raise HTTPException(status_code=400, detail="Invalid room slug")

    res = await db.execute(select(Room).filter(Room.slug == slug))
    if res.scalars().first():
        raise HTTPException(status_code=400, detail="Room with this name already exists")

    room = Room(
        slug=slug,
        title=payload.title,
        description=payload.description,
        creator_id=current_user.id
    )
    db.add(room)
    await db.flush()  # flush to get room.id

    # Auto-add creator as prime moderator
    prime_mod = RoomModerator(
        room_id=room.id,
        user_id=current_user.id,
        is_prime=True
    )
    db.add(prime_mod)
    await db.commit()
    await db.refresh(room)

    return await _build_room_out(room, db)


@router.get("/rooms/{slug}", response_model=RoomOut)
async def get_room(slug: str, db: AsyncSession = Depends(get_db)):
    room = await _get_room_with_moderators(db, slug)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    return await _build_room_out(room, db)


@router.put("/rooms/{slug}", response_model=RoomOut)
async def update_room(
    slug: str,
    payload: RoomUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Moderators can update room title, description, and picture."""
    room = await _get_room_with_moderators(db, slug)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    if not await _is_moderator(db, room.id, current_user.id):
        raise HTTPException(status_code=403, detail="Only moderators can edit this room")

    if payload.title is not None:
        room.title = payload.title.strip()
    if payload.description is not None:
        room.description = payload.description.strip()
    if payload.picture is not None:
        room.picture = payload.picture

    await db.commit()
    await db.refresh(room)
    return await _build_room_out(room, db)


@router.delete("/rooms/{slug}")
async def delete_room(
    slug: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Only moderators can delete a room."""
    room = await _get_room_with_moderators(db, slug)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    if not await _is_moderator(db, room.id, current_user.id):
        raise HTTPException(status_code=403, detail="Only moderators can delete this room")

    await db.delete(room)
    await db.commit()
    return {"status": "deleted", "message": f"Room #{slug} has been deleted"}


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

    if payload.user_id == current_user.id:
        raise HTTPException(status_code=400, detail="You are already the prime moderator")

    # Check target user exists
    res_u = await db.execute(select(User).filter(User.id == payload.user_id))
    target = res_u.scalars().first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    # Check max moderators (5 total)
    res_count = await db.execute(select(RoomModerator).filter(RoomModerator.room_id == room.id))
    current_mods = res_count.scalars().all()
    if len(current_mods) >= 5:
        raise HTTPException(status_code=400, detail="Room already has the maximum of 5 moderators")

    # Check if already a mod
    res_existing = await db.execute(
        select(RoomModerator).filter(
            RoomModerator.room_id == room.id,
            RoomModerator.user_id == payload.user_id
        )
    )
    if res_existing.scalars().first():
        raise HTTPException(status_code=400, detail="User is already a moderator of this room")

    new_mod = RoomModerator(
        room_id=room.id,
        user_id=payload.user_id,
        is_prime=False
    )
    db.add(new_mod)
    await db.commit()
    return {"status": "added", "message": f"{target.name} is now a moderator of #{room.slug}"}


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
        raise HTTPException(status_code=403, detail="Only moderators can remove members from this room")

    res_member = await db.execute(
        select(RoomMember).filter(
            RoomMember.room_id == room.id,
            RoomMember.user_id == payload.user_id
        )
    )
    member_entry = res_member.scalars().first()
    if not member_entry:
        raise HTTPException(status_code=404, detail="User is not a member of this room")

    await db.delete(member_entry)
    await db.commit()
    return {"status": "removed", "message": "Member has been removed from the room"}


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
    (either current_user sent a message to them, or they sent a message to current_user).
    """
    res = await db.execute(
        select(Message.sender_id, Message.recipient_id).filter(
            Message.room_id.is_(None),
            or_(
                Message.sender_id == current_user.id,
                Message.recipient_id == current_user.id
            )
        )
    )
    partner_ids = set()
    for s_id, r_id in res.all():
        if s_id and s_id != current_user.id:
            partner_ids.add(s_id)
        if r_id and r_id != current_user.id:
            partner_ids.add(r_id)

    if not partner_ids:
        return []

    res_users = await db.execute(select(User).filter(User.id.in_(partner_ids)))
    return res_users.scalars().all()


# ─────────────────────────────────────────────────────────────────
# EXPLORE FRIENDS & SEARCH
# ─────────────────────────────────────────────────────────────────
@router.get("/explore-users", response_model=List[UserOut])
async def explore_users(
    query: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Explore section: returns registered users excluding current user with friendship status."""
    stmt = select(User).filter(User.id != current_user.id)
    if query and query.strip():
        q_clean = f"%{query.strip().lower()}%"
        stmt = stmt.filter(
            or_(
                User.username.ilike(q_clean),
                User.name.ilike(q_clean)
            )
        )
    stmt = stmt.order_by(User.name.asc()).limit(50)
    res = await db.execute(stmt)
    users = res.scalars().all()

    # Get friendship links for current_user
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
    for f in friendships:
        other_id = f.addressee_id if f.requester_id == current_user.id else f.requester_id
        if f.status == "accepted":
            status_map[other_id] = "accepted"
        elif f.status == "pending":
            if f.requester_id == current_user.id:
                status_map[other_id] = "pending_sent"
            else:
                status_map[other_id] = "pending_received"
                req_id_map[other_id] = f.id

    result = []
    for u in users:
        u_out = UserOut.from_orm(u)
        u_out.friendship_status = status_map.get(u.id)
        u_out.friend_request_id = req_id_map.get(u.id)
        result.append(u_out)

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
        current_user.name = payload.name.strip()
    if payload.avatar is not None:
        current_user.avatar = payload.avatar.strip()
    if payload.gender:
        current_user.gender = payload.gender
    if payload.bio is not None:
        current_user.bio = payload.bio.strip()
    if payload.interests is not None:
        current_user.interests = payload.interests.strip()

    await db.commit()
    await db.refresh(current_user)
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
        return {"status": "accepted", "message": "Friend request accepted"}
    elif status_req in ["declined", "ignored"]:
        await db.delete(friendship)
        await db.commit()
        return {"status": "ignored", "message": "Friend request ignored"}
    else:
        raise HTTPException(status_code=400, detail="Invalid response status")


# ─────────────────────────────────────────────────────────────────
# MESSAGE HISTORIES
# ─────────────────────────────────────────────────────────────────
@router.get("/rooms/{slug}/messages", response_model=List[MessageOut])
async def get_room_messages(slug: str, limit: int = 50, db: AsyncSession = Depends(get_db)):
    res_r = await db.execute(select(Room).filter(Room.slug == slug.lower()))
    room = res_r.scalars().first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    res = await db.execute(
        select(Message, User)
        .join(User, Message.sender_id == User.id)
        .filter(Message.room_id == room.id)
        .order_by(Message.created_at.desc())
        .limit(limit)
    )
    rows = res.all()
    messages = []
    for msg, sender in reversed(rows):
        messages.append(MessageOut(
            id=msg.id,
            content=msg.content,
            sender_id=sender.id,
            sender_name=sender.name,
            sender_username=sender.username,
            sender_gender=sender.gender or "Prefer not to say",
            sender_avatar=sender.avatar,
            room_id=room.id,
            recipient_id=None,
            created_at=msg.created_at
        ))
    return messages


@router.get("/direct/{recipient_id}/messages", response_model=List[MessageOut])
async def get_direct_messages(
    recipient_id: str,
    limit: int = 50,
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
            ((Message.sender_id == current_user.id) & (Message.recipient_id == recipient_id)) |
            ((Message.sender_id == recipient_id) & (Message.recipient_id == current_user.id))
        )
        .order_by(Message.created_at.desc())
        .limit(limit)
    )
    rows = res.all()
    messages = []
    for msg, sender in reversed(rows):
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
            created_at=msg.created_at
        ))
    return messages
