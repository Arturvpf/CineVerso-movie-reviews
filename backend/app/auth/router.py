"""Endpoints de cadastro, login, sessão atual e saída."""

from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import service
from app.auth.dependencies import (
    Identity,
    check_origin,
    csrf_cookie_name,
    get_current_user,
    get_identity,
    session_cookie_name,
)
from app.auth.models import User
from app.auth.schemas import LoginInput, RegisterInput, UserRead
from app.core.config import get_settings
from app.db.session import get_db

router = APIRouter()
MAX_AVATAR_BYTES = 2 * 1024 * 1024


def avatar_mime(data: bytes) -> str | None:
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith(b"\xff\xd8\xff") and data.endswith(b"\xff\xd9"):
        return "image/jpeg"
    if data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        return "image/webp"
    return None


def set_session_cookies(response: Response, token: str, csrf: str) -> None:
    secure = get_settings().environment != "local"
    max_age = service.SESSION_DAYS * 24 * 60 * 60
    response.set_cookie(
        session_cookie_name(), token, max_age=max_age, httponly=True,
        secure=secure, samesite="lax", path="/",
    )
    response.set_cookie(
        csrf_cookie_name(), csrf, max_age=max_age, httponly=False,
        secure=secure, samesite="lax", path="/",
    )


@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def register(
    payload: RegisterInput, request: Request, response: Response,
    db: AsyncSession = Depends(get_db),
) -> User:
    check_origin(request)
    try:
        user = await service.register(db, payload)
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Email já cadastrado.") from exc
    token, csrf = await service.start_session(db, user)
    set_session_cookies(response, token, csrf)
    return user


@router.post("/login", response_model=UserRead)
async def login(
    payload: LoginInput, request: Request, response: Response,
    db: AsyncSession = Depends(get_db),
) -> User:
    check_origin(request)
    user = await service.authenticate(db, str(payload.email), payload.password)
    if user is None:
        raise HTTPException(status_code=401, detail="Email ou senha inválidos.")
    token, csrf = await service.start_session(db, user)
    set_session_cookies(response, token, csrf)
    return user


@router.get("/me", response_model=UserRead)
async def me(user: User = Depends(get_current_user)) -> User:
    return user


@router.put("/me/avatar", response_model=UserRead)
async def upload_avatar(
    file: Annotated[UploadFile, File()], user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> User:
    try:
        data = await file.read(MAX_AVATAR_BYTES + 1)
    finally:
        await file.close()
    if not data or len(data) > MAX_AVATAR_BYTES:
        raise HTTPException(status_code=413, detail="A foto deve ter no máximo 2 MB.")
    mime = avatar_mime(data)
    if mime is None:
        raise HTTPException(status_code=422, detail="Envie uma imagem PNG, JPEG ou WebP válida.")
    user.avatar_data = data
    user.avatar_mime = mime
    user.avatar_updated_at = service.utc_now()
    await db.commit()
    return user


@router.delete("/me/avatar", response_model=UserRead)
async def delete_avatar(
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
) -> User:
    user.avatar_data = None
    user.avatar_mime = None
    user.avatar_updated_at = None
    await db.commit()
    return user


@router.get("/users/{user_id}/avatar")
async def read_avatar(user_id: str, db: AsyncSession = Depends(get_db)) -> Response:
    row = (await db.execute(
        select(User.avatar_data, User.avatar_mime).where(User.id == user_id, User.is_active)
    )).one_or_none()
    if row is None or row.avatar_data is None or row.avatar_mime is None:
        raise HTTPException(status_code=404, detail="Foto de perfil não encontrada.")
    return Response(
        content=row.avatar_data, media_type=row.avatar_mime,
        headers={"X-Content-Type-Options": "nosniff", "Cache-Control": "public, max-age=60"},
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    response: Response, identity: Identity = Depends(get_identity),
    db: AsyncSession = Depends(get_db),
) -> Response:
    await db.delete(identity.session)
    await db.commit()
    response.delete_cookie(session_cookie_name(), path="/")
    response.delete_cookie(csrf_cookie_name(), path="/")
    response.status_code = status.HTTP_204_NO_CONTENT
    return response
