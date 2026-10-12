from pydantic import BaseModel, Field, EmailStr
from typing import Optional, List
from datetime import datetime

# Token Schemas
class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserOut"

class TokenPayload(BaseModel):
    sub: str  # user id
    email: Optional[str] = None
    exp: Optional[int] = None

# User Schemas
class UserBase(BaseModel):
    name: str
    username: str
    avatar: Optional[str] = None
    gender: Optional[str] = "Prefer not to say"
    bio: Optional[str] = "Hey there! I am pairing up on PairUP."
    interests: Optional[str] = "Coding, Gaming, Tech"
    provider: Optional[str] = "google"

class UserUpdate(BaseModel):
    name: Optional[str] = None
    username: Optional[str] = None
    avatar: Optional[str] = None
    gender: Optional[str] = None
    bio: Optional[str] = None
    interests: Optional[str] = None

class UserOut(BaseModel):
    id: str
    name: str
    username: str
    avatar: Optional[str] = None
    gender: Optional[str] = "Prefer not to say"
    bio: Optional[str] = "Hey there! I am pairing up on PairUP."
    interests: Optional[str] = "Coding, Gaming, Tech"
    provider: Optional[str] = "google"
    created_at: datetime
    # Note: email is purposefully excluded from UserOut so emails are never exposed

    class Config:
        from_attributes = True

class UserProfileDetails(BaseModel):
    user: UserOut
    friendship_status: Optional[str] = None # None, "pending_sent", "pending_received", "accepted"
    friends_count: int = 0
    friends: List[UserOut] = []
    pending_requests: List["FriendRequestOut"] = []

# Friendships
class FriendRequestCreate(BaseModel):
    addressee_id: str

class FriendRequestRespond(BaseModel):
    status: str # "accepted" or "declined"

class FriendRequestOut(BaseModel):
    id: str
    requester_id: str
    addressee_id: str
    status: str
    created_at: datetime
    requester: Optional[UserOut] = None
    addressee: Optional[UserOut] = None

    class Config:
        from_attributes = True

# Google Auth Code
class GoogleAuthRequest(BaseModel):
    credential: Optional[str] = None  # Google ID token or One-Tap JWT
    code: Optional[str] = None        # OAuth Authorization code

class DemoLoginRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=20)
    name: Optional[str] = None
    gender: Optional[str] = "Prefer not to say"

# Room Schemas
class RoomCreate(BaseModel):
    slug: str = Field(..., min_length=1, max_length=50)
    title: str = Field(..., min_length=1, max_length=100)
    topic: Optional[str] = None

class RoomOut(BaseModel):
    id: str
    slug: str
    title: str
    topic: Optional[str] = None
    online_count: int = 0
    created_at: datetime

    class Config:
        from_attributes = True

# Message Schemas
class MessageCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=5000)
    room_slug: Optional[str] = None
    recipient_id: Optional[str] = None

class MessageOut(BaseModel):
    id: str
    content: str
    sender_id: str
    sender_name: str
    sender_username: str
    sender_gender: Optional[str] = "Prefer not to say"
    sender_avatar: Optional[str] = None
    room_id: Optional[str] = None
    recipient_id: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

Token.update_forward_refs()
UserProfileDetails.update_forward_refs()
