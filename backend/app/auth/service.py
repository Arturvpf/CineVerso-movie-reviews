"""Cadastro, verificação de senha e sessões revogáveis."""

import asyncio
import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from pwdlib import PasswordHash
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User, UserSession
from app.auth.schemas import RegisterInput
from app.movies.models import MovieCollection

password_hash = PasswordHash.recommended()
_DUMMY_HASH = password_hash.hash("senha-ficticia-para-comparacao")
SESSION_DAYS = 7


def digest(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def utc_now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


async def register(db: AsyncSession, payload: RegisterInput) -> User:
    user = User(
        id=uuid4().hex,
        email=str(payload.email).lower(),
        display_name=payload.display_name,
        password_hash=await asyncio.to_thread(password_hash.hash, payload.password),
        role="user",
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def create_admin(
    db: AsyncSession, email: str, display_name: str, password: str
) -> tuple[User, int]:
    user = User(
        id=uuid4().hex,
        email=email.lower(),
        display_name=display_name,
        password_hash=await asyncio.to_thread(password_hash.hash, password),
        role="admin",
        is_active=True,
    )
    db.add(user)
    await db.flush()
    result = await db.execute(
        update(MovieCollection)
        .where(MovieCollection.user_id.is_(None))
        .values(user_id=user.id)
    )
    await db.commit()
    await db.refresh(user)
    return user, result.rowcount


async def authenticate(db: AsyncSession, email: str, password: str) -> User | None:
    user = await db.scalar(select(User).where(User.email == email.lower()))
    stored_hash = user.password_hash if user and user.is_active else _DUMMY_HASH
    valid = await asyncio.to_thread(password_hash.verify, password, stored_hash)
    return user if user and user.is_active and valid else None


async def start_session(db: AsyncSession, user: User) -> tuple[str, str]:
    token = secrets.token_urlsafe(32)
    csrf = secrets.token_urlsafe(32)
    db.add(UserSession(
        token_hash=digest(token),
        user_id=user.id,
        csrf_hash=digest(csrf),
        expires_at=utc_now() + timedelta(days=SESSION_DAYS),
    ))
    await db.commit()
    return token, csrf
