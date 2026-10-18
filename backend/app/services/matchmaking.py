import json
import random
from datetime import datetime, timedelta
from typing import List, Union, Dict, Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import delete, and_, or_

from app.models.entities import MateQueue, MateConversation, MateParticipant, User

ANIMAL_NICKNAMES = [
    "Rabbit", "Turtle", "Panda", "Fox", "Koala", "Otter",
    "Penguin", "Dolphin", "Tiger", "Sparrow", "Bear", "Wolf",
    "Deer", "Falcon", "Owl", "Lion", "Hedgehog", "Cheetah",
    "Beaver", "Kangaroo", "Badger", "Lynx", "Seal", "Raccoon"
]

def normalize_interests(raw_input: Union[str, List[str]]) -> List[str]:
    """
    Splits, trims, lowercases, and deduplicates interests preserving order.
    """
    if isinstance(raw_input, str):
        parts = raw_input.split(",")
    elif isinstance(raw_input, list):
        parts = raw_input
    else:
        parts = []

    normalized = []
    seen = set()
    for item in parts:
        cleaned = str(item).strip().lower()
        if cleaned and cleaned not in seen:
            seen.add(cleaned)
            normalized.append(cleaned)
    return normalized

def calculate_jaccard_similarity(list_a: List[str], list_b: List[str]) -> float:
    """
    Calculates Jaccard similarity coefficient:
    similarity = common_interests / total_unique_interests
    """
    set_a = set(list_a)
    set_b = set(list_b)
    union = set_a | set_b
    if not union:
        return 0.0
    intersection = set_a & set_b
    return len(intersection) / len(union)

async def clean_expired_queue_entries(db: AsyncSession):
    """Deletes queue entries that have passed their 5-minute expiration."""
    now = datetime.utcnow()
    await db.execute(delete(MateQueue).filter(MateQueue.expires_at < now))
    await db.commit()

async def get_active_user_mate_conversation(user_id: str, db: AsyncSession) -> Optional[MateConversation]:
    """Checks if the user is already participating in an active Mate conversation."""
    stmt = (
        select(MateConversation)
        .join(MateParticipant, MateConversation.id == MateParticipant.conversation_id)
        .filter(
            MateParticipant.user_id == user_id,
            MateParticipant.has_left == False,
            MateConversation.status == "active"
        )
    )
    res = await db.execute(stmt)
    return res.scalars().first()

async def find_or_enqueue_match(
    user_id: str,
    raw_interests: Union[str, List[str]],
    db: AsyncSession,
    hub
) -> Dict[str, Any]:
    """
    Core Matchmaking Engine:
    1. Normalizes user interests.
    2. Cleans up expired entries.
    3. Checks if user is already in an active Mate conversation.
    4. Searches existing queue for candidates with highest Jaccard similarity.
    5. If found: atomically creates MateConversation with anonymous animal nicknames and notifies both users.
    6. If not found: places user in MateQueue with a 5-minute server-authoritative expiration.
    """
    normalized = normalize_interests(raw_interests)
    if not normalized:
        return {"status": "error", "message": "Please enter at least one interest"}

    # 1. Clean expired entries
    await clean_expired_queue_entries(db)

    # 2. Check active conversation
    active_conv = await get_active_user_mate_conversation(user_id, db)
    if active_conv:
        return {
            "status": "already_matched",
            "conversation_id": active_conv.id,
            "message": "You are already in an active Mate conversation"
        }

    # 3. Query other active queue entries
    now = datetime.utcnow()
    stmt = select(MateQueue).filter(
        MateQueue.user_id != user_id,
        MateQueue.expires_at > now
    )
    res = await db.execute(stmt)
    queue_entries = res.scalars().all()

    candidates = []
    for entry in queue_entries:
        # Verify candidate is not already in an active conversation
        cand_active = await get_active_user_mate_conversation(entry.user_id, db)
        if cand_active:
            continue

        try:
            cand_interests = json.loads(entry.interests_json)
        except Exception:
            cand_interests = []

        score = calculate_jaccard_similarity(normalized, cand_interests)
        candidates.append((score, entry.created_at, entry))

    if candidates:
        # Sort by similarity score descending, then queue age ascending (older first)
        candidates.sort(key=lambda c: (-c[0], c[1]))
        best_score, _, best_candidate = candidates[0]

        # Atomically remove both users from queue
        await db.execute(
            delete(MateQueue).filter(
                or_(MateQueue.user_id == user_id, MateQueue.user_id == best_candidate.user_id)
            )
        )

        # Create unique Mate conversation
        new_conv = MateConversation(
            status="active",
            mutual_interest=False,
            created_at=datetime.utcnow()
        )
        db.add(new_conv)
        await db.flush()

        # Assign two distinct animal nicknames
        chosen_nicks = random.sample(ANIMAL_NICKNAMES, 2)
        nick_user1 = chosen_nicks[0]
        nick_user2 = chosen_nicks[1]

        p1 = MateParticipant(
            conversation_id=new_conv.id,
            user_id=user_id,
            nickname=nick_user1,
            is_interested=False
        )
        p2 = MateParticipant(
            conversation_id=new_conv.id,
            user_id=best_candidate.user_id,
            nickname=nick_user2,
            is_interested=False
        )
        db.add_all([p1, p2])
        await db.commit()

        # Real-time WebSocket notifications to both clients
        if hub:
            await hub.send_to_user(user_id, {
                "type": "mate_match_found",
                "conversation_id": new_conv.id,
                "your_nickname": nick_user1,
                "partner_nickname": nick_user2,
                "similarity_score": round(best_score * 100)
            })
            await hub.send_to_user(best_candidate.user_id, {
                "type": "mate_match_found",
                "conversation_id": new_conv.id,
                "your_nickname": nick_user2,
                "partner_nickname": nick_user1,
                "similarity_score": round(best_score * 100)
            })

        return {
            "status": "matched",
            "conversation_id": new_conv.id,
            "your_nickname": nick_user1,
            "partner_nickname": nick_user2,
            "similarity_score": round(best_score * 100)
        }

    # 4. No candidate right now: Add or update current user in queue with 5-minute timeout
    expires_at = now + timedelta(minutes=5)
    await db.execute(delete(MateQueue).filter(MateQueue.user_id == user_id))
    new_entry = MateQueue(
        user_id=user_id,
        interests_json=json.dumps(normalized),
        created_at=now,
        expires_at=expires_at
    )
    db.add(new_entry)
    await db.commit()

    return {
        "status": "searching",
        "expires_at": expires_at.isoformat(),
        "normalized_interests": normalized
    }
