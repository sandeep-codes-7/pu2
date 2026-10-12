import uuid
from datetime import datetime
from sqlalchemy import Column, String, Text, DateTime, ForeignKey, Boolean, UniqueConstraint
from sqlalchemy.orm import relationship
from app.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String(255), unique=True, index=True, nullable=False)
    name = Column(String(100), nullable=False)
    username = Column(String(50), unique=True, index=True, nullable=False)
    avatar = Column(String(500), nullable=True)
    gender = Column(String(20), default="Prefer not to say") # male, female, other, prefer not to say
    bio = Column(String(500), default="Hey there! I am pairing up on PairUP.")
    interests = Column(String(300), default="Coding, Gaming, Tech")
    provider = Column(String(50), default="google") # google or demo
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    sent_messages = relationship("Message", back_populates="sender", foreign_keys="Message.sender_id", cascade="all, delete-orphan")

class Friendship(Base):
    __tablename__ = "friendships"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    requester_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    addressee_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    status = Column(String(20), default="pending") # pending, accepted, declined
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
    topic = Column(String(255), nullable=True)
    is_private = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    messages = relationship("Message", back_populates="room", cascade="all, delete-orphan")

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
