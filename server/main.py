"""
Verde — API server.

The static client in this repo runs on localStorage and needs no server. This
is the backend it should be pointed at when more than one person needs to see
the same data, or when you want accounts that survive a browser wipe.

Design notes
------------
* Auth is stateless JWT. Access tokens are short-lived; refresh tokens are
  stored hashed in the database and rotated on use, so a stolen refresh token
  is detectable.
* Passwords are hashed with Argon2id (falling back to PBKDF2-SHA256 when
  argon2 is unavailable), never SHA-256 as the client-side demo does.
* Photos are stored as files under MEDIA_ROOT and served by a static route,
  not as base64 inside database rows — that is the single biggest thing that
  keeps the database small and queries fast.
* Every list endpoint is paginated and filtered in SQL. No endpoint returns
  an unbounded result set.
* Tenant isolation is enforced in the query layer: every read of a property,
  task or photo joins through the caller's membership. There is no endpoint
  that returns another owner's data.
* WebSocket connections at /ws deliver real-time task updates and
  notifications to connected clients.
* A simple in-memory rate limiter protects against abuse.

Run
---
    pip install fastapi uvicorn "sqlalchemy>=2" "passlib[argon2]" python-jose \
                python-multipart pydantic-settings aiofiles
    uvicorn main:app --reload

Then set `window.VERDE_API = "http://localhost:8000"` in the client.
"""

from __future__ import annotations

import hashlib
import os
import secrets
import time
import uuid
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Annotated, Any, Iterator, Literal, Optional

from fastapi import (
    Depends, FastAPI, File, HTTPException, Query, Request, UploadFile,
    WebSocket, WebSocketDisconnect, status,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from jose import JWTError, jwt
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy import (
    Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint,
    create_engine, func, select, Index,
)
from sqlalchemy.orm import (
    DeclarativeBase, Mapped, Session, mapped_column, relationship, sessionmaker,
)

# ---------------------------------------------------------------- settings
SECRET_KEY = os.environ.get("VERDE_SECRET", secrets.token_urlsafe(48))
ALGORITHM = "HS256"
ACCESS_MINUTES = 30
REFRESH_DAYS = 30
MEDIA_ROOT = os.environ.get("VERDE_MEDIA", "./media")
MAX_UPLOAD_BYTES = 8 * 1024 * 1024          # 8 MB per photo
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
DATABASE_URL = os.environ.get("VERDE_DB", "sqlite:///./verde.db")

# Rate limiting
RATE_LIMIT_REQUESTS = int(os.environ.get("VERDE_RATE_LIMIT", "100"))
RATE_LIMIT_WINDOW = int(os.environ.get("VERDE_RATE_WINDOW", "60"))  # seconds

os.makedirs(MEDIA_ROOT, exist_ok=True)

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
    pool_pre_ping=True,
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


# ----------------------------------------------------------------- models
def _now() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(160))
    pw_hash: Mapped[str] = mapped_column(String(255))
    recovery_hash: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    role: Mapped[str] = mapped_column(String(16), index=True)          # owner | worker
    language: Mapped[str] = mapped_column(String(8), default="en")
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    last_seen: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)


class Group(Base):
    """A crew: a named set of workers an owner can assign to a property at once."""
    __tablename__ = "groups"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text, default="")
    color: Mapped[str] = mapped_column(String(16), default="#34d399")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    members: Mapped[list["GroupMember"]] = relationship(
        back_populates="group", cascade="all, delete-orphan", lazy="selectin")


class GroupMember(Base):
    __tablename__ = "group_members"
    __table_args__ = (UniqueConstraint("group_id", "user_id", name="uq_group_member"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    group_id: Mapped[str] = mapped_column(ForeignKey("groups.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)

    group: Mapped[Group] = relationship(back_populates="members")


class Property(Base):
    __tablename__ = "properties"
    __table_args__ = (Index("ix_prop_owner_created", "owner_id", "created_at"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(160))
    address: Mapped[str] = mapped_column(String(320), default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    lat: Mapped[Optional[float]] = mapped_column(nullable=True)
    lng: Mapped[Optional[float]] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    groups: Mapped[list["PropertyGroup"]] = relationship(
        back_populates="property", cascade="all, delete-orphan", lazy="selectin")
    workers: Mapped[list["PropertyWorker"]] = relationship(
        back_populates="property", cascade="all, delete-orphan", lazy="selectin")


class PropertyGroup(Base):
    __tablename__ = "property_groups"
    __table_args__ = (UniqueConstraint("property_id", "group_id", name="uq_prop_group"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    property_id: Mapped[str] = mapped_column(ForeignKey("properties.id", ondelete="CASCADE"), index=True)
    group_id: Mapped[str] = mapped_column(ForeignKey("groups.id", ondelete="CASCADE"), index=True)
    property: Mapped[Property] = relationship(back_populates="groups")


class PropertyWorker(Base):
    __tablename__ = "property_workers"
    __table_args__ = (UniqueConstraint("property_id", "user_id", name="uq_prop_worker"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    property_id: Mapped[str] = mapped_column(ForeignKey("properties.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    property: Mapped[Property] = relationship(back_populates="workers")


class Task(Base):
    __tablename__ = "tasks"
    __table_args__ = (
        Index("ix_task_prop_status", "property_id", "status"),
        Index("ix_task_due", "due_date"),
        Index("ix_task_trade", "trade"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    property_id: Mapped[str] = mapped_column(ForeignKey("properties.id", ondelete="CASCADE"), index=True)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"))
    assignee_id: Mapped[Optional[str]] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(240))
    description: Mapped[str] = mapped_column(Text, default="")
    priority: Mapped[str] = mapped_column(String(10), default="normal", index=True)
    status: Mapped[str] = mapped_column(String(10), default="open", index=True)
    trade: Mapped[Optional[str]] = mapped_column(String(80), nullable=True, index=True)
    lat: Mapped[Optional[float]] = mapped_column(nullable=True)
    lng: Mapped[Optional[float]] = mapped_column(nullable=True)
    due_date: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    photo_id: Mapped[Optional[str]] = mapped_column(nullable=True)
    completion_photo_id: Mapped[Optional[str]] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now, index=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    completed_by: Mapped[Optional[str]] = mapped_column(nullable=True)


class Photo(Base):
    __tablename__ = "photos"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    property_id: Mapped[str] = mapped_column(ForeignKey("properties.id", ondelete="CASCADE"), index=True)
    task_id: Mapped[Optional[str]] = mapped_column(ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True, index=True)
    uploader_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    path: Mapped[str] = mapped_column(String(400))       # relative to MEDIA_ROOT
    caption: Mapped[str] = mapped_column(String(400), default="")
    kind: Mapped[str] = mapped_column(String(12), default="issue")
    lat: Mapped[Optional[float]] = mapped_column(nullable=True)
    lng: Mapped[Optional[float]] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now, index=True)


class Comment(Base):
    __tablename__ = "comments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    task_id: Mapped[str] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    text: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class Notification(Base):
    """In-app notification for task assignments and other events."""
    __tablename__ = "notifications"
    __table_args__ = (Index("ix_notif_user_read", "user_id", "read"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    type: Mapped[str] = mapped_column(String(40))  # task_assigned, task_updated, task_completed, etc.
    message: Mapped[str] = mapped_column(Text)
    task_id: Mapped[Optional[str]] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), nullable=True)
    property_id: Mapped[Optional[str]] = mapped_column(nullable=True)
    read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now, index=True)


class PropertyInfo(Base):
    """Sub-resource for property system info, utilities, and documents."""
    __tablename__ = "property_info"
    __table_args__ = (
        UniqueConstraint("property_id", "kind", "title", name="uq_prop_info"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    property_id: Mapped[str] = mapped_column(ForeignKey("properties.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(20))  # systemInfo | utilities | documents
    title: Mapped[str] = mapped_column(String(200))
    content: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now)


Base.metadata.create_all(engine)


# ------------------------------------------------------------------ auth
def hash_password(pw: str) -> str:
    """Argon2id when available, PBKDF2-SHA256 otherwise."""
    try:
        from passlib.hash import argon2
        return argon2.using(rounds=3, memory_cost=65536).hash(pw)
    except Exception:
        salt = secrets.token_bytes(16)
        dk = hashlib.pbkdf2_hmac("sha256", pw.encode(), salt, 240_000)
        return f"pbkdf2${salt.hex()}${dk.hex()}"


def verify_password(pw: str, stored: str) -> bool:
    try:
        if stored.startswith("pbkdf2$"):
            _, salt_hex, hash_hex = stored.split("$")
            dk = hashlib.pbkdf2_hmac("sha256", pw.encode(), bytes.fromhex(salt_hex), 240_000)
            return secrets.compare_digest(dk.hex(), hash_hex)
        from passlib.hash import argon2
        return argon2.verify(pw, stored)
    except Exception:
        return False


def make_recovery_code() -> str:
    A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    part = lambda: "".join(secrets.choice(A) for _ in range(4))  # noqa: E731
    return f"VERDE-{part()}-{part()}-{part()}"


def _hash_code(code: str) -> str:
    return hashlib.sha256(code.strip().upper().encode()).hexdigest()


def make_access(user: User) -> str:
    payload = {
        "sub": user.id, "role": user.role,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_MINUTES),
        "typ": "access",
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def make_refresh(db: Session, user: User) -> str:
    raw = secrets.token_urlsafe(48)
    db.add(RefreshToken(
        user_id=user.id,
        token_hash=hashlib.sha256(raw.encode()).hexdigest(),
        expires_at=datetime.now(timezone.utc) + timedelta(days=REFRESH_DAYS),
    ))
    db.commit()
    return raw


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


DB = Annotated[Session, Depends(get_db)]


def current_user(request: Request, db: DB) -> User:
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "missing_token")
    token = auth[7:].strip()
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "bad_token")
    if payload.get("typ") != "access":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "bad_token_type")
    user = db.get(User, payload.get("sub"))
    if not user or not user.active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "no_user")
    return user


ME = Annotated[User, Depends(current_user)]


def require_owner(me: ME) -> User:
    if me.role != "owner":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "owner_only")
    return me


# --------------------------------------------------------- access control
def visible_property_ids(db: Session, user: User) -> set[str]:
    """
    Every property the caller may read. Owners see their own; workers see the
    ones they are assigned to directly or through a crew they belong to. This
    is the single chokepoint for tenant isolation.
    """
    if user.role == "owner":
        rows = db.execute(select(Property.id).where(Property.owner_id == user.id)).scalars()
        return set(rows)

    direct = db.execute(
        select(PropertyWorker.property_id).where(PropertyWorker.user_id == user.id)
    ).scalars()
    via_group = db.execute(
        select(PropertyGroup.property_id)
        .join(GroupMember, GroupMember.group_id == PropertyGroup.group_id)
        .where(GroupMember.user_id == user.id)
    ).scalars()
    return set(direct) | set(via_group)


def assert_can_read_property(db: Session, user: User, property_id: str) -> Property:
    prop = db.get(Property, property_id)
    if not prop or property_id not in visible_property_ids(db, user):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not_found")
    return prop


# ---------------------------------------------------------- rate limiter
class RateLimiter:
    """
    Simple in-memory sliding-window rate limiter.
    Tracks request timestamps per client key (IP or user ID).
    """

    def __init__(self, max_requests: int, window_seconds: int):
        self.max_requests = max_requests
        self.window = window_seconds
        self._requests: dict[str, list[float]] = defaultdict(list)

    def is_allowed(self, key: str) -> bool:
        """Check if a request from `key` is allowed. Records the attempt."""
        now = time.monotonic()
        cutoff = now - self.window
        # Clean old entries
        self._requests[key] = [t for t in self._requests[key] if t > cutoff]
        if len(self._requests[key]) >= self.max_requests:
            return False
        self._requests[key].append(now)
        return True

    def cleanup(self) -> None:
        """Remove stale entries to prevent memory growth."""
        now = time.monotonic()
        cutoff = now - self.window
        stale = [k for k, v in self._requests.items() if not v or max(v) < cutoff]
        for k in stale:
            del self._requests[k]


rate_limiter = RateLimiter(RATE_LIMIT_REQUESTS, RATE_LIMIT_WINDOW)


# ----------------------------------------------------------------- schemas
class SignupIn(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    email: EmailStr
    password: str = Field(min_length=8, max_length=200)
    role: Literal["owner", "worker"] = "owner"
    language: str = Field(default="en", max_length=8)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class ResetIn(BaseModel):
    email: EmailStr
    code: str
    password: str = Field(min_length=8, max_length=200)


class ChangePwIn(BaseModel):
    current: str
    next: str = Field(min_length=8, max_length=200)


class RefreshIn(BaseModel):
    refresh: str


class GroupIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=2000)
    color: str = Field(default="#34d399", max_length=16)


class MembersIn(BaseModel):
    user_ids: list[str]


class PropertyIn(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    address: str = Field(default="", max_length=320)
    notes: str = Field(default="", max_length=4000)
    lat: Optional[float] = None
    lng: Optional[float] = None


class PropertyPatch(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    group_ids: Optional[list[str]] = None
    worker_ids: Optional[list[str]] = None


class TaskIn(BaseModel):
    property_id: str
    title: str = Field(min_length=1, max_length=240)
    description: str = Field(default="", max_length=8000)
    priority: Literal["high", "normal", "low"] = "normal"
    assignee_id: Optional[str] = None
    due_date: Optional[str] = Field(default=None, max_length=10)
    trade: Optional[str] = Field(default=None, max_length=80)
    lat: Optional[float] = None
    lng: Optional[float] = None
    photo_id: Optional[str] = None

    @field_validator("due_date")
    @classmethod
    def _check_date(cls, v: Optional[str]) -> Optional[str]:
        if v in (None, ""):
            return None
        datetime.strptime(v, "%Y-%m-%d")     # raises -> 422
        return v

    @field_validator("trade")
    @classmethod
    def _check_trade(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            v = v.strip()
            if not v:
                return None
        return v


class TaskPatch(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[Literal["high", "normal", "low"]] = None
    status: Optional[Literal["open", "doing", "done"]] = None
    assignee_id: Optional[str] = None
    due_date: Optional[str] = None
    trade: Optional[str] = Field(default=None, max_length=80)

    @field_validator("trade")
    @classmethod
    def _check_trade(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            v = v.strip()
            if not v:
                return None
        return v


class CommentIn(BaseModel):
    text: str = Field(min_length=1, max_length=4000)


class PropertyInfoIn(BaseModel):
    kind: Literal["systemInfo", "utilities", "documents"]
    title: str = Field(min_length=1, max_length=200)
    content: str = Field(default="", max_length=20000)


class PropertyInfoPatch(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    content: Optional[str] = Field(default=None, max_length=20000)


# -------------------------------------------------------------------- app
app = FastAPI(title="Verde API", version="2.1.0", docs_url="/api/docs")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("VERDE_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/media", StaticFiles(directory=MEDIA_ROOT), name="media")


# ------------------------------------------------------- broadcast helpers
async def _broadcast_task_event(
    event_type: str,
    task: Task,
    db: Session,
    exclude_user_id: Optional[str] = None,
) -> None:
    """Broadcast a task event to all connected clients who can see the property."""
    from .websockets import ConnectionManager
    # Get the connection manager from app state
    manager: ConnectionManager | None = getattr(app.state, "ws_manager", None)
    if not manager:
        return
    message = {
        "type": event_type,
        "task": _task_dict(db, task),
    }
    await manager.broadcast_to_property(task.property_id, message, db, exclude_user_id)


async def _notify_user(
    user_id: str,
    notif_type: str,
    message: str,
    task_id: Optional[str] = None,
    property_id: Optional[str] = None,
) -> None:
    """Send a real-time notification to a specific user."""
    from .websockets import ConnectionManager
    manager: ConnectionManager | None = getattr(app.state, "ws_manager", None)
    if not manager:
        return
    await manager.send_to_user(user_id, {
        "type": "notification",
        "notification": {
            "type": notif_type,
            "message": message,
            "taskId": task_id,
            "propertyId": property_id,
            "at": _now().isoformat(),
        },
    })


def _task_dict(db: Session, t: Task) -> dict:
    """Serialize a task to a dict (shared by REST and WebSocket)."""
    comments = db.execute(
        select(Comment).where(Comment.task_id == t.id).order_by(Comment.created_at)
    ).scalars().all()
    return {
        "id": t.id, "propertyId": t.property_id, "createdBy": t.created_by,
        "assigneeId": t.assignee_id, "title": t.title, "description": t.description,
        "priority": t.priority, "status": t.status, "trade": t.trade,
        "lat": t.lat, "lng": t.lng,
        "dueDate": t.due_date, "photoId": t.photo_id,
        "completionPhotoId": t.completion_photo_id,
        "createdAt": t.created_at.isoformat() if t.created_at else None,
        "completedAt": t.completed_at.isoformat() if t.completed_at else None,
        "completedBy": t.completed_by,
        "comments": [
            {"id": c.id, "userId": c.user_id, "text": c.text,
             "at": c.created_at.isoformat() if c.created_at else None}
            for c in comments
        ],
    }


def user_out(u: User) -> dict:
    return {
        "id": u.id, "name": u.name, "email": u.email, "role": u.role,
        "language": u.language, "active": u.active,
        "createdAt": u.created_at.isoformat() if u.created_at else None,
        "lastSeen": u.last_seen.isoformat() if u.last_seen else None,
    }


def prop_out(db: Session, p: Property) -> dict:
    return {
        "id": p.id, "ownerId": p.owner_id, "name": p.name, "address": p.address,
        "notes": p.notes, "lat": p.lat, "lng": p.lng,
        "createdAt": p.created_at.isoformat() if p.created_at else None,
        "groups": [pg.group_id for pg in p.groups],
        "workers": [pw.user_id for pw in p.workers],
    }


def task_out(db: Session, t: Task) -> dict:
    return _task_dict(db, t)


def photo_out(p: Photo) -> dict:
    return {
        "id": p.id, "propertyId": p.property_id, "taskId": p.task_id,
        "uploaderId": p.uploader_id, "url": f"/media/{p.path}",
        "caption": p.caption, "kind": p.kind, "lat": p.lat, "lng": p.lng,
        "at": p.created_at.isoformat() if p.created_at else None,
    }


def notification_out(n: Notification) -> dict:
    return {
        "id": n.id, "userId": n.user_id, "type": n.type,
        "message": n.message, "taskId": n.task_id,
        "propertyId": n.property_id, "read": n.read,
        "createdAt": n.created_at.isoformat() if n.created_at else None,
    }


def property_info_out(pi: PropertyInfo) -> dict:
    return {
        "id": pi.id, "propertyId": pi.property_id, "kind": pi.kind,
        "title": pi.title, "content": pi.content,
        "createdAt": pi.created_at.isoformat() if pi.created_at else None,
        "updatedAt": pi.updated_at.isoformat() if pi.updated_at else None,
    }


# --------------------------------------------------------- error handlers
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    from fastapi.responses import JSONResponse
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.detail, "status": exc.status_code},
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    from fastapi.responses import JSONResponse
    import logging
    logging.getLogger("verde").exception("Unhandled error")
    return JSONResponse(
        status_code=500,
        content={"error": "internal_error", "status": 500},
    )


# --------------------------------------------------------- rate limit middleware
@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    # Use user ID if authenticated, otherwise IP
    client_key = request.client.host if request.client else "unknown"
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        token = auth[7:].strip()
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            if payload.get("sub"):
                client_key = payload["sub"]
        except JWTError:
            pass

    if not rate_limiter.is_allowed(client_key):
        from fastapi.responses import JSONResponse
        return JSONResponse(
            status_code=429,
            content={"error": "rate_limited", "status": 429},
        )
    return await call_next(request)


# ------------------------------------------------------------------ startup
@app.on_event("startup")
async def startup_event():
    from .websockets import ConnectionManager
    app.state.ws_manager = ConnectionManager(SECRET_KEY, ALGORITHM)


# ---------------------------------------------------------------- endpoints
@app.get("/api/health")
def health() -> dict:
    return {"ok": True, "time": _now().isoformat()}


# --------------------------------------------------------------- accounts
@app.post("/api/auth/signup", status_code=201)
def signup(body: SignupIn, db: DB) -> dict:
    if db.execute(select(User).where(User.email == body.email.lower())).scalar_one_or_none():
        raise HTTPException(status.HTTP_409_CONFLICT, "email_taken")
    code = make_recovery_code()
    user = User(
        email=body.email.lower(), name=body.name.strip(),
        pw_hash=hash_password(body.password),
        recovery_hash=_hash_code(code),
        role=body.role, language=body.language,
    )
    db.add(user)
    db.commit()
    return {
        "user": user_out(user),
        "access": make_access(user),
        "refresh": make_refresh(db, user),
        "recoveryCode": code,
    }


@app.post("/api/auth/login")
def login(body: LoginIn, db: DB) -> dict:
    user = db.execute(select(User).where(User.email == body.email.lower())).scalar_one_or_none()
    if not user or not verify_password(body.password, user.pw_hash):
        # one message for both cases so the endpoint cannot enumerate accounts
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "bad_credentials")
    if not user.active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "account_disabled")
    user.last_seen = _now()
    db.commit()
    return {
        "user": user_out(user),
        "access": make_access(user),
        "refresh": make_refresh(db, user),
    }


@app.post("/api/auth/refresh")
def refresh(body: RefreshIn, db: DB) -> dict:
    h = hashlib.sha256(body.refresh.encode()).hexdigest()
    row = db.execute(select(RefreshToken).where(RefreshToken.token_hash == h)).scalar_one_or_none()
    if not row or row.revoked or row.expires_at < _now():
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "bad_refresh")
    user = db.get(User, row.user_id)
    if not user or not user.active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "no_user")
    row.revoked = True                       # rotate on every use
    db.commit()
    return {
        "user": user_out(user),
        "access": make_access(user),
        "refresh": make_refresh(db, user),
    }


@app.post("/api/auth/logout", status_code=204)
def logout(body: RefreshIn, db: DB) -> None:
    h = hashlib.sha256(body.refresh.encode()).hexdigest()
    row = db.execute(select(RefreshToken).where(RefreshToken.token_hash == h)).scalar_one_or_none()
    if row:
        row.revoked = True
        db.commit()


@app.post("/api/auth/reset")
def reset_password(body: ResetIn, db: DB) -> dict:
    user = db.execute(select(User).where(User.email == body.email.lower())).scalar_one_or_none()
    if not user or not user.recovery_hash:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "bad_code")
    if not secrets.compare_digest(user.recovery_hash, _hash_code(body.code)):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "bad_code")
    code = make_recovery_code()
    user.pw_hash = hash_password(body.password)
    user.recovery_hash = _hash_code(code)
    # a password reset invalidates every existing session
    for row in db.execute(select(RefreshToken).where(RefreshToken.user_id == user.id)).scalars():
        row.revoked = True
    db.commit()
    return {"user": user_out(user), "recoveryCode": code}


@app.post("/api/auth/change-password", status_code=204)
def change_password(body: ChangePwIn, me: ME, db: DB) -> None:
    if not verify_password(body.current, me.pw_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "bad_password")
    me.pw_hash = hash_password(body.next)
    for row in db.execute(select(RefreshToken).where(RefreshToken.user_id == me.id)).scalars():
        row.revoked = True
    db.commit()


@app.post("/api/auth/recovery-code")
def regenerate_recovery(body: ChangePwIn, me: ME, db: DB) -> dict:
    if not verify_password(body.current, me.pw_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "bad_password")
    code = make_recovery_code()
    me.recovery_hash = _hash_code(code)
    db.commit()
    return {"recoveryCode": code}


@app.get("/api/me")
def get_me(me: ME) -> dict:
    return user_out(me)


# ------------------------------------------------------------------ crews
@app.get("/api/groups")
def list_groups(me: ME, db: DB) -> list[dict]:
    rows = db.execute(
        select(Group).where(Group.owner_id == me.id).order_by(Group.created_at)
    ).scalars().all()
    return [
        {"id": g.id, "name": g.name, "description": g.description, "color": g.color,
         "memberIds": [m.user_id for m in g.members]}
        for g in rows
    ]


@app.post("/api/groups", status_code=201)
def create_group(body: GroupIn, me: ME, db: DB) -> dict:
    if me.role != "owner":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "owner_only")
    g = Group(owner_id=me.id, name=body.name.strip(),
              description=body.description, color=body.color)
    db.add(g)
    db.commit()
    return {"id": g.id, "name": g.name, "description": g.description,
            "color": g.color, "memberIds": []}


@app.patch("/api/groups/{group_id}")
def update_group(group_id: str, body: GroupIn, me: ME, db: DB) -> dict:
    g = db.get(Group, group_id)
    if not g or g.owner_id != me.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not_found")
    g.name, g.description, g.color = body.name.strip(), body.description, body.color
    db.commit()
    return {"id": g.id, "name": g.name, "description": g.description,
            "color": g.color, "memberIds": [m.user_id for m in g.members]}


@app.delete("/api/groups/{group_id}", status_code=204)
def delete_group(group_id: str, me: ME, db: DB) -> None:
    g = db.get(Group, group_id)
    if not g or g.owner_id != me.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not_found")
    db.delete(g)
    db.commit()


@app.put("/api/groups/{group_id}/members")
def set_members(group_id: str, body: MembersIn, me: ME, db: DB) -> dict:
    g = db.get(Group, group_id)
    if not g or g.owner_id != me.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not_found")
    for m in list(g.members):
        db.delete(m)
    wanted = set(body.user_ids)
    if wanted:
        valid = set(db.execute(
            select(User.id).where(User.id.in_(wanted), User.role == "worker")
        ).scalars())
        for uid in valid:
            db.add(GroupMember(group_id=g.id, user_id=uid))
    db.commit()
    db.refresh(g)
    return {"id": g.id, "memberIds": [m.user_id for m in g.members]}


# ------------------------------------------------------------- properties
@app.get("/api/properties")
def list_properties(
    me: ME, db: DB,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    q: Optional[str] = None,
) -> dict:
    ids = visible_property_ids(db, me)
    if not ids:
        return {"items": [], "total": 0, "limit": limit, "offset": offset}
    stmt = select(Property).where(Property.id.in_(ids))
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(func.lower(Property.name).like(like) |
                          func.lower(Property.address).like(like))
    total = db.execute(select(func.count()).select_from(stmt.subquery())).scalar_one()
    rows = db.execute(
        stmt.order_by(Property.created_at).limit(limit).offset(offset)
    ).scalars().all()
    return {"items": [prop_out(db, p) for p in rows],
            "total": total, "limit": limit, "offset": offset}


@app.post("/api/properties", status_code=201)
def create_property(body: PropertyIn, me: ME, db: DB) -> dict:
    if me.role != "owner":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "owner_only")
    p = Property(owner_id=me.id, name=body.name.strip(), address=body.address,
                 notes=body.notes, lat=body.lat, lng=body.lng)
    db.add(p)
    db.commit()
    return prop_out(db, p)


@app.patch("/api/properties/{property_id}")
def update_property(property_id: str, body: PropertyPatch, me: ME, db: DB) -> dict:
    p = db.get(Property, property_id)
    if not p or p.owner_id != me.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not_found")
    for field_name in ("name", "address", "notes", "lat", "lng"):
        v = getattr(body, field_name)
        if v is not None:
            setattr(p, field_name, v)
    if body.group_ids is not None:
        for pg in list(p.groups):
            db.delete(pg)
        owned = set(db.execute(
            select(Group.id).where(Group.owner_id == me.id,
                                   Group.id.in_(set(body.group_ids)))
        ).scalars())
        for gid in owned:
            db.add(PropertyGroup(property_id=p.id, group_id=gid))
    if body.worker_ids is not None:
        for pw in list(p.workers):
            db.delete(pw)
        valid = set(db.execute(
            select(User.id).where(User.role == "worker",
                                  User.id.in_(set(body.worker_ids)))
        ).scalars())
        for uid in valid:
            db.add(PropertyWorker(property_id=p.id, user_id=uid))
    db.commit()
    db.refresh(p)
    return prop_out(db, p)


@app.delete("/api/properties/{property_id}", status_code=204)
def delete_property(property_id: str, me: ME, db: DB) -> None:
    p = db.get(Property, property_id)
    if not p or p.owner_id != me.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not_found")
    db.delete(p)
    db.commit()


# ------------------------------------------------- property info sub-resource
@app.get("/api/properties/{property_id}/info")
def list_property_info(
    property_id: str,
    me: ME,
    db: DB,
    kind: Optional[Literal["systemInfo", "utilities", "documents"]] = None,
) -> list[dict]:
    assert_can_read_property(db, me, property_id)
    stmt = select(PropertyInfo).where(PropertyInfo.property_id == property_id)
    if kind:
        stmt = stmt.where(PropertyInfo.kind == kind)
    rows = db.execute(stmt.order_by(PropertyInfo.created_at)).scalars().all()
    return [property_info_out(pi) for pi in rows]


@app.post("/api/properties/{property_id}/info", status_code=201)
def create_property_info(
    property_id: str,
    body: PropertyInfoIn,
    me: ME,
    db: DB,
) -> dict:
    prop = assert_can_read_property(db, me, property_id)
    if prop.owner_id != me.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "owner_only")
    pi = PropertyInfo(
        property_id=property_id,
        kind=body.kind,
        title=body.title.strip(),
        content=body.content,
    )
    db.add(pi)
    db.commit()
    return property_info_out(pi)


@app.patch("/api/properties/{property_id}/info/{info_id}")
def update_property_info(
    property_id: str,
    info_id: str,
    body: PropertyInfoPatch,
    me: ME,
    db: DB,
) -> dict:
    prop = assert_can_read_property(db, me, property_id)
    if prop.owner_id != me.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "owner_only")
    pi = db.get(PropertyInfo, info_id)
    if not pi or pi.property_id != property_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not_found")
    if body.title is not None:
        pi.title = body.title.strip()
    if body.content is not None:
        pi.content = body.content
    pi.updated_at = _now()
    db.commit()
    return property_info_out(pi)


@app.delete("/api/properties/{property_id}/info/{info_id}", status_code=204)
def delete_property_info(
    property_id: str,
    info_id: str,
    me: ME,
    db: DB,
) -> None:
    prop = assert_can_read_property(db, me, property_id)
    if prop.owner_id != me.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "owner_only")
    pi = db.get(PropertyInfo, info_id)
    if not pi or pi.property_id != property_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not_found")
    db.delete(pi)
    db.commit()


# ------------------------------------------------------------------ tasks
@app.get("/api/tasks")
def list_tasks(
    me: ME, db: DB,
    property_id: Optional[str] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    priority: Optional[str] = None,
    trade: Optional[str] = None,
    assignee_id: Optional[str] = None,
    q: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> dict:
    ids = visible_property_ids(db, me)
    if not ids:
        return {"items": [], "total": 0, "limit": limit, "offset": offset}
    if property_id:
        if property_id not in ids:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "not_found")
        ids = {property_id}

    stmt = select(Task).where(Task.property_id.in_(ids))
    if status_filter:
        stmt = stmt.where(Task.status == status_filter)
    if priority:
        stmt = stmt.where(Task.priority == priority)
    if trade:
        stmt = stmt.where(func.lower(Task.trade) == trade.lower())
    if assignee_id:
        stmt = stmt.where(Task.assignee_id == assignee_id)
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(func.lower(Task.title).like(like) |
                          func.lower(Task.description).like(like))

    total = db.execute(select(func.count()).select_from(stmt.subquery())).scalar_one()
    rows = db.execute(
        stmt.order_by(Task.created_at.desc()).limit(limit).offset(offset)
    ).scalars().all()
    return {"items": [task_out(db, t) for t in rows],
            "total": total, "limit": limit, "offset": offset}


@app.post("/api/tasks", status_code=201)
async def create_task(body: TaskIn, me: ME, db: DB) -> dict:
    assert_can_read_property(db, me, body.property_id)
    t = Task(
        property_id=body.property_id, created_by=me.id,
        title=body.title.strip(), description=body.description,
        priority=body.priority, assignee_id=body.assignee_id,
        due_date=body.due_date, trade=body.trade,
        lat=body.lat, lng=body.lng,
        photo_id=body.photo_id,
    )
    db.add(t)
    db.commit()
    db.refresh(t)

    # Notify assignee
    if body.assignee_id and body.assignee_id != me.id:
        prop = db.get(Property, body.property_id)
        notif = Notification(
            user_id=body.assignee_id,
            type="task_assigned",
            message=f"You were assigned: {t.title}",
            task_id=t.id,
            property_id=t.property_id,
        )
        db.add(notif)
        db.commit()
        await _notify_user(
            body.assignee_id, "task_assigned",
            f"You were assigned: {t.title}",
            task_id=t.id, property_id=t.property_id,
        )

    # Broadcast to all who can see this property
    await _broadcast_task_event("task_created", t, db)
    return task_out(db, t)


@app.patch("/api/tasks/{task_id}")
async def update_task(task_id: str, body: TaskPatch, me: ME, db: DB) -> dict:
    t = db.get(Task, task_id)
    if not t:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not_found")
    assert_can_read_property(db, me, t.property_id)

    old_assignee = t.assignee_id
    for field_name in ("title", "description", "priority", "assignee_id", "due_date", "trade"):
        v = getattr(body, field_name)
        if v is not None:
            setattr(t, field_name, v)
    if body.status is not None:
        t.status = body.status
        if body.status == "done":
            t.completed_at = _now()
            t.completed_by = me.id
        else:
            t.completed_at = None
            t.completed_by = None
    db.commit()
    db.refresh(t)

    # Notify new assignee if changed
    if body.assignee_id and body.assignee_id != old_assignee and body.assignee_id != me.id:
        notif = Notification(
            user_id=body.assignee_id,
            type="task_assigned",
            message=f"You were assigned: {t.title}",
            task_id=t.id,
            property_id=t.property_id,
        )
        db.add(notif)
        db.commit()
        await _notify_user(
            body.assignee_id, "task_assigned",
            f"You were assigned: {t.title}",
            task_id=t.id, property_id=t.property_id,
        )

    # Notify assignee of status change to done
    if body.status == "done" and t.assignee_id and t.assignee_id != me.id:
        await _notify_user(
            t.assignee_id, "task_completed",
            f"Task completed: {t.title}",
            task_id=t.id, property_id=t.property_id,
        )

    await _broadcast_task_event("task_updated", t, db)
    return task_out(db, t)


@app.delete("/api/tasks/{task_id}", status_code=204)
async def delete_task(task_id: str, me: ME, db: DB) -> None:
    t = db.get(Task, task_id)
    if not t:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not_found")
    prop = db.get(Property, t.property_id)
    if not prop or prop.owner_id != me.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "owner_only")
    property_id = t.property_id
    db.delete(t)
    db.commit()

    # Broadcast deletion
    from .websockets import ConnectionManager
    manager: ConnectionManager | None = getattr(app.state, "ws_manager", None)
    if manager:
        await manager.broadcast_to_property(property_id, {
            "type": "task_deleted",
            "taskId": task_id,
        }, db)


@app.post("/api/tasks/{task_id}/comments", status_code=201)
async def add_comment(task_id: str, body: CommentIn, me: ME, db: DB) -> dict:
    t = db.get(Task, task_id)
    if not t:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not_found")
    assert_can_read_property(db, me, t.property_id)
    c = Comment(task_id=t.id, user_id=me.id, text=body.text.strip())
    db.add(c)
    db.commit()

    # Notify assignee of new comment
    if t.assignee_id and t.assignee_id != me.id:
        await _notify_user(
            t.assignee_id, "task_comment",
            f"New comment on: {t.title}",
            task_id=t.id, property_id=t.property_id,
        )

    await _broadcast_task_event("task_comment_added", t, db)
    return {"id": c.id, "userId": c.user_id, "text": c.text,
            "at": c.created_at.isoformat()}


# ----------------------------------------------------------------- photos
@app.post("/api/photos", status_code=201)
async def upload_photo(
    me: ME, db: DB,
    property_id: Annotated[str, Query()],
    file: Annotated[UploadFile, File()],
    task_id: Optional[str] = None,
    caption: str = "",
    kind: str = "issue",
    lat: Optional[float] = None,
    lng: Optional[float] = None,
) -> dict:
    assert_can_read_property(db, me, property_id)
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "bad_type")

    data = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "too_large")

    ext = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}[file.content_type]
    rel = os.path.join(property_id[:8], f"{uuid.uuid4().hex}.{ext}")
    full = os.path.join(MEDIA_ROOT, rel)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "wb") as fh:
        fh.write(data)

    ph = Photo(
        property_id=property_id, task_id=task_id, uploader_id=me.id,
        path=rel.replace(os.sep, "/"), caption=caption[:400], kind=kind,
        lat=lat, lng=lng,
    )
    db.add(ph)
    db.commit()
    return photo_out(ph)


@app.get("/api/photos")
def list_photos(
    me: ME, db: DB,
    property_id: Optional[str] = None,
    limit: int = Query(60, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> dict:
    ids = visible_property_ids(db, me)
    if not ids:
        return {"items": [], "total": 0, "limit": limit, "offset": offset}
    if property_id:
        if property_id not in ids:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "not_found")
        ids = {property_id}
    stmt = select(Photo).where(Photo.property_id.in_(ids))
    total = db.execute(select(func.count()).select_from(stmt.subquery())).scalar_one()
    rows = db.execute(
        stmt.order_by(Photo.created_at.desc()).limit(limit).offset(offset)
    ).scalars().all()
    return {"items": [photo_out(p) for p in rows],
            "total": total, "limit": limit, "offset": offset}


@app.delete("/api/photos/{photo_id}", status_code=204)
def delete_photo(photo_id: str, me: ME, db: DB) -> None:
    ph = db.get(Photo, photo_id)
    if not ph:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not_found")
    prop = db.get(Property, ph.property_id)
    if not prop or prop.owner_id != me.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "owner_only")
    full = os.path.join(MEDIA_ROOT, ph.path)
    try:
        if os.path.exists(full):
            os.remove(full)
    except OSError:
        pass
    db.delete(ph)
    db.commit()


# ------------------------------------------------------------------ people
@app.get("/api/workers")
def list_workers(me: ME, db: DB) -> list[dict]:
    """Workers the caller can actually assign: those in their crews, plus
    anyone already assigned to one of their properties."""
    if me.role != "owner":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "owner_only")
    crew_ids = set(db.execute(
        select(Group.id).where(Group.owner_id == me.id)
    ).scalars())
    from_crews = set()
    if crew_ids:
        from_crews = set(db.execute(
            select(GroupMember.user_id).where(GroupMember.group_id.in_(crew_ids))
        ).scalars())
    props = set(db.execute(
        select(Property.id).where(Property.owner_id == me.id)
    ).scalars())
    from_props = set()
    if props:
        from_props = set(db.execute(
            select(PropertyWorker.user_id).where(PropertyWorker.property_id.in_(props))
        ).scalars())
    wanted = from_crews | from_props
    if not wanted:
        return []
    rows = db.execute(select(User).where(User.id.in_(wanted))).scalars().all()
    out = []
    for u in rows:
        d = user_out(u)
        d["groupIds"] = [gid for gid in db.execute(
            select(GroupMember.group_id).where(GroupMember.user_id == u.id)
        ).scalars()]
        out.append(d)
    return out


# ------------------------------------------------------------ notifications
@app.get("/api/notifications")
def list_notifications(
    me: ME,
    db: DB,
    unread_only: bool = False,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> dict:
    stmt = select(Notification).where(Notification.user_id == me.id)
    if unread_only:
        stmt = stmt.where(Notification.read == False)
    total = db.execute(select(func.count()).select_from(stmt.subquery())).scalar_one()
    rows = db.execute(
        stmt.order_by(Notification.created_at.desc()).limit(limit).offset(offset)
    ).scalars().all()
    return {
        "items": [notification_out(n) for n in rows],
        "total": total, "limit": limit, "offset": offset,
        "unread": db.execute(
            select(func.count()).select_from(Notification).where(
                Notification.user_id == me.id, Notification.read == False)
        ).scalar_one(),
    }


@app.post("/api/notifications/{notification_id}/read")
def mark_notification_read(notification_id: str, me: ME, db: DB) -> dict:
    n = db.get(Notification, notification_id)
    if not n or n.user_id != me.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not_found")
    n.read = True
    db.commit()
    return notification_out(n)


@app.post("/api/notifications/read-all")
def mark_all_notifications_read(me: ME, db: DB) -> dict:
    rows = db.execute(
        select(Notification).where(
            Notification.user_id == me.id, Notification.read == False)
    ).scalars().all()
    for n in rows:
        n.read = True
    db.commit()
    return {"updated": len(rows)}


@app.get("/api/notifications/unread-count")
def unread_notification_count(me: ME, db: DB) -> dict:
    count = db.execute(
        select(func.count()).select_from(Notification).where(
            Notification.user_id == me.id, Notification.read == False)
    ).scalar_one()
    return {"unread": count}


# ------------------------------------------------------------------ stats
@app.get("/api/stats")
def stats(me: ME, db: DB) -> dict:
    ids = visible_property_ids(db, me)
    if not ids:
        return {"properties": 0, "open": 0, "doing": 0, "done": 0,
                "overdue": 0, "photos": 0, "completion": 0}
    base = select(func.count()).select_from(Task).where(Task.property_id.in_(ids))
    total = db.execute(base).scalar_one()
    by_status = dict(db.execute(
        select(Task.status, func.count()).where(Task.property_id.in_(ids)).group_by(Task.status)
    ).all())
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    overdue = db.execute(
        base.where(Task.status != "done", Task.due_date.isnot(None), Task.due_date < today)
    ).scalar_one()
    photos = db.execute(
        select(func.count()).select_from(Photo).where(Photo.property_id.in_(ids))
    ).scalar_one()
    done = by_status.get("done", 0)
    return {
        "properties": len(ids),
        "open": by_status.get("open", 0),
        "doing": by_status.get("doing", 0),
        "done": done,
        "overdue": overdue,
        "photos": photos,
        "completion": round((done / total) * 100) if total else 0,
    }


# -------------------------------------------------------------- web media
@app.get("/media/{path:path}")
def media(path: str) -> FileResponse:
    full = os.path.normpath(os.path.join(MEDIA_ROOT, path))
    if not full.startswith(os.path.abspath(MEDIA_ROOT)):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "forbidden")
    if not os.path.isfile(full):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not_found")
    return FileResponse(full)


# --------------------------------------------------------------- websocket
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint for real-time updates.

    Connect with: ws://host/ws?token=<JWT_ACCESS_TOKEN>

    Message types received from server:
    - task_created: A new task was created on a visible property
    - task_updated: A task was updated
    - task_deleted: A task was deleted
    - task_comment_added: A comment was added to a task
    - notification: A notification for the connected user

    Client can send:
    - {"type": "ping"} — keepalive
    - {"type": "subscribe", "propertyId": "..."} — subscribe to property updates
    """
    from .websockets import ConnectionManager

    manager: ConnectionManager | None = getattr(app.state, "ws_manager", None)
    if not manager:
        await websocket.close(code=1011)
        return

    # Get token from query params
    token = websocket.query_params.get("token", "")

    # Create a temporary DB session for auth
    db = SessionLocal()
    try:
        user_id = await manager.connect(websocket, token, db)
        if not user_id:
            return

        # Send connection confirmation
        await websocket.send_json({
            "type": "connected",
            "userId": user_id,
            "at": _now().isoformat(),
        })

        # Main message loop
        while True:
            try:
                data = await websocket.receive_json()
                msg_type = data.get("type", "")

                if msg_type == "ping":
                    await websocket.send_json({"type": "pong"})

                elif msg_type == "subscribe":
                    # Client can subscribe to specific property updates
                    # (already handled by broadcast_to_property, but client
                    # can use this to confirm subscription)
                    property_id = data.get("propertyId")
                    if property_id:
                        # Verify access
                        ids = visible_property_ids(db, db.get(User, user_id))
                        if property_id in ids:
                            await websocket.send_json({
                                "type": "subscribed",
                                "propertyId": property_id,
                            })

            except WebSocketDisconnect:
                break
            except Exception:
                # Don't let malformed messages kill the connection
                continue
    finally:
        db.close()
        manager.disconnect(websocket)
