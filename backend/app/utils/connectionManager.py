from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        # self.active_connections: list[WebSocket] = []
        self.rooms: dict[str, dict[WebSocket, str]] = {}
        self.available_rooms: set[str] = {"general"}

    def create_room(self, room: str)-> bool:
        if room in self.available_rooms:
            return False
        self.available_rooms.add(room)
        return True

    def room_exists(self, room: str)-> bool:
        return room in self.available_rooms

    async def connect(self, websocket: WebSocket, room: str, username: str) -> bool:
        await websocket.accept()

        room_users = self.rooms.setdefault(room, {})

        if any(name.casefold() == username.casefold() for name in room_users.values()):
            await websocket.send_json(
                {"type": "error", "message": "Username already taken in this room"}
            )
            await websocket.close(code=1008)
            return False
        room_users[websocket] = username

        # await self.broadcast(
        #     room, {"type": "system", "message": f"{username} joined #{room}"}
        # )
        return True

    def disconnect(self, websocket: WebSocket, room: str):
        room_users = self.rooms.get(room)

        if not room_users:
            return None
        
        username = room_users.pop(websocket, None)

        if not room_users:
            self.rooms.pop(room, None)

        return username

    async def broadcast(self, room: str, data: dict):
        room_users = self.rooms.get(room, {})
        for connection in list(room_users):
            try:
                await connection.send_json(data)
            except Exception:
                self.disconnect(connection, room)

    async def send_message(self, websocket: WebSocket, room: str, message: str):
        username = self.rooms.get(room, {}).get(websocket)
        if username is None:
            return
        await self.broadcast(
            room,
            {"type": "message", "username": username, "room": room, "message": message},
        )
