import os
import sys
from pathlib import Path

# Add project root directory to sys.path so 'app' can be resolved both from backend/ and backend/app/
current_dir = Path(__file__).resolve().parent
if current_dir.name == "app":
    backend_root = current_dir.parent
    if str(backend_root) not in sys.path:
        sys.path.insert(0, str(backend_root))

from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.future import select
import uvicorn
import datetime

from app.config import settings
from app.database import init_db, AsyncSessionLocal
from app.models.entities import User, Room, Message
from app.routers import auth as auth_router
from app.routers import chat as chat_router
from app.utils.hub import hub
from app.dependencies.auth import get_user_from_token_string

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize DB tables on startup
    await init_db()
    yield

app = FastAPI(
    title="PairUP API",
    description="Production-grade real-time chat with Google OAuth2, rooms, and 1-on-1 direct messaging",
    version="2.0.0",
    lifespan=lifespan
)

# Robust CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Allows local dev with vite (e.g. 5173, 5174, 3000)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(auth_router.router)
app.include_router(chat_router.router)

@app.get("/health")
def health():
    return {
        "status": "healthy",
        "service": "PairUP Engine",
        "timestamp": datetime.datetime.utcnow().isoformat()
    }

@app.get("/api/presence")
def get_presence():
    """Returns currently online user IDs."""
    return {"online_user_ids": list(hub.get_online_user_ids())}

# Real-time WebSocket Gateway
@app.websocket("/ws")
async def websocket_gateway(
    websocket: WebSocket,
    token: str = Query(...)
):
    async with AsyncSessionLocal() as db:
        user = await get_user_from_token_string(token, db)
        if not user:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

        user_info = {
            "id": user.id,
            "name": user.name,
            "username": user.username,
            "avatar": user.avatar,
            "gender": user.gender or "Prefer not to say",
            "provider": user.provider
        }

    # Register to Hub
    await hub.register(websocket, user_info)

    # Send initial ack and currently online users
    await websocket.send_json({
        "type": "connected",
        "user": user_info,
        "online_users": list(hub.get_online_user_ids())
    })

    current_room_slug = None

    try:
        while True:
            payload = await websocket.receive_json()
            if not isinstance(payload, dict):
                continue

            action = payload.get("action")

            if action == "join_room":
                room_slug = payload.get("room_slug")
                if room_slug:
                    slug = room_slug.lower()
                    if current_room_slug and current_room_slug != slug:
                        hub.leave_room(websocket, current_room_slug)
                    current_room_slug = slug
                    hub.join_room(websocket, slug)
                    await hub.broadcast_to_room(slug, {
                        "type": "room_notice",
                        "room_slug": slug,
                        "notice": f"{user_info['name']} joined #{slug}"
                    }, exclude_ws=websocket)

            elif action == "leave_room":
                if current_room_slug:
                    hub.leave_room(websocket, current_room_slug)
                    current_room_slug = None

            elif action == "send_room_message":
                room_slug = payload.get("room_slug")
                content = (payload.get("content") or "").strip()
                if room_slug and content and len(content) <= 5000:
                    slug = room_slug.lower()
                    
                    # Persist message to DB
                    msg_id = None
                    created_at_iso = datetime.datetime.utcnow().isoformat()
                    async with AsyncSessionLocal() as db:
                        res = await db.execute(select(Room).filter(Room.slug == slug))
                        room = res.scalars().first()
                        if room:
                            db_msg = Message(
                                sender_id=user_info["id"],
                                room_id=room.id,
                                content=content
                            )
                            db.add(db_msg)
                            await db.commit()
                            await db.refresh(db_msg)
                            msg_id = db_msg.id

                    # Broadcast to everyone in the room
                    msg_data = {
                        "type": "room_message",
                        "id": msg_id,
                        "room_slug": slug,
                        "content": content,
                        "sender_id": user_info["id"],
                        "sender_name": user_info["name"],
                        "sender_username": user_info["username"],
                        "sender_gender": user_info.get("gender", "Prefer not to say"),
                        "sender_avatar": user_info["avatar"],
                        "created_at": created_at_iso
                    }
                    await hub.broadcast_to_room(slug, msg_data)

            elif action == "send_direct_message":
                recipient_id = payload.get("recipient_id")
                content = (payload.get("content") or "").strip()
                if recipient_id and content and len(content) <= 5000:
                    # Enforce friendship rule: users must be friends before sending direct messages
                    from app.models.entities import Friendship
                    from sqlalchemy import or_, and_
                    can_message = False
                    async with AsyncSessionLocal() as db:
                        res_f = await db.execute(
                            select(Friendship).filter(
                                Friendship.status == "accepted",
                                or_(
                                    and_(Friendship.requester_id == user_info["id"], Friendship.addressee_id == recipient_id),
                                    and_(Friendship.requester_id == recipient_id, Friendship.addressee_id == user_info["id"])
                                )
                            )
                        )
                        if res_f.scalars().first():
                            can_message = True

                    if not can_message:
                        await websocket.send_json({
                            "type": "error",
                            "message": "You must be friends with this user to send direct messages. Add them as a friend first!"
                        })
                        continue

                    msg_id = None
                    created_at_iso = datetime.datetime.utcnow().isoformat()
                    async with AsyncSessionLocal() as db:
                        db_msg = Message(
                            sender_id=user_info["id"],
                            recipient_id=recipient_id,
                            content=content
                        )
                        db.add(db_msg)
                        await db.commit()
                        await db.refresh(db_msg)
                        msg_id = db_msg.id

                    msg_data = {
                        "type": "direct_message",
                        "id": msg_id,
                        "recipient_id": recipient_id,
                        "content": content,
                        "sender_id": user_info["id"],
                        "sender_name": user_info["name"],
                        "sender_username": user_info["username"],
                        "sender_gender": user_info.get("gender", "Prefer not to say"),
                        "sender_avatar": user_info["avatar"],
                        "created_at": created_at_iso
                    }
                    # Send to recipient and also send back to sender's sockets
                    await hub.send_to_user(recipient_id, msg_data)
                    await hub.send_to_user(user_info["id"], msg_data)

            elif action == "typing":
                # Handles typing indicators for rooms or direct chats
                room_slug = payload.get("room_slug")
                recipient_id = payload.get("recipient_id")
                is_typing = payload.get("is_typing", True)

                typing_data = {
                    "type": "typing_status",
                    "user_id": user_info["id"],
                    "username": user_info["username"],
                    "name": user_info["name"],
                    "is_typing": is_typing,
                    "room_slug": room_slug,
                    "recipient_id": recipient_id
                }
                if room_slug:
                    await hub.broadcast_to_room(room_slug, typing_data, exclude_ws=websocket)
                elif recipient_id:
                    await hub.send_to_user(recipient_id, typing_data)

    except WebSocketDisconnect:
        pass
    finally:
        logged_off_user = hub.unregister(websocket)
        if logged_off_user:
            await hub.broadcast_global({
                "type": "user_status",
                "user_id": logged_off_user["id"],
                "status": "offline"
            })
            # Purge instant pass guest account and data if they have closed all sessions
            if logged_off_user.get("provider") == "demo":
                async with AsyncSessionLocal() as db:
                    res_guest = await db.execute(select(User).filter(User.id == logged_off_user["id"]))
                    guest_obj = res_guest.scalars().first()
                    if guest_obj:
                        await db.delete(guest_obj)
                        await db.commit()

if __name__ == "__main__":
    uvicorn.run("app.server:app", host="127.0.0.1", port=8080, reload=True)