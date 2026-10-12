from fastapi import WebSocket
from typing import Dict, Set, Optional, Any
import json

class HubConnectionManager:
    """
    Production-ready WebSocket Connection Hub:
    - Supports room broadcast (e.g. #general)
    - Supports direct user-to-user routing (one-to-one chat)
    - Tracks user online status and multi-tab connections
    """
    def __init__(self):
        # user_id -> set of active WebSockets for this user (supports multiple devices/tabs)
        self.user_sockets: Dict[str, Set[WebSocket]] = {}
        # websocket -> user metadata dict: {"id": str, "name": str, "username": str, "avatar": str}
        self.socket_users: Dict[WebSocket, Dict[str, Any]] = {}
        # room_slug -> set of active WebSockets in that room
        self.room_sockets: Dict[str, Set[WebSocket]] = {}

    def get_online_user_ids(self) -> Set[str]:
        return set(self.user_sockets.keys())

    def get_room_online_count(self, room_slug: str) -> int:
        return len(self.room_sockets.get(room_slug.lower(), set()))

    async def register(self, websocket: WebSocket, user_info: Dict[str, Any]):
        await websocket.accept()
        user_id = user_info["id"]
        
        self.socket_users[websocket] = user_info
        if user_id not in self.user_sockets:
            self.user_sockets[user_id] = set()
        self.user_sockets[user_id].add(websocket)

        # Notify others that this user is online
        await self.broadcast_global({
            "type": "user_status",
            "user_id": user_id,
            "status": "online"
        }, exclude_ws=websocket)

    def unregister(self, websocket: WebSocket) -> Optional[Dict[str, Any]]:
        user_info = self.socket_users.pop(websocket, None)
        if not user_info:
            return None

        user_id = user_info["id"]
        if user_id in self.user_sockets:
            self.user_sockets[user_id].discard(websocket)
            if not self.user_sockets[user_id]:
                del self.user_sockets[user_id]
                # User has zero open tabs/connections: mark offline
                return user_info

        # Remove from any rooms
        for room_slug, ws_set in list(self.room_sockets.items()):
            ws_set.discard(websocket)
            if not ws_set:
                self.room_sockets.pop(room_slug, None)

        return None

    def join_room(self, websocket: WebSocket, room_slug: str):
        slug = room_slug.lower()
        if slug not in self.room_sockets:
            self.room_sockets[slug] = set()
        self.room_sockets[slug].add(websocket)

    def leave_room(self, websocket: WebSocket, room_slug: str):
        slug = room_slug.lower()
        if slug in self.room_sockets:
            self.room_sockets[slug].discard(websocket)

    async def broadcast_to_room(self, room_slug: str, data: dict, exclude_ws: Optional[WebSocket] = None):
        slug = room_slug.lower()
        sockets = list(self.room_sockets.get(slug, set()))
        for ws in sockets:
            if exclude_ws and ws == exclude_ws:
                continue
            try:
                await ws.send_json(data)
            except Exception:
                pass

    async def send_to_user(self, user_id: str, data: dict):
        """Sends a direct message to all active sockets of a target user."""
        sockets = list(self.user_sockets.get(user_id, set()))
        for ws in sockets:
            try:
                await ws.send_json(data)
            except Exception:
                pass

    async def broadcast_global(self, data: dict, exclude_ws: Optional[WebSocket] = None):
        for ws in list(self.socket_users.keys()):
            if exclude_ws and ws == exclude_ws:
                continue
            try:
                await ws.send_json(data)
            except Exception:
                pass

hub = HubConnectionManager()
