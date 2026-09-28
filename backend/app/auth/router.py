"""Endpoints de cadastro, login, sessão atual e saída."""

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
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
