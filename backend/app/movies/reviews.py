"""Avaliações: API em estrelas (0–5 na leitura), banco e CSVs na escala 0–10."""

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.movies.models import MovieReview
from app.movies.schemas import ReviewCreate, ReviewList, ReviewRead


def serialize_review(review: MovieReview) -> ReviewRead:
    return ReviewRead(
        sk_movie_review_id=review.sk_movie_review_id,
        sk_movie_id=review.sk_movie_id,
        nome=review.nome,
        nota=review.nota / 2,
        comentario=review.comentario,
        created_at=review.created_at,
    )


async def create_review(db: AsyncSession, movie_id: str, payload: ReviewCreate) -> ReviewRead:
    review = MovieReview(
        sk_movie_id=movie_id,
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


async def list_reviews(db: AsyncSession, movie_id: str) -> ReviewList:
    reviews = (
        await db.scalars(
            select(MovieReview)
            .where(MovieReview.sk_movie_id == movie_id)
            .order_by(MovieReview.created_at.desc(), MovieReview.sk_movie_review_id)
        )
    ).all()
    # Calcula sobre as mesmas linhas retornadas, sem usar o resumo importado DimReview.
    average = sum(review.nota for review in reviews) / (2 * len(reviews)) if reviews else None
    return ReviewList(
        items=[serialize_review(review) for review in reviews],
        total=len(reviews),
        media_avaliacoes=average,
    )
