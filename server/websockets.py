"""
Verde — WebSocket connection manager.

Tracks authenticated WebSocket connections and provides targeted broadcasting:
- send_to_user(user_id, message) — deliver to one user's connections
- broadcast_to_property(property_id, message, db, exclude_user_id=None) —
  deliver to every connected user who can see that property

Authentication is done via a `token` query parameter containing a valid JWT
access token. Connections without a valid token are closed immediately.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Optional

from fastapi import WebSocket, WebSocketDisconnect, status
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.orm import Session

logger = logging.getLogger("verde.ws")


class ConnectionManager:
    """Manages all active WebSocket connections."""

    def __init__(self, secret_key: str, algorithm: str = "HS256"):
        self.secret_key = secret_key
        self.algorithm = algorithm
        # user_id -> set of WebSocket connections
        self._connections: dict[str, set[WebSocket]] = {}
        # WebSocket -> user_id (for cleanup)
        self._ws_to_user: dict[WebSocket, str] = {}

    async def connect(
        self,
        websocket: WebSocket,
        token: str,
        db: Session,
    ) -> Optional[str]:
        """
        Authenticate and register a new WebSocket connection.
        Returns the user_id on success, None on failure.
        """
        try:
            payload = jwt.decode(token, self.secret_key, algorithms=[self.algorithm])
        except JWTError:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return None

        if payload.get("typ") != "access":
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return None

        user_id = payload.get("sub")
        if not user_id:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return None

        # Verify user still exists and is active
        from .main import User  # circular import avoidance
        user = db.get(User, user_id)
        if not user or not user.active:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return None

        await websocket.accept()
        if user_id not in self._connections:
            self._connections[user_id] = set()
        self._connections[user_id].add(websocket)
        self._ws_to_user[websocket] = user_id
        return user_id

    def disconnect(self, websocket: WebSocket) -> None:
        """Remove a connection from tracking."""
        user_id = self._ws_to_user.pop(websocket, None)
        if user_id and user_id in self._connections:
            self._connections[user_id].discard(websocket)
            if not self._connections[user_id]:
                del self._connections[user_id]

    async def send_to_user(self, user_id: str, message: dict[str, Any]) -> int:
        """
        Send a JSON message to all connections belonging to a user.
        Returns the number of connections the message was sent to.
        """
        connections = self._connections.get(user_id, set())
        if not connections:
            return 0
        data = json.dumps(message)
        sent = 0
        dead: list[WebSocket] = []
        for ws in connections:
            try:
                await ws.send_text(data)
                sent += 1
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)
        return sent

    async def broadcast_to_property(
        self,
        property_id: str,
        message: dict[str, Any],
        db: Session,
        exclude_user_id: Optional[str] = None,
    ) -> int:
        """
        Send a message to every connected user who can see the given property.
        Uses the same visible_property_ids logic as the REST API.
        Returns the number of connections notified.
        """
        from .main import Property, PropertyWorker, PropertyGroup, GroupMember, User

        # Find all users who can see this property
        owner_id = db.execute(
            select(Property.owner_id).where(Property.id == property_id)
        ).scalar_one_or_none()

        target_user_ids: set[str] = set()
        if owner_id:
            target_user_ids.add(owner_id)

        # Direct workers
        direct = db.execute(
            select(PropertyWorker.user_id).where(PropertyWorker.property_id == property_id)
        ).scalars()
        target_user_ids.update(direct)

        # Workers via groups
        via_group = db.execute(
            select(GroupMember.user_id)
            .join(PropertyGroup, PropertyGroup.group_id == GroupMember.group_id)
            .where(PropertyGroup.property_id == property_id)
        ).scalars()
        target_user_ids.update(via_group)

        if exclude_user_id:
            target_user_ids.discard(exclude_user_id)

        total_sent = 0
        for uid in target_user_ids:
            total_sent += await self.send_to_user(uid, message)
        return total_sent

    async def broadcast(self, message: dict[str, Any]) -> int:
        """Send a message to all connected users."""
        total = 0
        for user_id in list(self._connections.keys()):
            total += await self.send_to_user(user_id, message)
        return total

    @property
    def connection_count(self) -> int:
        """Total number of active connections."""
        return sum(len(s) for s in self._connections.values())

    @property
    def user_count(self) -> int:
        """Number of distinct users with active connections."""
        return len(self._connections)
