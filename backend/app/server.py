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
from collections import defaultdict, deque
import hmac
import secrets
import time
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query, Request, Depends, status
from fastapi.responses import Response, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.future import select
import uvicorn
import datetime

from app.config import settings
from app.database import init_db, AsyncSessionLocal
from app.models.entities import User, Room, Message, RoomModerator, RoomMember
from app.routers import auth as auth_router
from app.routers import chat as chat_router
from app.routers import mate as mate_router
from app.routers import admin as admin_router
from app.utils.hub import hub
from app.dependencies.auth import get_user_from_token_string, get_current_user

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize DB tables on startup
    await init_db()
    yield

is_prod = os.getenv("ENV", "development").lower() == "production"

app = FastAPI(
    title="PairUP API",
    description="Production-grade real-time chat with Google OAuth2, rooms, and 1-on-1 direct messaging",
    version="2.0.0",
    lifespan=lifespan,
    docs_url=None if is_prod else "/docs",
    redoc_url=None if is_prod else "/redoc",
    openapi_url=None if is_prod else "/openapi.json"
)

# Strict CORS Origins Configuration
_allowed_origins = {
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
    "http://localhost:8080",
    "http://127.0.0.1:8080",
    "https://pairup.cc",
    "https://www.pairup.cc",
}
if settings.FRONTEND_URL:
    for origin in settings.FRONTEND_URL.split(","):
        if origin.strip():
            _allowed_origins.add(origin.strip().rstrip("/"))

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(_allowed_origins),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "X-Requested-With", "X-CSRF-Token"],
)

CSRF_COOKIE_NAME = "pairup_csrf"
CSRF_HEADER_NAME = "x-csrf-token"
_STATE_CHANGING_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})

# O(1) amortized sliding-window rate limiter using collections.deque
_RATE_BUCKETS: dict[str, deque] = defaultdict(deque)
_MAX_RATE_KEYS = 10000


def _check_rate_limit(key: str, max_requests: int, window_sec: float = 60.0) -> bool:
    now = time.monotonic()
    if len(_RATE_BUCKETS) > _MAX_RATE_KEYS:
        # Evict oldest idle buckets to bound memory
        stale = [k for k, dq in _RATE_BUCKETS.items() if not dq or (now - dq[-1]) > window_sec]
        for k in stale[:2000]:
            _RATE_BUCKETS.pop(k, None)
    bucket = _RATE_BUCKETS[key]
    cutoff = now - window_sec
    while bucket and bucket[0] < cutoff:
        bucket.popleft()
    if len(bucket) >= max_requests:
        return False
    bucket.append(now)
    return True


def _get_client_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


@app.middleware("http")
async def security_and_csrf_middleware(request: Request, call_next):
    path = request.url.path
    method = request.method.upper()

    # 1. Sliding-window rate limiting on sensitive & mutating /api/ routes
    if path.startswith("/api/") and method in _STATE_CHANGING_METHODS:
        client_ip = _get_client_ip(request)
        if path.startswith("/api/auth/"):
            allowed = _check_rate_limit(f"auth:{client_ip}", max_requests=25, window_sec=60.0)
        elif path.startswith("/api/upload/"):
            allowed = _check_rate_limit(f"upload:{client_ip}", max_requests=15, window_sec=60.0)
        else:
            allowed = _check_rate_limit(f"mut:{client_ip}", max_requests=120, window_sec=60.0)
        if not allowed:
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many requests. Please slow down and try again shortly."}
            )

    # 2. Double-Submit Cookie CSRF protection on state-changing /api/ requests
    csrf_cookie = request.cookies.get(CSRF_COOKIE_NAME)
    if path.startswith("/api/") and method in _STATE_CHANGING_METHODS:
        csrf_header = request.headers.get(CSRF_HEADER_NAME)
        if not csrf_cookie or not csrf_header or not hmac.compare_digest(csrf_cookie, csrf_header):
            return JSONResponse(
                status_code=403,
                content={"detail": "CSRF token missing or invalid. Please refresh and try again."}
            )

    response = await call_next(request)

    # Ensure a CSRF cookie is issued on safe requests if not already set
    if method == "GET" and not csrf_cookie and path.startswith("/api/"):
        new_csrf = secrets.token_urlsafe(32)
        response.set_cookie(
            key=CSRF_COOKIE_NAME,
            value=new_csrf,
            httponly=False,
            samesite="lax",
            secure=is_prod,
            path="/",
            max_age=60 * 60 * 24 * 7,
        )

    # 3. Security Headers
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    if is_prod:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


@app.get("/api/csrf-token")
def get_csrf_token(request: Request):
    """Issues or echoes the Double-Submit CSRF token cookie for the frontend."""
    token_val = request.cookies.get(CSRF_COOKIE_NAME) or secrets.token_urlsafe(32)
    resp = JSONResponse({"csrf_token": token_val})
    resp.set_cookie(
        key=CSRF_COOKIE_NAME,
        value=token_val,
        httponly=False,
        samesite="lax",
        secure=is_prod,
        path="/",
        max_age=60 * 60 * 24 * 7,
    )
    return resp


# Include Routers
app.include_router(auth_router.router)
app.include_router(chat_router.router)
app.include_router(mate_router.router)
app.include_router(admin_router.router)

@app.get("/health")
def health():
    return {
        "status": "healthy",
        "service": "PairUP Engine",
        "timestamp": datetime.datetime.utcnow().isoformat()
    }


@app.get("/sitemap.xml", include_in_schema=False)
def serve_sitemap():
    xml_content = """<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://pairup.cc/</loc>
    <lastmod>2026-11-20</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://pairup.cc/about</loc>
    <lastmod>2026-11-20</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://pairup.cc/guidelines</loc>
    <lastmod>2026-11-20</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://pairup.cc/privacy</loc>
    <lastmod>2026-11-20</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
  <url>
    <loc>https://pairup.cc/terms</loc>
    <lastmod>2026-11-20</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
</urlset>"""
    return Response(content=xml_content, media_type="application/xml")


@app.get("/robots.txt", include_in_schema=False)
def serve_robots():
    robots_content = "User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\n\nSitemap: https://pairup.cc/sitemap.xml\n"
    return Response(content=robots_content, media_type="text/plain")


@app.get("/ads.txt", include_in_schema=False)
def serve_ads_txt():
    ads_content = "google.com, pub-4647904494238513, DIRECT, f08c47fec0942fa0\n"
    return Response(content=ads_content, media_type="text/plain")

@app.get("/api/presence")
def get_presence(_current_user: User = Depends(get_current_user)):
    """Returns currently online user IDs (authenticated users only)."""
    return {"online_user_ids": list(hub.get_online_user_ids())}

# Real-time WebSocket Gateway
@app.websocket("/ws")
async def websocket_gateway(
    websocket: WebSocket,
    token: str = Query(...)
):
    # Cross-Site WebSocket Hijacking (CSWSH) Origin validation
    origin = (websocket.headers.get("origin") or "").rstrip("/")
    host = websocket.headers.get("host") or ""
    if origin:
        same_host_origins = {f"http://{host}", f"https://{host}"} if host else set()
        if origin not in _allowed_origins and origin not in same_host_origins:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

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
            "provider": user.provider,
            "is_ghost": bool(getattr(user, "is_ghost", False))
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
                    slug = str(room_slug).lower().strip()
                    async with AsyncSessionLocal() as db:
                        res_r = await db.execute(select(Room).filter(Room.slug == slug))
                        target_room = res_r.scalars().first()
                        if not target_room:
                            continue
                        is_creator = (target_room.creator_id == user_info["id"])
                        res_mod = await db.execute(
                            select(RoomModerator).filter(
                                RoomModerator.room_id == target_room.id,
                                RoomModerator.user_id == user_info["id"]
                            )
                        )
                        res_mem = await db.execute(
                            select(RoomMember).filter(
                                RoomMember.room_id == target_room.id,
                                RoomMember.user_id == user_info["id"]
                            )
                        )
                        if not (is_creator or res_mod.scalars().first() or res_mem.scalars().first()):
                            continue
                    if current_room_slug and current_room_slug != slug:
                        hub.leave_room(websocket, current_room_slug)
                    current_room_slug = slug
                    hub.join_room(websocket, slug)

            elif action == "leave_room":
                if current_room_slug:
                    hub.leave_room(websocket, current_room_slug)
                    current_room_slug = None

            elif action == "send_room_message":
                room_slug = payload.get("room_slug")
                content = (payload.get("content") or "").strip()
                if room_slug and content and len(content) <= 5000:
                    slug = str(room_slug).lower().strip()
                    try:
                        # Persist message to DB and collect authorized participant IDs
                        msg_id = None
                        participant_user_ids = set()
                        created_at_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
                        async with AsyncSessionLocal() as db:
                            res = await db.execute(select(Room).filter(Room.slug == slug))
                            room = res.scalars().first()
                            if not room:
                                await websocket.send_json({
                                    "type": "error",
                                    "message": f"Room #{slug} not found."
                                })
                                continue

                            is_creator = (room.creator_id == user_info["id"])
                            res_mod = await db.execute(select(RoomModerator).filter(RoomModerator.room_id == room.id, RoomModerator.user_id == user_info["id"]))
                            res_mem = await db.execute(select(RoomMember).filter(RoomMember.room_id == room.id, RoomMember.user_id == user_info["id"]))
                            if not (is_creator or res_mod.scalars().first() or res_mem.scalars().first()):
                                msg_text = "This room is private. You must be an admitted member to send messages." if room.is_private else "You are not a participant in this room. Please join to send messages."
                                await websocket.send_json({
                                    "type": "error",
                                    "message": msg_text
                                })
                                continue

                            # Gather all authorized room participants so messages are NEVER leaked to non-members
                            if room.creator_id:
                                participant_user_ids.add(room.creator_id)
                            all_mods = await db.execute(select(RoomModerator.user_id).filter(RoomModerator.room_id == room.id))
                            for (m_uid,) in all_mods.all():
                                if m_uid:
                                    participant_user_ids.add(m_uid)
                            all_mems = await db.execute(select(RoomMember.user_id).filter(RoomMember.room_id == room.id))
                            for (mem_uid,) in all_mems.all():
                                if mem_uid:
                                    participant_user_ids.add(mem_uid)

                            db_msg = Message(
                                sender_id=user_info["id"],
                                room_id=room.id,
                                content=content
                            )
                            db.add(db_msg)
                            await db.commit()
                            await db.refresh(db_msg)
                            msg_id = db_msg.id

                        # Deliver strictly to authorized room participants
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
                        for uid in participant_user_ids:
                            await hub.send_to_user(uid, msg_data)
                    except Exception as e:
                        import logging
                        logging.getLogger("uvicorn.error").exception(f"Error sending room message in #{slug}: {e}")
                        await websocket.send_json({
                            "type": "error",
                            "message": "Failed to send message. Please try again."
                        })

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
                    created_at_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
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

            elif action == "send_mate_message":
                # Protected: Instant Pass users are blocked from Mate messaging
                if user_info.get("provider") == "demo":
                    await websocket.send_json({
                        "type": "error",
                        "message": "You should login to use these features."
                    })
                    continue

                conversation_id = payload.get("conversation_id")
                content = (payload.get("content") or "").strip()
                if conversation_id and content and len(content) <= 5000:
                    from app.models.entities import MateConversation, MateParticipant, MateMessage
                    async with AsyncSessionLocal() as db:
                        res_conv = await db.execute(
                            select(MateConversation).filter(MateConversation.id == conversation_id)
                        )
                        conv = res_conv.scalars().first()
                        if not conv or conv.status != "active":
                            await websocket.send_json({
                                "type": "error",
                                "message": "This Mate conversation has ended or is not active"
                            })
                            continue

                        res_parts = await db.execute(
                            select(MateParticipant).filter(MateParticipant.conversation_id == conversation_id)
                        )
                        participants = res_parts.scalars().all()
                        me = next((p for p in participants if p.user_id == user_info["id"]), None)
                        if not me or me.has_left:
                            await websocket.send_json({
                                "type": "error",
                                "message": "You are not an active participant in this conversation"
                            })
                            continue

                        partner = next((p for p in participants if p.user_id != user_info["id"]), None)
                        if not partner or partner.has_left:
                            await websocket.send_json({
                                "type": "error",
                                "message": "The other participant has left this conversation"
                            })
                            continue

                        db_msg = MateMessage(
                            conversation_id=conversation_id,
                            sender_id=user_info["id"],
                            sender_nickname=me.nickname,
                            content=content
                        )
                        db.add(db_msg)
                        await db.commit()
                        await db.refresh(db_msg)

                        created_at_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
                        mate_msg_data = {
                            "type": "mate_message",
                            "id": db_msg.id,
                            "conversation_id": conversation_id,
                            "sender_nickname": me.nickname,
                            "sender_id": user_info["id"],
                            "content": content,
                            "created_at": created_at_iso
                        }

                        # Deliver to both participants
                        await hub.send_to_user(me.user_id, mate_msg_data)
                        await hub.send_to_user(partner.user_id, mate_msg_data)

            elif action == "mate_typing":
                conversation_id = payload.get("conversation_id")
                is_typing = payload.get("is_typing", True)
                if conversation_id and user_info.get("provider") != "demo":
                    from app.models.entities import MateParticipant
                    async with AsyncSessionLocal() as db:
                        res_parts = await db.execute(
                            select(MateParticipant).filter(MateParticipant.conversation_id == conversation_id)
                        )
                        participants = res_parts.scalars().all()
                        me = next((p for p in participants if p.user_id == user_info["id"]), None)
                        partner = next((p for p in participants if p.user_id != user_info["id"]), None)
                        if me and partner and not me.has_left and not partner.has_left:
                            await hub.send_to_user(partner.user_id, {
                                "type": "mate_typing_status",
                                "conversation_id": conversation_id,
                                "nickname": me.nickname,
                                "is_typing": is_typing
                            })

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
            # Purge instant pass guest account while preserving their room messages as "Guest User"
            if logged_off_user.get("provider") == "demo":
                guest_id = logged_off_user["id"]
                async with AsyncSessionLocal() as db:
                    from sqlalchemy import update
                    try:
                        await db.execute(
                            update(Message)
                            .where(Message.sender_id == guest_id, Message.room_id.isnot(None))
                            .values(sender_id=None)
                        )
                    except Exception:
                        pass
                    res_guest = await db.execute(select(User).filter(User.id == guest_id))
                    guest_obj = res_guest.scalars().first()
                    if guest_obj:
                        await db.delete(guest_obj)
                        await db.commit()
                await hub.broadcast_global({
                    "type": "guest_purged",
                    "user_id": guest_id
                })

if __name__ == "__main__":
    import os, sys
    current_dir = os.path.dirname(os.path.abspath(__file__))
    parent_dir = os.path.dirname(current_dir)
    if parent_dir not in sys.path:
        sys.path.insert(0, parent_dir)
    uvicorn.run("app.server:app", host="0.0.0.0", port=8080, reload=True)