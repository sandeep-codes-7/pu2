from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import or_, and_, delete
from typing import List, Optional
import re

from app.database import get_db
from app.models.entities import User, Room, Message, Friendship
from app.schemas.schemas import (
    RoomCreate, RoomOut, UserOut, MessageOut, 
    FriendRequestCreate, FriendRequestRespond, FriendRequestOut,
    UserProfileDetails, UserUpdate
)
from app.dependencies.auth import get_current_user

router = APIRouter(prefix="/api", tags=["chat_rest"])

# ----------------- ROOMS -----------------
@router.get("/rooms", response_model=List[RoomOut])
async def list_rooms(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(Room).order_by(Room.created_at.asc()))
    rooms = res.scalars().all()
    
    if not rooms:
        default_rooms = [
            Room(slug="general", title="General Lounge", topic="The main hangout for everyone on PairUP"),
            Room(slug="tech-talk", title="Code & Tech", topic="System architecture, AI, web dev, and questions"),
            Room(slug="random", title="Random & Hangout", topic="Casual banter, interests, and discussions"),
            Room(slug="gaming", title="Gaming & Co-op", topic="Gaming squad matchups and casual plays"),
        ]
        db.add_all(default_rooms)
        await db.commit()
        res = await db.execute(select(Room).order_by(Room.created_at.asc()))
        rooms = res.scalars().all()

    return rooms

@router.post("/rooms", response_model=RoomOut)
async def create_room(payload: RoomCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    slug = re.sub(r"[^a-zA-Z0-9_-]", "", payload.slug.lower())
    if not slug:
        raise HTTPException(status_code=400, detail="Invalid room slug")
    
    res = await db.execute(select(Room).filter(Room.slug == slug))
    if res.scalars().first():
        raise HTTPException(status_code=400, detail="Room with this name already exists")

    room = Room(slug=slug, title=payload.title, topic=payload.topic)
    db.add(room)
    await db.commit()
    await db.refresh(room)
    return room

# ----------------- DIRECT CHATS (INITIATED CONVERSATIONS) -----------------
@router.get("/direct-conversations", response_model=List[UserOut])
async def list_direct_conversations(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Returns only profiles where a chat has actually been initiated
    (either current_user sent a message to them, or they sent a message to current_user).
    """
    # Find all distinct user IDs that have exchanged direct messages with current_user
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

# ----------------- EXPLORE FRIENDS & SEARCH -----------------
@router.get("/explore-users", response_model=List[UserOut])
async def explore_users(
    query: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Explore section: returns registered users excluding current user.
    Supports search query on username or display name.
    """
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
    return res.scalars().all()

# ----------------- USER PROFILE & UPDATE -----------------
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
            )
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
        
        # Check uniqueness
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

# ----------------- FRIEND REQUESTS & SYSTEM -----------------
@router.post("/friends/request")
async def send_friend_request(
    payload: FriendRequestCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Rule: Instant pass users cannot add friends
    if current_user.provider == "demo":
        raise HTTPException(
            status_code=403, 
            detail="Instant Pass guests cannot add friends. Please sign in with Google to connect with friends!"
        )

    if current_user.id == payload.addressee_id:
        raise HTTPException(status_code=400, detail="Cannot send friend request to yourself")

    res_target = await db.execute(select(User).filter(User.id == payload.addressee_id))
    target = res_target.scalars().first()
    if not target:
        raise HTTPException(status_code=404, detail="Target user not found")

    if target.provider == "demo":
        raise HTTPException(status_code=400, detail="Cannot add temporary guest accounts as friends")

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
        return {"status": existing.status, "message": "Friend request already sent/pending"}

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

    if payload.status == "accepted":
        friendship.status = "accepted"
        await db.commit()
        return {"status": "accepted", "message": "Friend request accepted"}
    else:
        await db.delete(friendship)
        await db.commit()
        return {"status": "declined", "message": "Friend request declined"}

# ----------------- MESSAGE HISTORIES -----------------
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
