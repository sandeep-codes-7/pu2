import uuid
from datetime import datetime
from sqlalchemy import Column, String, Text, DateTime, ForeignKey, Boolean, UniqueConstraint, Integer
from sqlalchemy.orm import relationship
from app.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String(255), unique=True, index=True, nullable=False)
    name = Column(String(100), nullable=False)
    username = Column(String(50), unique=True, index=True, nullable=False)
    avatar = Column(String(500), nullable=True)  # URL or /uploads/avatars/<id>.ext
    gender = Column(String(20), default="Prefer not to say")  # male, female, other, prefer not to say
    bio = Column(String(500), default="Hey there! I am pairing up on PairUP.")
    interests = Column(String(300), default="Coding, Gaming, Tech")
    provider = Column(String(50), default="google")  # google or demo
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    sent_messages = relationship("Message", back_populates="sender", foreign_keys="Message.sender_id", cascade="all, delete-orphan")
    moderated_rooms = relationship("RoomModerator", back_populates="user", cascade="all, delete-orphan")


class Friendship(Base):
    __tablename__ = "friendships"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    requester_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    addressee_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    status = Column(String(20), default="pending")  # pending, accepted, declined
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    requester = relationship("User", foreign_keys=[requester_id])
    addressee = relationship("User", foreign_keys=[addressee_id])

    __table_args__ = (
        UniqueConstraint("requester_id", "addressee_id", name="uq_friendship_pair"),
    )


class Room(Base):
    __tablename__ = "rooms"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    slug = Column(String(100), unique=True, index=True, nullable=False)
    title = Column(String(150), nullable=False)
    description = Column(Text, nullable=True)  # Editable by moderators
    picture = Column(String(500), nullable=True)  # Room avatar/banner URL, set by moderators
    creator_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    is_private = Column(Boolean, default=False)
    invite_code = Column(String(50), nullable=True, unique=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    messages = relationship("Message", back_populates="room", cascade="all, delete-orphan")
    moderators = relationship("RoomModerator", back_populates="room", cascade="all, delete-orphan")
    creator = relationship("User", foreign_keys=[creator_id])


class RoomModerator(Base):
    """
    Tracks moderators for a room.
    is_prime=True indicates the creator / prime moderator who has full control.
    A room can have at most 5 moderators total (including prime).
    """
    __tablename__ = "room_moderators"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    room_id = Column(String(36), ForeignKey("rooms.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    is_prime = Column(Boolean, default=False)  # True = prime moderator (the creator)
    added_at = Column(DateTime, default=datetime.utcnow)

    room = relationship("Room", back_populates="moderators")
    user = relationship("User", back_populates="moderated_rooms")

    __table_args__ = (
        UniqueConstraint("room_id", "user_id", name="uq_room_moderator"),
    )


class RoomMember(Base):
    """
    Tracks explicit room membership (for private rooms or when moderators add/remove people).
    For public rooms this is informational; for private rooms it's enforced.
    """
    __tablename__ = "room_members"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    room_id = Column(String(36), ForeignKey("rooms.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    added_at = Column(DateTime, default=datetime.utcnow)
    added_by = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    __table_args__ = (
        UniqueConstraint("room_id", "user_id", name="uq_room_member"),
    )


class RoomAdmission(Base):
    """
    Admission requests for private rooms. When someone opens a private room invite link,
    they request admission. Room moderators can accept or reject.
    """
    __tablename__ = "room_admissions"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    room_id = Column(String(36), ForeignKey("rooms.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    status = Column(String(20), default="pending")  # pending, accepted, rejected
    created_at = Column(DateTime, default=datetime.utcnow)
    reviewed_at = Column(DateTime, nullable=True)
    reviewed_by = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    room = relationship("Room")
    user = relationship("User", foreign_keys=[user_id])
    reviewer = relationship("User", foreign_keys=[reviewed_by])

    __table_args__ = (
        UniqueConstraint("room_id", "user_id", name="uq_room_admission"),
    )


class Message(Base):
    __tablename__ = "messages"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    sender_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    # Either belongs to a room or direct one-to-one chat
    room_id = Column(String(36), ForeignKey("rooms.id", ondelete="CASCADE"), nullable=True)
    recipient_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=True)

    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    sender = relationship("User", foreign_keys=[sender_id], back_populates="sent_messages")
    recipient = relationship("User", foreign_keys=[recipient_id])
    room = relationship("Room", back_populates="messages")


# ─────────────────────────────────────────────────────────────────
# MATE: ANONYMOUS INTEREST-BASED MATCHING MODELS
# ─────────────────────────────────────────────────────────────────
class MateQueue(Base):
    """
    Tracks users currently in the 5-minute matchmaking queue.
    """
    __tablename__ = "mate_queue"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True, nullable=False)
    interests_json = Column(Text, nullable=False)  # JSON-encoded list of normalized lowercase strings
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=False, index=True)

    user = relationship("User")


class MateConversation(Base):
    """
    Anonymous 1-on-1 Mate chatroom between two matched users.
    """
    __tablename__ = "mate_conversations"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    status = Column(String(20), default="active")  # "active" or "ended"
    mutual_interest = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    ended_at = Column(DateTime, nullable=True)

    participants = relationship("MateParticipant", back_populates="conversation", cascade="all, delete-orphan")
    messages = relationship("MateMessage", back_populates="conversation", cascade="all, delete-orphan")


class MateParticipant(Base):
    """
    Participant in a Mate conversation with an assigned anonymous animal nickname.
    """
    __tablename__ = "mate_participants"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    conversation_id = Column(String(36), ForeignKey("mate_conversations.id", ondelete="CASCADE"), index=True, nullable=False)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    nickname = Column(String(50), nullable=False)
    is_interested = Column(Boolean, default=False)
    interested_at = Column(DateTime, nullable=True)
    has_left = Column(Boolean, default=False)
    left_at = Column(DateTime, nullable=True)

    conversation = relationship("MateConversation", back_populates="participants")
    user = relationship("User")

    __table_args__ = (
        UniqueConstraint("conversation_id", "user_id", name="uq_mate_conversation_user"),
    )


class MateMessage(Base):
    """
    Messages sent within an anonymous Mate chatroom.
    """
    __tablename__ = "mate_messages"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    conversation_id = Column(String(36), ForeignKey("mate_conversations.id", ondelete="CASCADE"), index=True, nullable=False)
    sender_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    sender_nickname = Column(String(50), nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    conversation = relationship("MateConversation", back_populates="messages")


# ─────────────────────────────────────────────────────────────────
# ADMIN PANEL, FEEDBACK & SITE MAINTENANCE MODELS
# ─────────────────────────────────────────────────────────────────
class AdminAccount(Base):
    """
    Stores administrators for the /admin portal.
    is_prime=True indicates the Prime Admin (e.g. 'sandeep') who can add/remove other admins.
    Admins can authenticate via username + password OR via Google OAuth (matched by email or username).
    """
    __tablename__ = "admin_accounts"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=True)
    name = Column(String(100), nullable=True)
    password_hash = Column(String(255), nullable=True)
    is_prime = Column(Boolean, default=False)
    added_by = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Feedback(Base):
    """
    User-submitted feedback from the floating button in the Announcements page.
    """
    __tablename__ = "feedbacks"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    user_name = Column(String(100), nullable=True)
    user_username = Column(String(50), nullable=True)
    user_avatar = Column(String(500), nullable=True)
    rating = Column(Integer, nullable=False)  # 1 to 5 stars
    comment = Column(Text, nullable=False)
    is_resolved = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


class SiteUpdateLog(Base):
    """
    Tracks website updates, changelog items, and deployments for the Admin Panel.
    """
    __tablename__ = "site_update_logs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    version = Column(String(50), nullable=True)
    title = Column(String(200), nullable=False)
    category = Column(String(50), default="Feature")  # Feature, UI/UX, Bug Fix, Security, Backend
    description = Column(Text, nullable=False)
    author_username = Column(String(50), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


class SiteSetting(Base):
    """
    Key-value store for global platform settings (e.g., maintenance_mode, maintenance_message).
    """
    __tablename__ = "site_settings"

    key = Column(String(100), primary_key=True)
    value = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


