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
    last_message: Optional[str] = None
    last_message_at: Optional[datetime] = None
    last_message_sender_id: Optional[str] = None
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
    is_private: Optional[bool] = False

class RoomUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    picture: Optional[str] = None   # URL after image upload
    is_private: Optional[bool] = None

class RoomOut(BaseModel):
    id: str
    slug: str
    title: str
    description: Optional[str] = None
    picture: Optional[str] = None
    creator_id: Optional[str] = None
    is_private: bool = False
    invite_code: Optional[str] = None
    online_count: int = 0
    created_at: Optional[datetime] = None
    moderators: List[ModeratorOut] = []
    is_member: Optional[bool] = True
    pending_admissions_count: Optional[int] = 0
    last_message: Optional[str] = None
    last_message_at: Optional[datetime] = None
    last_message_sender_name: Optional[str] = None
    last_message_sender_id: Optional[str] = None

    class Config:
        from_attributes = True

class RoomAdmissionOut(BaseModel):
    id: str
    room_id: str
    room_slug: str
    room_title: str
    user_id: str
    user_name: str
    user_username: str
    user_avatar: Optional[str] = None
    user_gender: Optional[str] = None
    name: Optional[str] = None
    username: Optional[str] = None
    avatar: Optional[str] = None
    gender: Optional[str] = None
    status: str
    created_at: datetime

    class Config:
        from_attributes = True

class RespondAdmissionPayload(BaseModel):
    status: str  # "accepted" or "rejected"

class JoinRoomPayload(BaseModel):
    code: Optional[str] = None

class NotificationItem(BaseModel):
    id: str
    type: str  # "friend_request" | "room_admission"
    title: str
    description: str
    avatar: Optional[str] = None
    user_id: Optional[str] = None
    user_name: Optional[str] = None
    user_username: Optional[str] = None
    room_slug: Optional[str] = None
    room_title: Optional[str] = None
    created_at: datetime
    raw_id: str

class NotificationListOut(BaseModel):
    items: List[NotificationItem] = []
    unread_count: int = 0

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


class MateTrendOut(BaseModel):
    topic: str
    count: int
    rank: Optional[int] = None


# ─────────────────────────────────────────────────────────────────
# FEEDBACK & ADMIN PANEL SCHEMAS
# ─────────────────────────────────────────────────────────────────
class FeedbackCreate(BaseModel):
    rating: int = Field(..., ge=1, le=5)
    comment: str = Field(..., min_length=1, max_length=3000)


class FeedbackOut(BaseModel):
    id: str
    user_id: Optional[str] = None
    user_name: Optional[str] = None
    user_username: Optional[str] = None
    user_avatar: Optional[str] = None
    rating: int
    comment: str
    is_resolved: bool = False
    created_at: datetime

    class Config:
        from_attributes = True


class AdminLoginRequest(BaseModel):
    username: str
    password: str


class AdminGoogleLoginRequest(BaseModel):
    credential: Optional[str] = None
    code: Optional[str] = None


class AdminOut(BaseModel):
    id: str
    username: str
    email: Optional[str] = None
    name: Optional[str] = None
    is_prime: bool = False
    added_by: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class AdminToken(BaseModel):
    access_token: str
    token_type: str = "bearer"
    admin: AdminOut


class AdminCreateRequest(BaseModel):
    username: str = Field(..., min_length=2, max_length=50)
    password: Optional[str] = None
    email: Optional[str] = None
    name: Optional[str] = None


class AdminUpdateSelfRequest(BaseModel):
    email: Optional[str] = None
    password: Optional[str] = None
    name: Optional[str] = None


class SiteUpdateCreate(BaseModel):
    version: Optional[str] = "v2.5"
    title: str = Field(..., min_length=1, max_length=200)
    category: Optional[str] = "Feature"
    description: str = Field(..., min_length=1, max_length=5000)


class SiteUpdateOut(BaseModel):
    id: str
    version: Optional[str] = None
    title: str
    category: str
    description: str
    author_username: str
    created_at: datetime

    class Config:
        from_attributes = True


class MaintenanceUpdateRequest(BaseModel):
    maintenance_mode: bool
    maintenance_message: Optional[str] = None


class MaintenanceStatusOut(BaseModel):
    maintenance_mode: bool
    maintenance_message: str


