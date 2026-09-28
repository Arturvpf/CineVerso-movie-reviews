"""Autenticação por cookie e proteção CSRF das operações de escrita."""

import hmac
from dataclasses import dataclass

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User, UserSession
from app.auth.service import digest, utc_now
from app.core.config import get_settings
from app.db.session import get_db


def session_cookie_name() -> str:
    if get_settings().environment == "local":
        return "rocketlab_session"
    return "__Host-rocketlab_session"


def csrf_cookie_name() -> str:
    return "rocketlab_csrf" if get_settings().environment == "local" else "__Host-rocketlab_csrf"


def check_origin(request: Request) -> None:
    origin = request.headers.get("origin")
    if origin is None:
        return
    local_origin = f"{request.url.scheme}://{request.url.netloc}"
    if origin not in get_settings().backend_cors_origins and origin != local_origin:
        raise HTTPException(status_code=403, detail="Origem não permitida.")


@dataclass
class Identity:
    user: User
    session: UserSession


async def get_identity(request: Request, db: AsyncSession = Depends(get_db)) -> Identity:
    token = request.cookies.get(session_cookie_name())
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Faça login para continuar."
        )
    row = await db.execute(
        select(UserSession, User)
        .join(User, User.id == UserSession.user_id)
        .where(UserSession.token_hash == digest(token))
    )
    match = row.one_or_none()
    if match is None:
        raise HTTPException(status_code=401, detail="Sessão inválida.")
    session, user = match
    if session.expires_at <= utc_now() or not user.is_active:
        raise HTTPException(status_code=401, detail="Sessão expirada.")
    if request.method not in {"GET", "HEAD", "OPTIONS"}:
        check_origin(request)
        csrf = request.headers.get("x-csrf-token", "")
        if not csrf or not hmac.compare_digest(digest(csrf), session.csrf_hash):
            raise HTTPException(status_code=403, detail="Token de segurança inválido.")
    return Identity(user=user, session=session)


async def get_current_user(identity: Identity = Depends(get_identity)) -> User:
    return identity.user


async def get_optional_user(request: Request, db: AsyncSession = Depends(get_db)) -> User | None:
    if not request.cookies.get(session_cookie_name()):
        return None
    return (await get_identity(request, db)).user


async def get_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Acesso exclusivo do administrador.")
    return user
