from pydantic import BaseModel, Field

class ChatRoom(BaseModel):
    name: str = Field(min_length=1, max_length=30, pattern=r"^[a-zA-Z0-9_-]+$")