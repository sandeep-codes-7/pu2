from pydantic import BaseModel, Field
from typing import Optional, List, Union
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
    friendship_status: Optional[str] = None  # None, "pending_sent", "pending_received", "accepted"
    friend_request_id: Optional[str] = None
    # Note: email is purposefully excluded from UserOut so emails are never exposed

    class Config:
        from_attributes = True

class UserProfileDetails(BaseModel):
    user: UserOut
    friendship_status: Optional[str] = None  # None, "pending_sent", "pending_received", "accepted"
    friends_count: int = 0
    friends: List[UserOut] = []
    pending_requests: List["FriendRequestOut"] = []

# Friendships
class FriendRequestCreate(BaseModel):
    addressee_id: str

class FriendRequestRespond(BaseModel):
    status: str  # "accepted", "declined", or "ignored"

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

# Room Moderator Schemas
class ModeratorOut(BaseModel):
    user_id: str
    username: str
    name: str
    avatar: Optional[str] = None
    is_prime: bool

    class Config:
        from_attributes = True

class AddModeratorPayload(BaseModel):
    user_id: Optional[str] = None
    username: Optional[str] = None

class RemoveModeratorPayload(BaseModel):
    user_id: str

class AddRoomMemberPayload(BaseModel):
    user_id: str

class RemoveRoomMemberPayload(BaseModel):
    user_id: str

# Room Schemas
class RoomCreate(BaseModel):
    slug: str = Field(..., min_length=1, max_length=50)
    title: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None

class RoomUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    picture: Optional[str] = None   # URL after image upload

class RoomOut(BaseModel):
    id: str
    slug: str
    title: str
    description: Optional[str] = None
    picture: Optional[str] = None
    creator_id: Optional[str] = None
    is_private: bool = False
    online_count: int = 0
    created_at: datetime
    moderators: List[ModeratorOut] = []

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


# ─────────────────────────────────────────────────────────────────
# MATE SCHEMAS
# ─────────────────────────────────────────────────────────────────
class MateQueueJoinRequest(BaseModel):
    interests: Union[str, List[str]] = Field(..., description="Comma-separated string or list of interests")


class MateQueueStatusResponse(BaseModel):
    status: str  # "idle", "searching", "matched"
    expires_at: Optional[datetime] = None
    conversation_id: Optional[str] = None
    normalized_interests: List[str] = []


class MateConversationDetail(BaseModel):
    id: str
    is_active: bool
    status: str = "active"
    mutual_interest: bool
    your_nickname: str
    my_nickname: str
    partner_nickname: str
    you_are_interested: bool
    my_interest: bool = False
    partner_interest: bool = False
    partner_has_left: bool
    you_have_left: bool
    has_left: bool = False
    partner_user_id: Optional[str] = None
    partner_profile: Optional[UserOut] = None  # Only populated when mutual_interest is True!
    created_at: datetime


class MateMessageOut(BaseModel):
    id: str
    conversation_id: str
    sender_nickname: str
    is_you: bool
    content: str
    created_at: datetime

