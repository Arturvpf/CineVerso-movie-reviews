"""Endpoints de cadastro, login, sessão atual e saída."""

import asyncio
import hmac
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import service
from app.auth.avatars import prepare_avatar
from app.auth.dependencies import (
    Identity,
    check_origin,
    csrf_cookie_name,
    get_current_user,
    get_identity,
    session_cookie_name,
)
from app.auth.models import User
from app.auth.schemas import LoginInput, ProfileUpdateInput, RegisterInput, UserRead
from app.core.config import get_settings
from app.db.session import get_db

router = APIRouter()
MAX_AVATAR_BYTES = 2 * 1024 * 1024


def set_session_cookies(response: Response, token: str, csrf: str) -> None:
    response.headers["X-CSRF-Token"] = csrf
    response.headers["Cache-Control"] = "no-store"
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
async def me(
    request: Request, response: Response, identity: Identity = Depends(get_identity),
) -> User:
    csrf = request.cookies.get(csrf_cookie_name(), "")
    if csrf and hmac.compare_digest(service.digest(csrf), identity.session.csrf_hash):
        response.headers["X-CSRF-Token"] = csrf
    response.headers["Cache-Control"] = "no-store"
    return identity.user


@router.patch("/me", response_model=UserRead)
async def update_profile(
    payload: ProfileUpdateInput, user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> User:
    user.display_name = payload.display_name
    await db.commit()
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
    try:
        user.avatar_data = await asyncio.to_thread(prepare_avatar, data)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    user.avatar_mime = "image/png"
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
    request: Request, response: Response,
    db: AsyncSession = Depends(get_db),
) -> Response:
    check_origin(request)
    try:
        identity = await get_identity(request, db)
    except HTTPException as exc:
        if exc.status_code != 401:
            raise
    else:
        await db.delete(identity.session)
        await db.commit()
    secure = get_settings().environment != "local"
    response.delete_cookie(session_cookie_name(), path="/", secure=secure, httponly=True)
    response.delete_cookie(csrf_cookie_name(), path="/", secure=secure)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response
