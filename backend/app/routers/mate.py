from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import delete, and_, or_
from datetime import datetime, timezone
from typing import List, Optional

from app.database import get_db
from app.dependencies.auth import get_authenticated_user
from app.models.entities import (
    User, MateQueue, MateConversation, MateParticipant, MateMessage, Friendship
)
from app.schemas.schemas import (
    MateQueueJoinRequest, MateQueueStatusResponse,
    MateConversationDetail, MateMessageOut, UserOut
)
from app.services.matchmaking import (
    find_or_enqueue_match, clean_expired_queue_entries,
    get_active_user_mate_conversation, normalize_interests
)
from app.utils.hub import hub

router = APIRouter(prefix="/api/mate", tags=["Mate - Anonymous Matching"])

@router.post("/queue/join", response_model=MateQueueStatusResponse)
async def join_mate_queue(
    payload: MateQueueJoinRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_authenticated_user)
):
    """
    Enters the matchmaking queue with normalized interests.
    Protected: Only authenticated users (no Instant Pass guests).
    """
    result = await find_or_enqueue_match(current_user.id, payload.interests, db, hub)
    if result.get("status") == "error":
        raise HTTPException(status_code=400, detail=result.get("message", "Invalid interests"))
    
    expires_at_dt = None
    if result.get("expires_at"):
        val = result["expires_at"]
        if isinstance(val, str):
            if val.endswith("Z"):
                val = val[:-1] + "+00:00"
            try:
                expires_at_dt = datetime.fromisoformat(val)
            except Exception:
                pass
        elif isinstance(val, datetime):
            expires_at_dt = val
        if expires_at_dt and expires_at_dt.tzinfo is None:
            expires_at_dt = expires_at_dt.replace(tzinfo=timezone.utc)

    return MateQueueStatusResponse(
        status=result.get("status"),
        expires_at=expires_at_dt,
        conversation_id=result.get("conversation_id"),
        normalized_interests=result.get("normalized_interests", [])
    )

@router.post("/queue/cancel")
async def cancel_mate_queue(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_authenticated_user)
):
    """
    Cancels active matchmaking search and removes the user from the queue.
    """
    await db.execute(delete(MateQueue).filter(MateQueue.user_id == current_user.id))
    await db.commit()
    return {"status": "cancelled", "message": "Matchmaking search cancelled"}

@router.get("/queue/status", response_model=MateQueueStatusResponse)
async def get_queue_status(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_authenticated_user)
):
    """
    Checks if the user has an active conversation or is waiting in the queue.
    """
    await clean_expired_queue_entries(db)

    # 1. Check if user is already in an active Mate conversation
    active_conv = await get_active_user_mate_conversation(current_user.id, db)
    if active_conv:
        return MateQueueStatusResponse(
            status="matched",
            conversation_id=active_conv.id
        )

    # 2. Check if user is in active queue
    res = await db.execute(select(MateQueue).filter(MateQueue.user_id == current_user.id))
    entry = res.scalars().first()
    if entry and entry.expires_at > datetime.utcnow():
        import json
        try:
            interests = json.loads(entry.interests_json)
        except Exception:
            interests = []
        exp = entry.expires_at.replace(tzinfo=timezone.utc) if entry.expires_at and entry.expires_at.tzinfo is None else entry.expires_at
        return MateQueueStatusResponse(
            status="searching",
            expires_at=exp,
            normalized_interests=interests
        )

    return MateQueueStatusResponse(status="idle")

@router.get("/conversations/{conversation_id}", response_model=MateConversationDetail)
async def get_conversation_details(
    conversation_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_authenticated_user)
):
    """
    Retrieves anonymous Mate conversation details for an authorized participant.
    Real profile information is only revealed when mutual_interest is confirmed.
    """
    res_conv = await db.execute(select(MateConversation).filter(MateConversation.id == conversation_id))
    conv = res_conv.scalars().first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    res_parts = await db.execute(
        select(MateParticipant).filter(MateParticipant.conversation_id == conversation_id)
    )
    participants = res_parts.scalars().all()

    me = next((p for p in participants if p.user_id == current_user.id), None)
    if not me:
        raise HTTPException(status_code=403, detail="You are not a participant in this conversation")

    partner = next((p for p in participants if p.user_id != current_user.id), None)
    partner_nickname = partner.nickname if partner else "Anonymous"
    partner_has_left = partner.has_left if partner else True

    # Real profile is masked unless mutual interest is established
    partner_profile = None
    if conv.mutual_interest and partner:
        res_user = await db.execute(select(User).filter(User.id == partner.user_id))
        partner_u = res_user.scalars().first()
        if partner_u:
            partner_profile = UserOut.from_orm(partner_u)

    partner_is_interested = partner.is_interested if partner else False
    partner_user_id = partner.user_id if (conv.mutual_interest and partner) else None

    return MateConversationDetail(
        id=conv.id,
        is_active=conv.status == "active",
        status=conv.status,
        mutual_interest=conv.mutual_interest,
        your_nickname=me.nickname,
        my_nickname=me.nickname,
        partner_nickname=partner_nickname,
        you_are_interested=me.is_interested,
        my_interest=me.is_interested,
        partner_interest=partner_is_interested,
        partner_has_left=partner_has_left,
        you_have_left=me.has_left,
        has_left=partner_has_left,
        partner_user_id=partner_user_id,
        partner_profile=partner_profile,
        created_at=conv.created_at
    )

@router.get("/conversations/{conversation_id}/messages", response_model=List[MateMessageOut])
async def get_conversation_messages(
    conversation_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_authenticated_user)
):
    """
    Returns the message history for the anonymous chatroom.
    Sender identities are presented solely via anonymous animal nicknames.
    """
    res_parts = await db.execute(
        select(MateParticipant).filter(
            MateParticipant.conversation_id == conversation_id,
            MateParticipant.user_id == current_user.id
        )
    )
    if not res_parts.scalars().first():
        raise HTTPException(status_code=403, detail="Unauthorized")

    res_msgs = await db.execute(
        select(MateMessage)
        .filter(MateMessage.conversation_id == conversation_id)
        .order_by(MateMessage.created_at.asc())
    )
    messages = res_msgs.scalars().all()

    return [
        MateMessageOut(
            id=m.id,
            conversation_id=m.conversation_id,
            sender_nickname=m.sender_nickname,
            is_you=m.sender_id == current_user.id,
            content=m.content,
            created_at=m.created_at
        )
        for m in messages
    ]

@router.post("/conversations/{conversation_id}/interested")
async def express_interest(
    conversation_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_authenticated_user)
):
    """
    Records that current user is interested in connecting.
    If both participants express interest, automatically creates a reciprocal Friendship.
    """
    res_conv = await db.execute(select(MateConversation).filter(MateConversation.id == conversation_id))
    conv = res_conv.scalars().first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    res_parts = await db.execute(
        select(MateParticipant).filter(MateParticipant.conversation_id == conversation_id)
    )
    participants = res_parts.scalars().all()

    me = next((p for p in participants if p.user_id == current_user.id), None)
    if not me:
        raise HTTPException(status_code=403, detail="Unauthorized")

    partner = next((p for p in participants if p.user_id != current_user.id), None)
    if not partner:
        raise HTTPException(status_code=400, detail="Partner not found")

    me.is_interested = True
    me.interested_at = datetime.utcnow()
    await db.commit()

    # Check if both users are interested
    if partner.is_interested:
        conv.mutual_interest = True
        await db.commit()

        # Reciprocal Friendship creation
        res_f = await db.execute(
            select(Friendship).filter(
                or_(
                    and_(Friendship.requester_id == me.user_id, Friendship.addressee_id == partner.user_id),
                    and_(Friendship.requester_id == partner.user_id, Friendship.addressee_id == me.user_id)
                )
            )
        )
        friendship = res_f.scalars().first()
        if not friendship:
            new_friendship = Friendship(
                requester_id=me.user_id,
                addressee_id=partner.user_id,
                status="accepted"
            )
            db.add(new_friendship)
            await db.commit()
        else:
            if friendship.status != "accepted":
                friendship.status = "accepted"
                await db.commit()

        # Notify both users via WebSocket
        if hub:
            res_u1 = await db.execute(select(User).filter(User.id == me.user_id))
            u1 = res_u1.scalars().first()
            res_u2 = await db.execute(select(User).filter(User.id == partner.user_id))
            u2 = res_u2.scalars().first()

            await hub.send_to_user(me.user_id, {
                "type": "mate_mutual_interest",
                "conversation_id": conversation_id,
                "partner_nickname": partner.nickname,
                "partner_user_id": partner.user_id,
                "partner_profile": UserOut.from_orm(u2).dict() if u2 else None,
                "message": f"Mutual interest established! You and {partner.nickname} are now friends."
            })
            await hub.send_to_user(partner.user_id, {
                "type": "mate_mutual_interest",
                "conversation_id": conversation_id,
                "partner_nickname": me.nickname,
                "partner_user_id": me.user_id,
                "partner_profile": UserOut.from_orm(u1).dict() if u1 else None,
                "message": f"Mutual interest established! You and {me.nickname} are now friends."
            })

        return {
            "status": "mutual_interest",
            "my_interest": True,
            "mutual_interest": True,
            "partner_user_id": partner.user_id if partner else None,
            "message": "Mutual interest established! You are now friends."
        }
    else:
        # Notify the partner in real-time that current user is interested
        if hub:
            await hub.send_to_user(partner.user_id, {
                "type": "mate_interest_received",
                "conversation_id": conversation_id,
                "nickname": me.nickname,
                "message": f"{me.nickname} is interested in you"
            })

        return {
            "status": "interested_recorded",
            "my_interest": True,
            "mutual_interest": False,
            "message": "Interest recorded. Waiting for partner response."
        }

@router.post("/conversations/{conversation_id}/exit")
async def exit_conversation(
    conversation_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_authenticated_user)
):
    """
    Exits the conversation. Sets status to ended and notifies the other participant.
    """
    res_conv = await db.execute(select(MateConversation).filter(MateConversation.id == conversation_id))
    conv = res_conv.scalars().first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    res_parts = await db.execute(
        select(MateParticipant).filter(MateParticipant.conversation_id == conversation_id)
    )
    participants = res_parts.scalars().all()

    me = next((p for p in participants if p.user_id == current_user.id), None)
    if not me:
        raise HTTPException(status_code=403, detail="Unauthorized")

    partner = next((p for p in participants if p.user_id != current_user.id), None)

    me.has_left = True
    me.left_at = datetime.utcnow()
    conv.status = "ended"
    conv.ended_at = datetime.utcnow()
    await db.commit()

    if partner and hub:
        await hub.send_to_user(partner.user_id, {
            "type": "mate_participant_left",
            "conversation_id": conversation_id,
            "notice": "The other user has left the conversation."
        })

    return {"status": "left", "message": "You have left the conversation"}
