"""Avaliações: API em estrelas (0–5 na leitura), banco e CSVs na escala 0–10."""

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.movies.models import MovieReview
from app.movies.schemas import ReviewCreate, ReviewList, ReviewRead, ReviewUpdate


def serialize_review(review: MovieReview) -> ReviewRead:
    return ReviewRead(
        sk_movie_review_id=review.sk_movie_review_id,
        sk_movie_id=review.sk_movie_id,
        user_id=review.user_id,
        nome=review.nome,
        nota=review.nota / 2,
        comentario=review.comentario,
        created_at=review.created_at,
    )


async def create_review(
    db: AsyncSession, movie_id: str, payload: ReviewCreate, user_id: str
) -> ReviewRead:
    review = MovieReview(
        sk_movie_id=movie_id,
        user_id=user_id,
        nome=payload.nome,
        nota=payload.nota * 2,
        comentario=payload.comentario,
    )
    db.add(review)
    await db.commit()
    await db.refresh(review)
    return serialize_review(review)


async def get_summaries(
    db: AsyncSession, movie_ids: list[str]
) -> dict[str, tuple[int, float | None]]:
    if not movie_ids:
        return {}
    rows = await db.execute(
        select(MovieReview.sk_movie_id, func.count(), func.avg(MovieReview.nota) / 2)
        .where(MovieReview.sk_movie_id.in_(movie_ids))
        .group_by(MovieReview.sk_movie_id)
    )
    return {movie_id: (count, average) for movie_id, count, average in rows}


async def list_reviews(
    db: AsyncSession, movie_id: str, page: int = 1, page_size: int = 10
) -> ReviewList:
    total, raw_average = (await db.execute(
        select(func.count(), func.avg(MovieReview.nota)).where(MovieReview.sk_movie_id == movie_id)
    )).one()
    reviews = (
        await db.scalars(
            select(MovieReview)
            .where(MovieReview.sk_movie_id == movie_id)
            .order_by(MovieReview.created_at.desc(), MovieReview.sk_movie_review_id)
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).all()
    return ReviewList(
        items=[serialize_review(review) for review in reviews],
        total=total,
        media_avaliacoes=raw_average / 2 if raw_average is not None else None,
        page=page,
        page_size=page_size,
        total_pages=(total + page_size - 1) // page_size,
    )


async def get_review(db: AsyncSession, movie_id: str, review_id: str) -> MovieReview | None:
    return await db.scalar(
        select(MovieReview).where(
            MovieReview.sk_movie_id == movie_id,
            MovieReview.sk_movie_review_id == review_id,
        )
    )


async def update_review(
    db: AsyncSession, review: MovieReview, payload: ReviewUpdate
) -> ReviewRead:
    values = payload.model_dump(exclude_unset=True)
    if "nota" in values:
        values["nota"] *= 2
    for field, value in values.items():
        setattr(review, field, value)
    await db.commit()
    await db.refresh(review)
    return serialize_review(review)


async def delete_review(db: AsyncSession, review: MovieReview) -> None:
    await db.delete(review)
    await db.commit()
