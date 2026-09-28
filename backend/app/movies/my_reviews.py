"""Histórico de avaliações pertencentes à conta conectada."""

from datetime import datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.auth.models import User
from app.db.session import get_db
from app.movies.models import DimMovie, MovieReview

router = APIRouter()


class MyReviewRead(BaseModel):
    sk_movie_review_id: str
    sk_movie_id: str
    user_id: str
    movie_title: str
    movie_poster: str | None
    nome: str
    nota: float = Field(description="Nota em estrelas, de 0 a 5.")
    comentario: str
    created_at: datetime


class MyReviewPage(BaseModel):
    items: list[MyReviewRead]
    total: int
    page: int
    page_size: int
    total_pages: int


@router.get("/mine", response_model=MyReviewPage)
async def my_reviews(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MyReviewPage:
    total = await db.scalar(
        select(func.count()).select_from(MovieReview).where(MovieReview.user_id == user.id)
    ) or 0
    rows = (await db.execute(
        select(MovieReview, DimMovie.titulo, DimMovie.url_poster)
        .join(DimMovie, DimMovie.sk_movie_id == MovieReview.sk_movie_id)
        .where(MovieReview.user_id == user.id)
        .order_by(MovieReview.created_at.desc(), MovieReview.sk_movie_review_id.desc())
        .offset((page - 1) * page_size).limit(page_size)
    )).all()
    return MyReviewPage(
        items=[MyReviewRead(
            sk_movie_review_id=review.sk_movie_review_id,
            sk_movie_id=review.sk_movie_id,
            user_id=user.id,
            movie_title=title, movie_poster=poster,
            nome=review.nome, nota=review.nota / 2,
            comentario=review.comentario, created_at=review.created_at,
        ) for review, title, poster in rows],
        total=total, page=page, page_size=page_size,
        total_pages=(total + page_size - 1) // page_size,
    )
